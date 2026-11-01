import { launchBrowser, browserBaseUrl } from "../harness.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/prep_workflow_test");
const db = new PrismaClient();
const originalSnapshot = JSON.stringify(await db.prepPacketSnapshot.findUniqueOrThrow({ where: { scope: "clipboard-order" } }));
const originalLines = JSON.stringify(await db.prepOrderLine.findMany({ where: { prepOrderId: "clipboard-order" }, orderBy: { id: "asc" } }));
const output = process.env.PRINT_REVIEW_DIR || "/tmp/clipboard-print-review";
await mkdir(output, { recursive: true });
const base = browserBaseUrl();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([{ name: "activeVenue", value: "clipboard-venue", url: base }]);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const controls = page.getByRole("region", { name: "Print controls", exact: true });
async function open(path) {
  await page.emulateMedia({ media: "screen" });
  await page.goto(base + path);
  await controls.waitFor();
}
async function scale(value) {
  await controls.getByRole("button", { name: `${value} times standard batch`, exact: true }).click();
  await page.waitForFunction(value => document.querySelector(".print-document")?.getAttribute("data-print-scale") === String(value), value);
}
async function pdf(name) {
  await page.emulateMedia({ media: "print" });
  assert.equal(await controls.isVisible(), false);
  assert.equal(await page.locator("header.no-print").isVisible(), false);
  await page.pdf({ path: `${output}/${name}.pdf`, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
}
async function writeInHeights() {
  await page.emulateMedia({ media: "print" });
  const heights = await page.locator(".print-document .print-write-in").evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, min: getComputedStyle(element).minHeight })));
  assert.ok(heights.length > 0);
  assert.ok(heights.every(item => item.height >= 28 && parseFloat(item.min) >= 28), JSON.stringify(heights));
  await page.emulateMedia({ media: "screen" });
}
try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill("manager@local.test");
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  await open("/recipes/clipboard-dish/print?costs=1");
  const dossier = page.locator(".recipe-dossier");
  await scale(0.5);
  assert.match(await dossier.locator(".recipe-specs").innerText(), /2 each/);
  await dossier.locator(".print-scaled-banner").getByText("SCALED PRODUCTION BATCH (0.5x)", { exact: false }).waitFor();
  await scale(3);
  assert.match(await dossier.locator(".recipe-specs").innerText(), /12 each/);
  await controls.getByLabel("Custom ×", { exact: true }).fill("2.5");
  await controls.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".print-document")?.getAttribute("data-print-scale") === "2.5");
  assert.match(await dossier.locator(".recipe-specs").innerText(), /10 each/);
  const costs = page.locator(".recipe-cost-summary");
  assert.match(await costs.innerText(), /Total batch cost\s*\$5\.00/i);
  assert.match(await costs.innerText(), /Cost \/ each\s*\$0\.50/i);
  await controls.getByLabel("Custom ×", { exact: true }).fill("0");
  await controls.getByRole("button", { name: "Apply", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("scale"), "2.5");
  await controls.getByLabel("Custom ×", { exact: true }).fill("2.5");
  await pdf("recipe-scaled-costing");
  await controls.getByRole("button", { name: "1-Page Squeeze", exact: true }).click();
  await page.getByRole("link", { name: "Kitchen copy", exact: true }).click();
  await page.waitForURL(/density=compact/);
  assert.equal(new URL(page.url()).searchParams.get("scale"), "2.5");
  await page.locator(".recipe-costing").waitFor({ state: "detached" });
  await scale(1);
  assert.equal(await dossier.locator(".print-scaled-banner").count(), 0);
  console.log("Fractional/custom/legacy scale controls, nested costing, fixed rates, invalid input, banner and content/density preservation passed.");

  await open("/recipes/clipboard-24/print");
  await pdf("recipe-24-standard");
  await page.emulateMedia({ media: "print" });
  const standardRow = await page.locator(".recipe-ingredient").first().evaluate(el => el.getBoundingClientRect().height);
  await page.emulateMedia({ media: "screen" });
  await controls.getByRole("button", { name: "1-Page Squeeze", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  const compactRow = await page.locator(".recipe-ingredient").first().evaluate(el => el.getBoundingClientRect().height);
  assert.ok(compactRow < standardRow * 0.9, `${compactRow} vs ${standardRow}`);
  assert.equal(await page.locator(".recipe-ingredient").nth(1).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(244, 244, 245)");
  await page.emulateMedia({ media: "screen" });
  await pdf("recipe-24-compact");
  await page.screenshot({ path: `${output}/controller-desktop.png`, fullPage: true });
  await open("/recipes/clipboard-long/print?density=compact");
  await pdf("recipe-long");

  await open("/prep-orders/clipboard-order/packet?shopping=yes&cooling=yes&weights=grams");
  await scale(3);
  assert.equal(new URL(page.url()).searchParams.get("weights"), "grams");
  assert.match(await page.locator(".recipe-packet-card").first().innerText(), /24 each/);
  assert.match(await page.locator(".recipe-references").innerText(), /680\.39\s*g/);
  assert.match(await page.locator(".recipe-packet-content").innerText(), /Captured method/);
  assert.doesNotMatch(await page.locator(".recipe-packet-content").innerText(), /Live method changed/);
  const accountability = page.locator("section").filter({ has: page.getByRole("heading", { name: "Prep Accountability Log", exact: true }) });
  assert.match(await accountability.innerText(), /24 each/);
  const cooling = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cooling Log · Cooked TCS Foods", exact: true }) });
  assert.match(await cooling.innerText(), /Planned prep: 24 each/);
  await controls.getByRole("button", { name: "1-Page Squeeze", exact: true }).click();
  await writeInHeights();
  await page.getByRole("button", { name: "Update packet", exact: true }).click();
  await page.waitForURL(/scale=3/);
  assert.equal(new URL(page.url()).searchParams.get("density"), "compact");
  assert.equal(new URL(page.url()).searchParams.get("shopping"), "yes");
  await pdf("prep-scaled-compact");
  console.log("24-line density reduction, zebra rows, scaled frozen ingredients/references/planned allocations/logs, GET options and 28px handwriting cells passed.");

  await open("/banquets/clipboard-banquet/packet?density=compact");
  assert.equal(await controls.getByRole("button", { name: "2 times standard batch", exact: true }).count(), 0);
  await page.locator(".recipe-packet-card .print-scaled-banner").filter({ hasText: "(2x)" }).waitFor();
  await writeInHeights();
  await pdf("banquet-compact");
  await open("/banquets/week/2026-12-07/packet?density=compact");
  await pdf("weekly-banquet-compact");
  await open("/menus/clipboard-menu/packet?mode=order-guide");
  await controls.getByRole("button", { name: "1-Page Squeeze", exact: true }).click();
  await writeInHeights();
  await page.locator('nav[aria-label="Launch packet sections"] a[href*="mode=recipes"]').click();
  await page.waitForURL(/mode=recipes/);
  await page.locator(".launch-recipe-sheet").first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get("density"), "compact");
  await pdf("menu-recipes-compact");
  await open("/schedule/2026-12-07/print?density=compact");
  await writeInHeights();
  await pdf("schedule-landscape");
  await open("/to-go/clipboard-to-go/packet?mode=packing&density=compact");
  await pdf("to-go-packing");
  console.log("All seven routes share the controller/header; banquet demand, menu sections, write-in guide cells, and landscape scheduling passed.");

  await page.addInitScript(() => { window.__clipboardPrints = 0; window.print = () => { window.__clipboardPrints++; }; });
  await open("/banquets/week/2026-12-07/packet?print=1&density=compact");
  await page.waitForFunction(() => window.__clipboardPrints === 1);
  assert.equal(new URL(page.url()).searchParams.has("print"), false);
  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set("print", "1"); history.pushState(null, "", url); });
  await page.waitForFunction(() => window.__clipboardPrints === 2);
  await page.reload();
  await controls.waitFor();
  assert.equal(await page.evaluate(() => window.__clipboardPrints), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/recipes/clipboard-dish/print");
  const rect = await controls.boundingBox();
  assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 390);
  await scale(0.5);
  await page.screenshot({ path: `${output}/controller-mobile.png`, fullPage: true });
  assert.equal(JSON.stringify(await db.prepPacketSnapshot.findUniqueOrThrow({ where: { scope: "clipboard-order" } })), originalSnapshot);
  assert.equal(JSON.stringify(await db.prepOrderLine.findMany({ where: { prepOrderId: "clipboard-order" }, orderBy: { id: "asc" } })), originalLines);
  assert.deepEqual(errors, []);
  console.log(`Repeated auto-print/reload behavior, mobile controls, unchanged frozen data and error-free rendering passed. Review files: ${output}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Print controller check stopped at", page.url());
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
