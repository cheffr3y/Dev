import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";
import { launchBrowser, browserBaseUrl } from "../harness.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient(),
  base = browserBaseUrl(),
  out = "/tmp/smoking-review",
  errors = [];
await mkdir(out, { recursive: true });
const screenshot = process.env.SMOKE_OCR_FIXTURE;
if (!screenshot)
  throw new Error(
    "Set SMOKE_OCR_FIXTURE to the supplied real thermometer screenshot for the release benchmark.",
  );
const browser = await launchBrowser();
let page;
async function login(role) {
  const context = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
    }),
    p = await context.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/login`);
  await p.getByLabel("Email", { exact: true }).fill(`${role}@local.test`);
  await p.getByLabel("Password", { exact: true }).fill("local-smoke-only");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL(`${base}/`);
  return p;
}
async function openDetails(p, name) {
  const summary = p.locator("summary").filter({ hasText: name }).first();
  if (!(await summary.evaluate((e) => e.parentElement.open)))
    await summary.click();
  return summary.locator("..");
}
try {
  page = await login("admin");
  await page.goto(`${base}/smoking`);
  await page
    .getByRole("heading", { name: "Smoking program", exact: true })
    .waitFor();
  await openDetails(page, "Start a smoker run");
  const runForm = page.getByRole("form", {
    name: "New smoker run",
    exact: true,
  });
  await runForm
    .getByLabel("Run name", { exact: true })
    .fill("QA mixed smoker run");
  await runForm.getByLabel("Run date", { exact: true }).fill("2026-11-01");
  const venue = await runForm
    .locator('select[name="venueId"] option')
    .nth(1)
    .getAttribute("value");
  assert.ok(venue);
  await runForm.getByLabel("Venue", { exact: true }).selectOption(venue);
  await runForm
    .getByLabel("Smoker / equipment", { exact: true })
    .fill("QA offset");
  await runForm
    .getByRole("button", { name: "Create smoker run", exact: true })
    .click();
  await page.waitForURL(/\/smoking\/[^/]+$/);
  const runUrl = page.url(),
    runId = runUrl.split("/").at(-1);
  await openDetails(page, "Add product lot");
  const add = page.getByRole("form", { name: "New product lot", exact: true });
  await add.getByLabel("Lot label", { exact: true }).fill("Brisket A");
  await add.getByLabel("Probe 1 name", { exact: true }).fill("T1");
  await add.getByLabel("Probe 1 type", { exact: true }).selectOption("FOOD");
  await add
    .getByRole("button", { name: "Add product lot", exact: true })
    .click();
  await page.getByRole("heading", { name: "Brisket A", exact: true }).waitFor();
  let lot = page.locator("section.smoke-lot").filter({
    has: page.getByRole("heading", { name: "Brisket A", exact: true }),
  });
  const lotId = (await lot.getAttribute("id")).slice(4);
  await openDetails(lot, "Attach lot photo / sheet");
  const upload = lot.getByRole("form", {
    name: "Attach smoking photo",
    exact: true,
  });
  await upload.locator("input[type=file]").setInputFiles(screenshot);
  await upload
    .getByRole("button", { name: "Attach source document", exact: true })
    .click();
  await page.locator(".smoke-gallery article").waitFor();
  let stored = await db.smokePhoto.findFirstOrThrow({ where: { runId } });
  const file = await page.request.get(
    `${base}/api/smoking/file?id=${stored.id}`,
  );
  assert.equal(file.status(), 200);
  assert.equal(file.headers()["cache-control"], "private, no-store");
  assert.equal((await file.body()).length, stored.data.length);
  await upload.locator("input[type=file]").setInputFiles(screenshot);
  await upload
    .getByRole("button", { name: "Attach source document", exact: true })
    .click();
  await upload.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(await db.smokePhoto.count({ where: { runId } }), 1);
  await openDetails(lot, "Edit lot / enter summary and actuals");
  const edit = lot.getByRole("form", { name: "Edit Brisket A", exact: true });
  await openDetails(edit, "Thermometer summary / local photo reading");
  await edit
    .getByLabel("Source photo", { exact: true })
    .selectOption(stored.id);
  const external = [],
    ocrRequests = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith(base) &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
    if (r.url().includes("/ocr/")) ocrRequests.push(r.url());
  });
  await edit
    .getByRole("button", { name: "Read photo locally", exact: true })
    .click();
  await edit.getByText(/Local recognition took/).waitFor({ timeout: 120000 });
  assert.equal(
    await edit
      .getByLabel("Device title / preset", { exact: true })
      .inputValue(),
    "Breast: Well Done",
  );
  assert.equal(
    await edit.getByLabel("Source date", { exact: true }).inputValue(),
    "2026-10-31",
  );
  assert.equal(
    await edit.getByLabel("Displayed target", { exact: true }).inputValue(),
    "165",
  );
  assert.equal(
    await edit.getByLabel("Reported peak", { exact: true }).inputValue(),
    "144.8",
  );
  assert.equal(
    await edit
      .getByLabel("Reported cooking duration (minutes)", { exact: true })
      .inputValue(),
    "382",
  );
  assert.equal(
    await edit
      .getByLabel("Reported temperature unit", { exact: true })
      .inputValue(),
    "F",
  );
  assert.deepEqual(external, []);
  assert.ok(ocrRequests.some((url) => url.includes("eng.traineddata")));
  const benchmark = await edit.getByText(/Local recognition took/).innerText();
  await page.screenshot({
    path: `${out}/local-ocr-desktop.png`,
    fullPage: true,
  });
  await edit.getByLabel("Summary probe name", { exact: true }).fill("T1");
  await edit
    .getByLabel("Summary probe type", { exact: true })
    .selectOption("FOOD");
  await edit.getByLabel("Raw quantity", { exact: true }).fill("20");
  await edit.getByLabel("Raw unit", { exact: true }).fill("lb");
  await edit.getByLabel("Finished usable quantity", { exact: true }).fill("12");
  await edit.getByLabel("Finished usable unit", { exact: true }).fill("lb");
  await edit
    .getByLabel("Correction / review reason", { exact: true })
    .fill("Checked original thermometer photo");
  await edit
    .getByRole("button", { name: "Save lot correction", exact: true })
    .click();
  await edit
    .getByRole("status")
    .filter({ hasText: /Confirm/ })
    .waitFor();
  await edit.getByLabel(/I checked the transcription/).check();
  await page.route(
    "**/api/smoking",
    async (route) => {
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  await edit
    .getByRole("button", { name: "Save lot correction", exact: true })
    .click();
  await edit
    .getByRole("status")
    .filter({ hasText: /fetch|interrupted|Failed/i })
    .waitFor();
  await edit
    .getByRole("button", { name: "Save lot correction", exact: true })
    .click();
  await lot.getByText(/Confirmed source transcription/).waitFor();
  assert.equal(
    (await db.smokeLot.findUniqueOrThrow({ where: { id: lotId } })).revision,
    1,
  );
  await openDetails(lot, "Add timestamped checkpoint");
  const check = lot.getByRole("form", { name: "Add checkpoint", exact: true });
  await check.getByLabel("Checkpoint", { exact: true }).selectOption("LOAD");
  await check
    .getByRole("button", { name: "Use current time", exact: true })
    .click();
  await check.getByLabel("Reading temperature", { exact: true }).fill("38");
  await check.getByLabel("Reading probe", { exact: true }).fill("T1");
  await check
    .getByLabel("Reading probe type", { exact: true })
    .selectOption("FOOD");
  await check
    .getByLabel("Correction / review reason", { exact: true })
    .fill("Loaded into smoker");
  await check
    .getByRole("button", { name: "Record checkpoint", exact: true })
    .click();
  await lot.locator(".smoke-reading").waitFor();
  const recorded = await db.smokeReading.findFirstOrThrow({ where: { lotId } }),
    currentLot = await db.smokeLot.findUniqueOrThrow({ where: { id: lotId } });
  const preciseAt = "2026-11-01T14:00:27.123Z";
  const precise = await page.request.post(`${base}/api/smoking`, {
    data: {
      action: "reading",
      operationId: crypto.randomUUID(),
      runId,
      lotId,
      revision: currentLot.revision,
      readingId: recorded.id,
      readingRevision: recorded.revision,
      data: { ...recorded.data, at: preciseAt },
      reason: "Source timestamp includes seconds",
    },
  });
  assert.equal(precise.status(), 200);
  await page.reload();
  await openDetails(lot, "Correct / void checkpoint");
  const correction = lot.getByRole("form", {
    name: "Correct checkpoint",
    exact: true,
  });
  await correction
    .getByLabel("Reading temperature", { exact: true })
    .fill("39");
  await correction
    .getByLabel("Correction / review reason", { exact: true })
    .fill("Corrected display value only");
  await correction
    .getByRole("button", { name: "Save checkpoint correction", exact: true })
    .click();
  await lot.getByText(/39°F/).first().waitFor();
  assert.equal(
    (await db.smokeReading.findUniqueOrThrow({ where: { id: recorded.id } }))
      .data.at,
    preciseAt,
  );
  await openDetails(page, "Add product lot");
  // A second product retains its own procedure and probes.
  const freshAdd = page.getByRole("form", {
    name: "New product lot",
    exact: true,
  });
  await freshAdd.getByLabel("Lot label", { exact: true }).fill("Cheese B");
  await freshAdd.getByLabel("Product", { exact: true }).fill("Cheddar cheese");
  await freshAdd
    .getByLabel("Smoking method", { exact: true })
    .selectOption("COLD");
  await freshAdd.getByLabel("Probe 1 name", { exact: true }).fill("T5");
  await freshAdd
    .getByRole("button", { name: "Add product lot", exact: true })
    .click();
  await page.getByRole("heading", { name: "Cheese B", exact: true }).waitFor();
  const print = await page.context().newPage();
  await print.goto(`${runUrl}/print`);
  await print
    .getByRole("heading", { name: "Brisket · Hot smoking", exact: true })
    .waitFor();
  assert.equal(await print.locator("svg[data-qr-url]").count(), 2);
  assert.ok(
    (
      await print
        .locator("svg[data-qr-url]")
        .first()
        .getAttribute("data-qr-url")
    ).includes(`lot=${lotId}#lot-${lotId}`),
  );
  for (const svg of await print.locator("svg[data-qr-url]").all()) {
    const pixels = await svg.evaluate(async (element) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 384;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.outerHTML)}`;
      await image.decode();
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, 384, 384);
      return Array.from(context.getImageData(0, 0, 384, 384).data);
    });
    const decoded = jsQR(new Uint8ClampedArray(pixels), 384, 384);
    assert.ok(decoded, "Printed QR must decode independently");
    assert.equal(decoded.data, await svg.getAttribute("data-qr-url"));
  }
  await print.emulateMedia({ media: "print" });
  assert.ok(
    await print
      .locator("td")
      .evaluateAll((cells) =>
        cells.every((c) => c.getBoundingClientRect().height >= 28),
      ),
  );
  await print.pdf({
    path: `${out}/mixed-smoke-sheets.pdf`,
    format: "Letter",
    printBackground: true,
  });
  assert.equal(
    (
      await PDFDocument.load(await readFile(`${out}/mixed-smoke-sheets.pdf`))
    ).getPageCount(),
    2,
    "Short mixed-run sheets should print one page per lot",
  );
  await print.screenshot({ path: `${out}/print.png`, fullPage: true });
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: await page.context().storageState(),
    }),
    phone = await mobile.newPage();
  await phone.goto(runUrl);
  await phone
    .getByRole("heading", { name: "Brisket A", exact: true })
    .waitFor();
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await phone.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  // A throttled browser exercises recognition and cancellation without external processing.
  const session = await phone.context().newCDPSession(phone);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const phoneLot = phone.locator(`#lot-${lotId}`);
  await openDetails(phoneLot, "Edit lot / enter summary and actuals");
  const pe = phoneLot.getByRole("form", {
    name: "Edit Brisket A",
    exact: true,
  });
  await pe
    .getByRole("button", { name: "Read photo locally", exact: true })
    .click();
  await pe
    .getByRole("button", { name: "Cancel recognition", exact: true })
    .click();
  await pe.getByText(/Recognition cancelled/).waitFor();
  await pe
    .getByRole("button", { name: "Read photo locally", exact: true })
    .click();
  await pe.getByText(/Local recognition took/).waitFor({ timeout: 120000 });
  const phoneBenchmark = await pe
    .getByText(/Local recognition took/)
    .innerText();
  assert.equal(
    await pe.getByLabel("Reported peak", { exact: true }).inputValue(),
    "144.8",
  );
  await phone.route("**/ocr/worker.min.js", (route) => route.abort());
  await pe
    .getByRole("button", { name: "Read photo locally", exact: true })
    .click();
  await pe.getByText(/Enter manually or retry/).waitFor({ timeout: 30000 });
  assert.equal(
    await pe.getByLabel("Reported peak", { exact: true }).inputValue(),
    "144.8",
  );
  await openDetails(page, "Repeat this setup");
  const repeat = page.getByRole("form", {
    name: "Repeat smoker setup",
    exact: true,
  });
  await repeat.getByLabel("Run name", { exact: true }).fill("QA repeat cook");
  await repeat.getByLabel("Run date", { exact: true }).fill("2026-11-02");
  await repeat.getByLabel("Venue", { exact: true }).selectOption(venue);
  await repeat
    .getByLabel("Smoker / equipment", { exact: true })
    .fill("QA offset");
  await repeat
    .getByRole("button", { name: "Create from this setup", exact: true })
    .click();
  await page.waitForURL(
    (u) => u.href !== runUrl && /\/smoking\/[^/]+$/.test(u.pathname),
  );
  const copied = await db.smokeRun.findUniqueOrThrow({
    where: { id: page.url().split("/").at(-1) },
    include: { lots: true, photos: true },
  });
  assert.equal(copied.lots.length, 2);
  assert.equal(copied.photos.length, 0);
  assert.ok(
    copied.lots.every(
      (l) =>
        l.data.actual.summary === null &&
        l.data.actual.raw === null &&
        l.data.status === "OPEN",
    ),
  );
  const anon = await browser.newContext(),
    ap = await anon.newPage();
  assert.equal(
    (await ap.request.get(`${base}/api/smoking/file?id=${stored.id}`)).status(),
    401,
  );
  assert.equal(
    (await ap.request.post(`${base}/api/smoking`, { data: {} })).status(),
    401,
  );
  // Printed lot links survive an expired session and return to that specific lot.
  await ap.goto(`${runUrl}?lot=${lotId}#lot-${lotId}`);
  await ap.waitForURL(
    (u) =>
      u.pathname === "/login" &&
      u.searchParams.get("returnTo") === `/smoking/${runId}?lot=${lotId}`,
  );
  await ap.getByLabel("Email", { exact: true }).fill("admin@local.test");
  await ap.getByLabel("Password", { exact: true }).fill("local-smoke-only");
  await ap.getByRole("button", { name: "Sign in", exact: true }).click();
  await ap.waitForURL(
    (u) =>
      u.pathname === `/smoking/${runId}` && u.searchParams.get("lot") === lotId,
  );
  await ap.getByRole("heading", { name: "Brisket A", exact: true }).waitFor();
  await ap.waitForFunction((id) => {
    const element = document.getElementById(`lot-${id}`);
    return element && element.getBoundingClientRect().top < 150;
  }, lotId);
  const staff = await login("staff");
  assert.equal(
    (
      await staff.request.get(`${base}/api/smoking/file?id=${stored.id}`)
    ).status(),
    404,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        message:
          "Mixed product lots, uploads, duplicate detection, actual OCR, explicit confirmation, lost-response recovery, checkpoints, mobile layout, cancellation/retry/failure, print QR and copy resets passed.",
        desktop: benchmark,
        phoneCpu4x: phoneBenchmark,
        externalRequests: external,
        assets: ocrRequests,
        artifacts: out,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
