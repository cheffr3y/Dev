import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import jsQR from "jsqr";
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/prep_workflow_test");
const db = new PrismaClient(), base = "http://localhost:3107", output = process.env.JOB_REVIEW_DIR || "/tmp/production-job-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}) });
const contexts = [], errors = [];
async function context(mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 } }); contexts.push(ctx);
  const page = await ctx.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message)); return page;
}
async function signIn(page, role, after = `${base}/`) {
  await page.getByLabel("Email").fill(`${role}@local.test`); await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(after);
}
async function decode(svg) {
  const result = await svg.evaluate(async element => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 384;
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.outerHTML)}`;
    await image.decode(); const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, 384, 384);
    return Array.from(context.getImageData(0, 0, 384, 384).data);
  });
  const resultCode = jsQR(new Uint8ClampedArray(result), 384, 384);
  assert.ok(resultCode, "Rendered SVG must decode independently");
  assert.equal(resultCode.data, await svg.getAttribute("data-qr-url")); return resultCode.data;
}
try {
  const prepLine = await db.prepOrderLine.findFirstOrThrow({ where: { prepOrderId: "clipboard-order" } });
  const banquetLine = await db.banquetMenuItem.findFirstOrThrow({ where: { banquetId: "clipboard-banquet" } });
  const original = JSON.stringify(await db.prepPacketSnapshot.findUniqueOrThrow({ where: { scope: "clipboard-order" } }));
  const beforeBatches = await db.productionBatch.count(), beforeTransfers = await db.stockTransfer.count();
  const admin = await context(); await admin.goto(`${base}/login`); await signIn(admin, "admin");
  await admin.goto(`${base}/prep-orders/clipboard-order/packet?scale=2&density=compact`);
  const prepSvg = admin.locator('.production-job-qr svg[data-qr-url*="prep="]').first();
  const scanUrl = await decode(prepSvg);
  assert.equal(new URL(scanUrl).searchParams.get("prep"), prepLine.id); assert.equal(new URL(scanUrl).searchParams.get("scale"), "2");
  await admin.emulateMedia({ media: "print" });
  assert.ok(await prepSvg.isVisible()); assert.equal((await prepSvg.boundingBox()).width, 96);
  await admin.pdf({ path: `${output}/prep-with-project-qr.pdf`, preferCSSPageSize: true, printBackground: true });
  await admin.emulateMedia({ media: "screen" });

  const staff = await context(true); await staff.goto(scanUrl);
  await staff.waitForURL(/\/login\?returnTo=/); assert.match(await staff.locator('input[name="returnTo"]').inputValue(), /prep=.*scale=2/);
  await signIn(staff, "staff", /\/prep-orders\/closeout\/scan\?prep=/);
  await staff.getByRole("heading", { name: "Clipboard Nested Dish", exact: true }).waitFor();
  await staff.getByLabel("Cook / initials", { exact: true }).fill("AM");
  // Lose the first start response after the server committed. Retry must reuse
  // the persisted job and its original start timestamp.
  let dropped = false;
  await staff.route("**/prep-orders/closeout/scan?prep=*", async route => {
    if (route.request().method() === "POST" && !dropped) { dropped = true; await route.fetch(); await route.abort(); } else await route.continue();
  });
  await staff.getByRole("button", { name: "Start project", exact: true }).click();
  await staff.getByRole("alert").filter({ hasText: "Connection interrupted" }).waitFor();
  const started = await db.productionJob.findFirstOrThrow({ where: { kind: "PREP", recipeId: "clipboard-dish" } });
  assert.equal(started.expectedQty, 16); assert.equal(started.cookName, "AM");
  await staff.unroute("**/prep-orders/closeout/scan?prep=*");
  await staff.getByRole("button", { name: "Start project", exact: true }).click();
  await staff.waitForURL(/scan\?job=/); assert.equal(new URL(staff.url()).searchParams.get("job"), started.id);
  await staff.reload(); await staff.getByLabel("Actual yield produced", { exact: true }).waitFor();
  assert.equal((await db.productionJob.findUniqueOrThrow({ where: { id: started.id } })).startedAt.getTime(), started.startedAt.getTime());
  assert.equal(await staff.getByRole("button", { name: "Mark reviewed", exact: true }).count(), 0);
  await staff.getByLabel("Actual yield produced", { exact: true }).fill("14");
  await staff.getByLabel("Shift / quality notes", { exact: true }).fill("Finished and dated. Yield was lower than the scaled plan.");
  await staff.getByRole("button", { name: "Finish & submit for review", exact: true }).click();
  assert.equal((await db.productionJob.findUniqueOrThrow({ where: { id: started.id } })).finishedAt, null);
  await staff.getByRole("checkbox").check();
  await staff.evaluate(() => window.scrollTo(0, 0));
  await staff.screenshot({ path: `${output}/mobile-finish-form.png`, fullPage: true });
  await staff.getByRole("button", { name: "Finish & submit for review", exact: true }).click();
  await staff.getByRole("status").filter({ hasText: "Waiting for admin review" }).waitFor();
  const finished = await db.productionJob.findUniqueOrThrow({ where: { id: started.id } });
  assert.ok(finished.finishedAt && finished.finishedAt >= finished.startedAt); assert.equal(finished.actualQty, 14); assert.equal(finished.reviewedAt, null);
  assert.equal(await db.productionBatch.count(), beforeBatches); assert.equal(await db.stockTransfer.count(), beforeTransfers);
  assert.equal(await staff.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  console.log("Prep QR decodes, login returns to the right scaled project, lost start response deduplicates, timer survives reload, and mobile completion requires labeling without posting charges.");

  const manager = await context(); await manager.goto(`${base}/login`); await signIn(manager, "manager");
  await manager.goto(staff.url()); assert.equal(await manager.getByRole("button", { name: "Mark reviewed", exact: true }).count(), 0);
  await manager.goto(`${base}/prep-orders/jobs?date=2026-12-10`); await manager.waitForURL(`${base}/prep-orders`);
  await admin.goto(`${base}/prep-orders/closeout?date=2026-12-10`);
  await admin.getByRole("heading", { name: "Cook project logs", exact: true }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Use reviewed cook result", exact: true }).count(), 0);
  const dailyQr = admin.locator('.production-job-qr svg[data-qr-url*="type=PREP"]').first();
  await decode(dailyQr);
  await admin.goto(`${base}/prep-orders/closeout/scan?job=${started.id}`);
  await admin.getByLabel("Reviewed yield", { exact: true }).fill("15");
  await admin.getByLabel("Admin review note", { exact: true }).fill("Yield, labeling, and quality notes verified.");
  await admin.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "Reviewed by an admin" }).waitFor();
  const checked = await db.productionJob.findUniqueOrThrow({ where: { id: started.id } });
  assert.equal(checked.actualQty, 14); assert.equal(checked.reviewedQty, 15);
  assert.equal(await db.productionBatch.count(), beforeBatches); assert.equal(await db.stockTransfer.count(), beforeTransfers);
  await admin.goto(`${base}/prep-orders/closeout?date=2026-12-10`);
  const row = admin.locator('form[data-worksheet-row]').filter({ has: admin.getByRole("heading", { name: "Clipboard Nested Dish", exact: true }) });
  await row.getByRole("button", { name: "Use reviewed cook result", exact: true }).click();
  assert.equal(await row.getByLabel("Made (each)", { exact: true }).inputValue(), "15"); assert.equal(await row.getByLabel("Cook", { exact: true }).inputValue(), "AM");
  assert.match(await row.getByLabel("Production notes", { exact: true }).inputValue(), /lower than the scaled plan/);
  assert.equal(await row.getByLabel("Sent to Clipboard Kitchen (each)", { exact: true }).inputValue(), "");
  assert.equal(await row.getByLabel("Production person-minutes", { exact: true }).inputValue(), "");
  admin.on("dialog", dialog => dialog.accept());
  await admin.goto(`${base}/banquets/clipboard-banquet/packet?density=compact`);
  const banquetSvg = admin.locator('.production-job-qr svg[data-qr-url*="banquet="]').first(), banquetUrl = await decode(banquetSvg);
  assert.equal(new URL(banquetUrl).searchParams.get("banquet"), banquetLine.id);
  await admin.emulateMedia({ media: "print" }); await admin.pdf({ path: `${output}/banquet-with-project-qr.pdf`, preferCSSPageSize: true, printBackground: true }); await admin.emulateMedia({ media: "screen" });
  await admin.goto(`${base}/banquets/clipboard-banquet/prep-sheet`); await decode(admin.locator('.production-job-qr svg[data-qr-url*="banquet="]').first());
  await admin.goto(`${base}/banquets/week/2026-12-07/packet`); const weekUrl = await decode(admin.locator('.production-job-qr svg[data-qr-url*="type=BANQUET"]').first());
  await staff.goto(weekUrl); assert.equal(await staff.locator('a[href*="scan?prep="]').count(), 0);
  await staff.goto(banquetUrl); await staff.getByRole("button", { name: "Start project", exact: true }).click(); await staff.waitForURL(/scan\?job=/);
  await staff.getByLabel("Actual yield produced", { exact: true }).fill("0"); await staff.getByLabel("Shift / quality notes", { exact: true }).fill("Menu changed; no product was made."); await staff.getByRole("checkbox").check(); await staff.getByRole("button", { name: "Finish & submit for review", exact: true }).click();
  await staff.getByRole("status").filter({ hasText: "Waiting for admin review" }).waitFor();
  await admin.goto(`${base}/prep-orders/jobs?date=2026-12-10`); await admin.getByRole("heading", { name: "Production job review", exact: true }).waitFor();
  await admin.screenshot({ path: `${output}/admin-job-review.png`, fullPage: true });
  assert.equal(await db.productionJob.count({ where: { recipeId: "clipboard-dish" } }), 2);
  assert.equal(await db.productionBatch.count(), beforeBatches); assert.equal(await db.stockTransfer.count(), beforeTransfers);
  assert.equal(JSON.stringify(await db.prepPacketSnapshot.findUniqueOrThrow({ where: { scope: "clipboard-order" } })), original);
  await staff.goto(`${base}/prep-orders/closeout/scan?prep=missing`); await staff.getByRole("heading", { name: "Project unavailable", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(`${output}/verified-scan-url.txt`, scanUrl);
  console.log(`Admin-only review, deliberate yield prefill without automatic labor/deliveries, banquet and weekly project QR links, preserved snapshots, and zero ledger writes passed. Review files: ${output}`);
} catch (error) {
  for (const [index, ctx] of contexts.entries()) { const page = ctx.pages()[0]; if (page) await page.screenshot({ path: `${output}/failure-${index}.png`, fullPage: true }).catch(() => {}); }
  throw error;
} finally { await browser.close(); await db.$disconnect(); }
