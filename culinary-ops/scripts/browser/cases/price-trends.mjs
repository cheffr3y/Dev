import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { launchBrowser, browserBaseUrl } from "../harness.mjs";
const db = new PrismaClient(), base = browserBaseUrl();
const browser = await launchBrowser();
try {
  const item = await db.item.findFirstOrThrow({ where: { name: "Clipboard Butter" } });
  const originalCost = item.unitCost;
  const vendor = await db.vendor.create({ data: { name: "Other trend supplier" } });
  const fixtures = [
    { id: "trend-old", price: 8, date: "2026-10-01", unit: "lb" },
    { id: "trend-current", price: 0.75, date: "2026-10-02", unit: "oz" },
    { id: "trend-credit", price: -100, date: "2026-10-03", unit: "lb" },
    { id: "trend-void", price: 100, date: "2026-10-04", unit: "lb", voided: true },
    { id: "trend-other", price: 100, date: "2026-10-05", unit: "lb", vendorId: vendor.id },
    { id: "trend-incompatible", price: 100, date: "2026-10-06", unit: "gal" },
  ];
  for (const row of fixtures) {
    await db.invoiceDocument.create({ data: { id: row.id, filename: row.id + ".pdf", fileHash: row.id, mime: "application/pdf", data: new Uint8Array([1]), preview: new Uint8Array([1]), originalBytes: 1, storedBytes: 1, pages: 1, createdBy: "fixture", vendorId: row.vendorId ?? item.vendorId } });
    await db.invoicePurchaseLine.create({ data: { id: row.id + "-line", invoiceDocumentId: row.id, itemId: item.id, itemName: item.name,
      vendorId: row.vendorId ?? item.vendorId, venueId: "clipboard-venue", invoiceDate: new Date(row.date + "T12:00:00Z"), description: row.id, quantity: 1, purchaseUnit: row.unit, packQty: 1, packUnit: row.unit,
      amountCents: Math.round(row.price * 100), normalizedUnit: row.unit, normalizedUnitCost: row.price, createdBy: "fixture", voided: row.voided ?? false } });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "activeVenue", value: "clipboard-venue", url: base }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByLabel("Email", { exact: true }).fill("admin@local.test");
  await page.getByLabel("Password", { exact: true }).fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/items?q=Clipboard+Butter`);
  await page.getByText("Paid price +50.0%", { exact: true }).waitFor();
  await mkdir("/tmp/price-trends-review", { recursive: true });
  await page.screenshot({ path: "/tmp/price-trends-review/catalog-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "/tmp/price-trends-review/catalog-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const chart = page.getByRole("img", { name: /Last 2 reviewed paid prices/ });
  assert.match(await chart.getAttribute("aria-label"), /8.00000, 12.00000/);
  await page.goto(`${base}/recipes/clipboard-base`);
  await page.getByText("Paid price +50.0%", { exact: true }).waitFor();
  await page.goto(`${base}/recipes/clipboard-base/print?costs=1&scale=4`);
  await page.locator(".recipe-costing").getByText("Paid price +50.0%", { exact: true }).waitFor();
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByText("Paid price +50.0%", { exact: true }).isVisible(), false);
  await page.emulateMedia({ media: "screen" });
  await page.goto(`${base}/invoices?id=trend-current`);
  await page.getByText("Price +50.0%", { exact: true }).waitFor();
  await page.goto(`${base}/invoices?id=trend-old`);
  assert.equal(await page.getByText(/^Price \+/).count(), 0, "Future purchases must not become a prior price");
  await page.goto(`${base}/invoices?id=trend-credit`);
  assert.equal(await page.getByText(/^Price \+/).count(), 0, "Credits are not price jumps");
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: item.id } })).unitCost, originalCost);
  assert.deepEqual(errors, []);
  console.log("Same-supplier normalized trends and alerts render in catalog, recipe and invoice review; credits, voids, other suppliers, incompatible units, future baselines and print visibility passed.");
} finally { await browser.close(); await db.$disconnect(); }
