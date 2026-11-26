import { launchBrowser, browserBaseUrl } from "../harness.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

// On-hand counts on the Combined purchasing list. Uses the event-planning
// fixtures: Planning tomatoes need 12.5 lb across two banquets, 5 lb cases.
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/prep_workflow_test");
const db = new PrismaClient(), base = browserBaseUrl(), output = "/tmp/purchase-counts-review", errors = [];
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
let page;
async function login(role, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, timezoneId: "America/Chicago" });
  const p = await context.newPage(); p.setDefaultTimeout(15000); p.on("pageerror", error => errors.push(error.message));
  await p.goto(`${base}/login`); await p.getByLabel("Email").fill(`${role}@local.test`); await p.getByLabel("Password").fill("local-smoke-only");
  await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(`${base}/`); return p;
}
const list = `${base}/production?from=2027-02-10&to=2027-02-10&view=shopping&source=banquet%3Aplanning-wedding&source=banquet%3Aplanning-dinner`;
try {
  page = await login("admin", { width: 390, height: 844 });
  await page.goto(list);
  await page.getByRole("button", { name: "Start a count", exact: true }).click();
  await page.waitForURL(/\/production\/counts\/[^/?]+$/);
  const countUrl = page.url(), countId = countUrl.split("/").pop();
  await page.getByRole("heading", { name: "On-hand count", exact: true }).waitFor();
  const input = page.getByLabel("Planning tomatoes", { exact: true });
  const row = page.locator("li").filter({ has: input });
  assert.match(await row.innerText(), /12\.5 lb/); assert.match(await row.innerText(), /3 cases/);
  await input.fill("4");
  await row.getByText("Saved", { exact: true }).waitFor();
  assert.match(await row.innerText(), /8\.5 lb/); assert.match(await row.innerText(), /2 cases/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${output}/count-phone.png`, fullPage: true });
  const saved = await db.purchaseCountLine.findMany({ where: { countId } });
  assert.equal(saved.length, 1); assert.equal(saved[0].onHand, 4); assert.equal(saved[0].unit, "lb");

  // Desk sees the same count; invalid input is refused, not saved.
  const desk = await login("admin");
  await desk.goto(countUrl);
  const deskInput = desk.getByLabel("Planning tomatoes", { exact: true });
  assert.equal(await deskInput.inputValue(), "4");
  await deskInput.fill("-2"); await deskInput.blur();
  await desk.getByText("Use a number of 0 or more.", { exact: true }).waitFor();
  assert.equal((await db.purchaseCountLine.findFirstOrThrow({ where: { countId } })).onHand, 4);
  await deskInput.fill("20"); await desk.locator("li").filter({ has: deskInput }).getByText("Saved", { exact: true }).waitFor();
  assert.match(await desk.locator("li").filter({ has: deskInput }).innerText(), /Covered/);

  // Order sheet: covered items drop off; back to 4 lb and it orders 2 cases.
  await desk.goto(`${countUrl}?sheet=order`);
  await desk.getByText("Everything on this list is covered by what's on hand.").waitFor();
  await db.purchaseCountLine.updateMany({ where: { countId }, data: { onHand: 4 } });
  await desk.reload();
  const orderRow = desk.locator("tr").filter({ hasText: "Planning tomatoes" });
  assert.match(await orderRow.innerText(), /8\.5 lb/); assert.match(await orderRow.innerText(), /\b2\b/);
  await desk.pdf({ path: `${output}/order-sheet.pdf`, format: "Letter", printBackground: true, preferCSSPageSize: true });

  // Count sheet prints with a QR back to this count.
  await desk.goto(`${countUrl}?sheet=count`);
  await desk.getByRole("link", { name: "Scan to enter counts" }).waitFor();
  assert.match(await desk.locator("svg[data-qr-url]").getAttribute("data-qr-url"), new RegExp(`/production/counts/${countId}$`));
  await desk.pdf({ path: `${output}/count-sheet.pdf`, format: "Letter", printBackground: true, preferCSSPageSize: true });

  // A new count starts blank.
  await desk.goto(list); await desk.getByRole("button", { name: "Start a count", exact: true }).click();
  await desk.waitForURL(url => /\/production\/counts\//.test(url.pathname) && !url.pathname.endsWith(countId));
  assert.equal(await desk.getByLabel("Planning tomatoes", { exact: true }).inputValue(), "");

  // Staff can't open counts.
  const staff = await login("staff");
  await staff.goto(countUrl); await staff.waitForURL(`${base}/`);
  assert.deepEqual(errors, []);
  console.log(`Start count, phone entry with live To order, saved/reloaded counts, invalid input, covered items, order and count sheets with QR, fresh new count, staff restriction and phone layout passed. Review: ${output}`);
} catch (error) { if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); throw error; }
finally { await browser.close(); await db.$disconnect(); }
