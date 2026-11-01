import { launchBrowser, browserBaseUrl } from "../harness.mjs";
// Run through MORNING_PULSE_BROWSER_SMOKE=1 PREP_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = browserBaseUrl();
const output = process.env.PULSE_REVIEW_DIR || "/tmp/morning-pulse-review";
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const errors = [];
async function login(role, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(`${role}@local.test`);
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole("heading", { name: "Morning Pulse", exact: true }).waitFor();
  return page;
}
async function open(page, query = "") {
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search actions, recipes & ingredients", exact: true });
  await input.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "combobox");
  if (query) await input.fill(query);
  return input;
}
try {
  const admin = await login("admin");
  for (const name of ["Costing & price integrity", "This week’s event & banquet load", "Prep & closeout queue", "Menu margin watchlist"]) await admin.getByRole("heading", { name, exact: true }).waitFor();
  await admin.getByText("Pulse Today Banquet", { exact: true }).waitFor();
  await admin.getByText("Pulse Last Day Banquet", { exact: true }).waitFor();
  await admin.getByText("Pulse Shared Festival", { exact: true }).waitFor();
  assert.equal(await admin.getByText(/Pulse Excluded/).count(), 0);
  await admin.getByText("Pulse Dinner Dish", { exact: true }).waitFor();
  await admin.getByText("50.0%", { exact: true }).waitFor();
  await admin.getByText("1 dish needs price", { exact: false }).waitFor();
  await admin.screenshot({ path: `${output}/dashboard-desktop.png`, fullPage: true });
  await admin.getByRole("link", { name: "Review ingredient integrity" }).click();
  await admin.waitForURL(/items\/cleanup#price-integrity/);
  const integrity = admin.locator("#price-integrity");
  await integrity.getByRole("link", { name: "Pulse Missing Details", exact: true }).waitFor();
  assert.equal(await integrity.getByText("Pulse Unused Missing", { exact: true }).count(), 0);
  await integrity.getByRole("link", { name: "Pulse Missing Details", exact: true }).click();
  await admin.waitForURL(/items\/[a-z0-9]+$/);
  await admin.goto(base);

  await open(admin);
  assert.equal(await admin.getByRole("option").filter({ hasText: "Export Prep Accounting XLSX" }).count(), 1);
  await admin.screenshot({ path: `${output}/action-center.png`, fullPage: true });
  const input = admin.getByRole("combobox", { name: "Search actions, recipes & ingredients", exact: true });
  await input.fill("new recipe");
  await admin.keyboard.press("Enter");
  await admin.waitForURL(/recipes\?new=1#new-recipe/);
  assert.equal(await admin.locator("#new-recipe").getAttribute("open"), "");
  await admin.locator('#new-recipe input[name="name"]').waitFor({ state: "visible" });
  await admin.locator("#new-recipe summary").click();
  await open(admin, "new recipe");
  await admin.keyboard.press("Enter");
  await admin.locator('#new-recipe input[name="name"]').waitFor({ state: "visible" });

  await open(admin, "not-a-real-result-xyz");
  await admin.keyboard.press("ArrowDown");
  await admin.keyboard.press("ArrowUp");
  await admin.getByRole("combobox", { name: "Search actions, recipes & ingredients", exact: true }).fill("daily closeout");
  await admin.keyboard.press("ArrowDown");
  await admin.keyboard.press("Enter");
  await admin.waitForURL(/prep-orders\/closeout\?date=/);
  await admin.getByRole("heading", { name: "Daily closeout", exact: true }).waitFor();

  await open(admin, "export prep accounting");
  const downloadEvent = admin.waitForEvent("download");
  await admin.keyboard.press("Enter");
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /^prep-accounting_.*\.xlsx$/);
  assert.equal(await download.failure(), null);
  await download.saveAs(`${output}/${download.suggestedFilename()}`);
  assert.equal(await admin.getByRole("dialog").count(), 0);
  console.log("Dashboard, integrity links, keyboard recovery after empty results, new-recipe form, closeout, and XLSX download passed.");

  await admin.route("**/prep-orders/report/export-xlsx?*", route => route.fulfill({ status: 500, body: "Test failure" }));
  await open(admin, "export prep accounting");
  await admin.keyboard.press("Enter");
  await admin.getByRole("alert").filter({ hasText: "could not be created" }).waitFor();
  await admin.keyboard.press("Escape");
  assert.equal(await admin.getByRole("button", { name: "Search actions, recipes & ingredients", exact: true }).evaluate(el => document.activeElement === el), true);
  await admin.unroute("**/prep-orders/report/export-xlsx?*");

  // Stub the browser dialog, then verify the action actually calls print once.
  await admin.addInitScript(() => { window.__pulsePrints = 0; window.print = () => { window.__pulsePrints++; }; });
  await admin.goto(base);
  await open(admin, "print this week's");
  await admin.keyboard.press("Enter");
  await admin.waitForURL(/banquets\/week\/\d{4}-\d{2}-\d{2}\/packet/);
  await admin.waitForFunction(() => window.__pulsePrints === 1);
  assert.equal(new URL(admin.url()).searchParams.has("print"), false);
  await admin.reload();
  await admin.getByRole("button", { name: "Print cook packet" }).waitFor();
  assert.equal(await admin.evaluate(() => window.__pulsePrints), 0);
  await admin.emulateMedia({ media: "print" });
  assert.equal(await admin.locator("header.no-print").isVisible(), false);
  await admin.pdf({ path: `${output}/weekly-packet.pdf`, format: "Letter", printBackground: true });
  console.log("Export error/retry feedback, focus restoration, auto-print, no repeat print on reload, and print styling passed.");

  for (const role of ["manager", "staff"]) {
    const page = await login(role);
    assert.equal(await page.getByRole("link", { name: "Open today’s closeout" }).count(), 0);
    await open(page);
    assert.equal(await page.getByRole("option").filter({ hasText: "Export Prep Accounting XLSX" }).count(), 0);
    assert.equal(await page.getByRole("option").filter({ hasText: "Open Daily Closeout" }).count(), 0);
    assert.equal(await page.getByRole("option").filter({ hasText: "New Recipe" }).count(), role === "manager" ? 1 : 0);
    assert.equal(await page.getByRole("option").filter({ hasText: "Merge Duplicate Items" }).count(), role === "manager" ? 1 : 0);
    await page.keyboard.press("Escape");
    if (role === "staff") {
      await page.getByRole("link", { name: "Review ingredient integrity" }).click();
      await page.waitForURL(/items\?flag=integrity/);
      await page.getByRole("link", { name: "Pulse Missing Details", exact: true }).waitFor();
      assert.equal(await page.getByText("Pulse Unused Missing", { exact: true }).count(), 0);
    }
  }
  const mobile = await login("staff", { width: 390, height: 844 });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await mobile.screenshot({ path: `${output}/dashboard-mobile.png`, fullPage: true });
  await mobile.getByRole("button", { name: "Search actions, recipes & ingredients", exact: true }).click();
  await mobile.getByRole("combobox", { name: "Search actions, recipes & ingredients", exact: true }).fill("daily prep");
  await mobile.getByRole("option").filter({ hasText: "Open Daily Prep" }).click();
  await mobile.waitForURL(/prep-orders\?date=/);
  assert.deepEqual(errors, []);
  console.log(`Role restrictions, mobile layout and touch action passed. Browser artifacts: ${output}`);
} finally {
  await browser.close();
}
