import { launchBrowser, browserBaseUrl } from "../harness.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/prep_workflow_test");
const db = new PrismaClient(), base = browserBaseUrl(), output = "/tmp/operating-calendar-review", errors = [];
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
let page;
async function login(role) { const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } }); const p = await context.newPage(); p.setDefaultTimeout(15000); p.on("pageerror", e => { errors.push(`${p.url()}: ${e.message}`); console.error("BROWSER_ERROR", p.url(), e.stack); }); await p.goto(`${base}/login`); await p.getByLabel("Email").fill(`${role}@local.test`); await p.getByLabel("Password").fill("local-smoke-only"); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(`${base}/`); return p; }
const calendar = `${base}/operating-calendar?month=2027-03&venue=operating-venue&day=2027-03-04`;
try {
  page = await login("admin");
  const before = { price: (await db.item.findUniqueOrThrow({ where: { id: "operating-item" } })).unitCost, batches: await db.productionBatch.count(), transfers: await db.stockTransfer.count(), frozen: JSON.stringify(await db.prepPacketSnapshot.findMany({ orderBy: { id: "asc" } })) };
  await page.goto(calendar); await page.getByRole("heading", { name: "Monthly labor, sales & food", exact: true }).waitFor();
  const daily = () => page.getByRole("form", { name: /Daily entry for/ });
  await daily().getByLabel("Gross sales ($)", { exact: true }).fill("1200"); await daily().getByLabel("Correction / review reason", { exact: true }).fill("POS gross sales verified"); await daily().getByRole("button", { name: "Save daily entry", exact: true }).click(); await page.getByText("Daily entry saved.", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: /^2027-03-05:/ }).click();
  await daily().getByLabel("Gross sales ($)", { exact: true }).fill("2000.01"); await daily().getByLabel("Actual labor cost ($)", { exact: true }).fill("400.02"); await daily().getByLabel(/Food entries reviewed/).check(); await daily().getByRole("button", { name: "Save daily entry", exact: true }).click(); await page.getByText("Daily entry saved.", { exact: true }).first().waitFor();
  const saved = await db.operatingDay.findUniqueOrThrow({ where: { venueId_businessDate: { venueId: "operating-venue", businessDate: new Date("2027-03-05T00:00:00Z") } } }); assert.equal(saved.grossSalesCents, 200001); assert.equal(saved.laborCents, 40002);
  await page.getByRole("button", { name: /^2027-03-06:/ }).click(); await daily().getByLabel("Gross sales ($)", { exact: true }).fill("0"); await daily().getByLabel("Actual labor cost ($)", { exact: true }).fill("50"); await daily().getByLabel(/Food entries reviewed/).check(); await daily().getByRole("button", { name: "Save daily entry", exact: true }).click(); await page.getByRole("button", { name: /^2027-03-06:.*Complete$/ }).waitFor();
  assert.match(await page.getByRole("button", { name: /^2027-03-06:/ }).innerText(), /L —/);
  await page.getByRole("button", { name: /^2027-03-04:/ }).click(); await page.getByRole("button", { name: /^Food spending/ }).click(); await page.getByRole("button", { name: "Add food purchase / credit", exact: true }).click();
  const food = page.getByRole("form", { name: "Food spending entry", exact: true }); await food.getByLabel("Food amount ($)", { exact: true }).fill("3.50"); await food.getByLabel("Description", { exact: true }).fill("Small produce receipt"); await food.getByRole("button", { name: "Record food spending", exact: true }).click(); await page.getByText(/Food spending saved. Review the daily totals/).waitFor();
  // Invoice lines are reviewed in the inline grid: add a line, fill its cells, then approve the batch.
  await page.goto(`${base}/invoices?id=operating-invoice`);
  const review = page.getByRole("region", { name: "Invoice purchase review", exact: true });
  await review.getByRole("button", { name: "+ Add Line", exact: true }).click();
  const newRow = () => review.locator('tr[data-row-key^="manual-"]');
  await newRow().getByLabel("OCR description", { exact: true }).fill("Extra tomatoes");
  await newRow().getByRole("combobox", { name: "Ingredient for Extra tomatoes", exact: true }).fill("Tracker tomatoes"); await page.getByRole("option", { name: /Tracker tomatoes/ }).click();
  await newRow().getByLabel("Billed quantity", { exact: true }).fill("1"); await newRow().getByLabel("Pack / unit size", { exact: true }).fill("case (10 lb)"); await newRow().getByLabel("Line total ($)", { exact: true }).fill("50");
  await page.getByLabel("Invoice draft status", { exact: true }).getByText("Draft saved to your account", { exact: true }).waitFor();
  await page.reload(); await newRow().waitFor();
  assert.equal(await newRow().getByLabel("OCR description", { exact: true }).inputValue(), "Extra tomatoes"); assert.equal(await newRow().getByLabel("Line total ($)", { exact: true }).inputValue(), "50");
  assert.match(await newRow().innerText(), /\$5\.00\d? \/ lb/);
  // Lost response: the server commits but the browser never hears back. The retry reuses the operation id.
  await page.route("**/api/invoice-purchases/batch", async route => { await route.fetch(); await route.abort(); }, { times: 1 });
  const approveAll = review.getByRole("button", { name: /^Approve All Matched Lines/ });
  await approveAll.click(); await review.getByRole("status").filter({ hasText: /Approval failed|Failed to fetch|NetworkError/ }).waitFor();
  await approveAll.click(); await review.getByRole("status").filter({ hasText: "Invoice approved. Food spending and ingredient prices updated." }).waitFor();
  assert.equal(await db.invoicePurchaseLine.count({ where: { invoiceDocumentId: "operating-invoice", description: "Extra tomatoes" } }), 1);
  assert.equal((await db.invoicePurchaseLine.findFirstOrThrow({ where: { invoiceDocumentId: "operating-invoice", description: "Extra tomatoes" } })).amountCents, 5000);
  assert.equal((await db.operatingFoodExpense.findUniqueOrThrow({ where: { invoiceDocumentId: "operating-invoice" } })).amountCents, 13000);
  await page.screenshot({ path: `${output}/invoice-matching.png`, fullPage: true });
  await page.goto(`${base}/items/operating-item`); await page.getByText("Invoice price history", { exact: true }).waitFor(); await page.getByText("+25.0%", { exact: true }).waitFor(); await page.getByRole("img", { name: "Invoice-date price trend by supplier", exact: true }).waitFor(); await page.screenshot({ path: `${output}/ingredient-price-history.png`, fullPage: true });
  await page.goto(calendar); await page.screenshot({ path: `${output}/monthly-calendar-desktop.png`, fullPage: true });
  const csv = await page.request.get(`${base}/operating-calendar/export?month=2027-03&venue=operating-venue`); assert.equal(csv.status(), 200); assert.match(await csv.text(), /"Gross sales USD"/); assert.match(await csv.text(), /"1200.00","260.25","133.50"/);
  await page.getByRole("button", { name: /^2027-03-07:/ }).click(); await daily().getByLabel("Gross sales ($)", { exact: true }).fill("321"); await page.route("**/api/operating-calendar", async route => { await route.fetch(); await route.abort(); }, { times: 1 }); await daily().getByRole("button", { name: "Save daily entry", exact: true }).click(); await daily().getByRole("status").waitFor(); assert.equal(await daily().getByLabel("Gross sales ($)", { exact: true }).inputValue(), "321"); await daily().getByRole("button", { name: "Save daily entry", exact: true }).click(); await page.getByText("Daily entry saved.", { exact: true }).first().waitFor();
  const replay = await db.operatingDay.findUniqueOrThrow({ where: { venueId_businessDate: { venueId: "operating-venue", businessDate: new Date("2027-03-07T00:00:00Z") } } }); assert.equal(replay.history.length, 1);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() }); const phone = await mobile.newPage(); await phone.goto(calendar); await phone.getByRole("button", { name: /^2027-03-04:/ }).waitFor(); assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await phone.screenshot({ path: `${output}/monthly-calendar-mobile.png`, fullPage: true });
  const staff = await login("staff"); assert.equal(await staff.getByRole("link", { name: "Monthly Tracker", exact: true }).count(), 0); assert.equal((await staff.request.get(`${base}/operating-calendar/export?month=2027-03&venue=operating-venue`)).status(), 403); assert.equal((await staff.request.post(`${base}/api/operating-calendar`, { data: {} })).status(), 403); assert.equal((await staff.request.post(`${base}/api/invoice-purchases`, { data: {} })).status(), 403); await staff.goto(`${base}/items/operating-item`); assert.equal(await staff.getByText("Invoice price history", { exact: true }).count(), 0);
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: "operating-item" } })).unitCost, 5); assert.equal(await db.productionBatch.count(), before.batches); assert.equal(await db.stockTransfer.count(), before.transfers); assert.equal(JSON.stringify(await db.prepPacketSnapshot.findMany({ orderBy: { id: "asc" } })), before.frozen); assert.deepEqual(errors, []);
  console.log(`Monthly gross sales/labor/food calendar, exact cents and zeroes, manual spending, invoice matching and normalized price history, reviewed food totals, CSV, lost-response recovery, mobile layout and permissions passed. Screenshots: ${output}`);
} catch (error) { if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); throw error; }
finally { await browser.close(); await db.$disconnect(); }
