import { launchBrowser, browserBaseUrl } from "../harness.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/prep_workflow_test");
const db = new PrismaClient(), base = browserBaseUrl(), output = "/tmp/workspace-editing-review";
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const contexts = [], errors = [];
async function pageFor(role, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } }); contexts.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/login`);
  if (role) { await page.getByLabel("Email").fill(`${role}@local.test`); await page.getByLabel("Password").fill("local-smoke-only"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(`${base}/`); }
  return page;
}
async function until(check, message) { for (let i = 0; i < 80; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(message); }
async function saved(page) { await until(() => page.locator('[aria-busy="true"]').count().then(count => count === 0), "Saves did not settle"); }
const cost = (page, name) => page.getByLabel(`Unit cost for ${name}`, { exact: true });
try {
  const vendor = await db.vendor.create({ data: { name: "Workspace Vendor" } });
  const ingredients = await Promise.all(["A", "B"].map(letter => db.item.create({ data: { name: `Workspace Butter ${letter}`, category: "Dairy", unit: "lb", unitCost: 8, vendorId: vendor.id, packQty: 40, packUnit: "lb", allergens: "milk", priceUpdatedAt: new Date("2026-01-01") } })));
  const [a, b] = ingredients;
  const guide = await db.orderGuide.create({ data: { name: "Workspace guide", venueId: "clipboard-venue", lines: { create: ingredients.map((item, index) => ({ itemId: item.id, par: index ? 0 : 32, unit: "oz" })) } } });
  await db.inventoryItem.create({ data: { venueId: "clipboard-venue", itemId: a.id, quantity: 1, unit: "lb" } });
  const keyboardItems = await Promise.all(Array.from({ length: 10 }, (_, i) => db.item.create({ data: { name: `Keyboard test ingredient ${String(i + 1).padStart(2, "0")}`, unit: "lb", unitCost: 1 } })));
  const keyboardRecipe = await db.recipe.create({ data: { name: "Keyboard entry recipe", prodCode: "KEYBOARD", yieldQty: 1, yieldUnit: "each" } });
  const beforeSnapshot = JSON.stringify(await db.prepPacketSnapshot.findUniqueOrThrow({ where: { scope: "clipboard-order" } }));
  const beforeBatches = await db.productionBatch.count();
  const anon = await pageFor(null);
  assert.equal((await anon.request.get(`${base}/api/workspace?kind=item&id=${a.id}`)).status(), 401);
  assert.equal((await anon.request.patch(`${base}/api/workspace`, { data: {} })).status(), 401);
  const admin = await pageFor("admin");
  const malicious = await admin.request.patch(`${base}/api/workspace`, { headers: { Origin: "https://external.invalid" }, data: { entity: "item", id: a.id, field: "unitCost", expected: 8, value: "99" } }); assert.equal(malicious.status(), 403);
  await admin.goto(`${base}/items?q=Workspace+Butter`);
  await cost(admin, a.name).fill("12"); await cost(admin, a.name).press("Enter");
  assert.equal(await admin.evaluate(() => document.activeElement?.getAttribute("aria-label")), `Unit cost for ${b.name}`);
  await until(async () => (await db.item.findUnique({ where: { id: a.id } })).unitCost === 12, "Grid price was not saved"); await saved(admin);
  const sku = admin.getByLabel(`Item # for ${a.name}`, { exact: true }); await sku.fill("SKU-A"); await sku.press("Tab");
  assert.equal(await admin.evaluate(() => document.activeElement?.getAttribute("aria-label")), `GCODE for ${a.name}`);
  await admin.keyboard.press("Shift+Tab"); assert.equal(await admin.evaluate(() => document.activeElement?.getAttribute("aria-label")), `Item # for ${a.name}`);
  await saved(admin); await sku.fill("discarded"); await sku.press("Escape"); assert.equal(await sku.inputValue(), "SKU-A");
  const pack = admin.getByLabel(`Pack size for ${a.name}`, { exact: true }); await pack.fill("40 lb case"); await pack.press("Tab"); await saved(admin);
  await cost(admin, a.name).fill("-4"); await cost(admin, a.name).press("Tab"); await admin.getByRole("alert").filter({ hasText: "Enter a number" }).waitFor();
  assert.equal((await db.item.findUnique({ where: { id: a.id } })).unitCost, 12); await admin.getByRole("button", { name: "Use latest", exact: true }).click();
  await db.item.update({ where: { id: a.id }, data: { unitCost: 14 } });
  await cost(admin, a.name).fill("15"); await cost(admin, a.name).press("Tab"); await admin.getByRole("alert").filter({ hasText: "Someone changed" }).waitFor();
  assert.equal(await cost(admin, a.name).inputValue(), "15"); await admin.getByRole("button", { name: "Use latest", exact: true }).click(); assert.equal(await cost(admin, a.name).inputValue(), "14");
  // Lose a response after the server commits; retry must retain the same edit.
  let drop = true;
  await admin.route("**/api/workspace", async route => { if (drop && route.request().method() === "PATCH") { drop = false; await route.fetch(); await route.abort(); } else await route.continue(); });
  await cost(admin, a.name).fill("16"); await cost(admin, a.name).press("Tab"); await admin.getByRole("alert").filter({ hasText: "Connection interrupted" }).waitFor();
  const committed = await db.item.findUniqueOrThrow({ where: { id: a.id } }); assert.equal(committed.unitCost, 16);
  await admin.getByRole("button", { name: "Retry my edit", exact: true }).click(); await saved(admin);
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: a.id } })).priceUpdatedAt.getTime(), committed.priceUpdatedAt.getTime());
  await admin.unroute("**/api/workspace");
  await admin.getByLabel(`Vendor for ${b.name}`, { exact: true }).selectOption(""); await admin.getByLabel(`Vendor for ${b.name}`, { exact: true }).press("Tab"); await saved(admin);
  await until(async () => (await db.item.findUnique({ where: { id: b.id } })).vendorId === null, "Vendor did not save");
  await admin.screenshot({ path: `${output}/items-grid.png`, fullPage: true });
  console.log("Inline grid keyboard navigation, validation, conflicts, lost-response retry, vendor changes and metadata preservation passed.");

  await admin.goto(`${base}/order-guides/${guide.id}`);
  assert.equal(await admin.getByLabel("Estimated order total", { exact: true }).textContent(), "$16.00");
  await cost(admin, a.name).fill("20"); await cost(admin, a.name).press("Tab"); await saved(admin);
  assert.equal(await admin.getByLabel("Estimated order total", { exact: true }).textContent(), "$20.00");
  const par = admin.getByLabel(`Par for ${a.name}`, { exact: true }); await par.fill("48"); await par.press("Enter"); await saved(admin);
  assert.equal(await admin.getByLabel("Estimated order total", { exact: true }).textContent(), "$40.00");
  await admin.getByLabel(`Order unit for ${a.name}`, { exact: true }).fill("each"); await admin.getByLabel(`Order unit for ${a.name}`, { exact: true }).press("Tab"); await saved(admin);
  await admin.getByText("Check units", { exact: true }).first().waitFor(); assert.match(await admin.locator("tfoot").textContent(), /partial/);
  await admin.getByLabel(`Order unit for ${a.name}`, { exact: true }).fill("oz"); await admin.getByLabel(`Order unit for ${a.name}`, { exact: true }).press("Tab"); await saved(admin);
  await admin.screenshot({ path: `${output}/order-guide-grid.png`, fullPage: true });
  await admin.emulateMedia({ media: "print" }); assert.equal(await cost(admin, a.name).isVisible(), false); assert.equal(await admin.locator("thead th:visible").count(), 6); assert.equal(await admin.locator("tfoot tr:visible td").count(), 2); await admin.emulateMedia({ media: "screen" });

  await admin.goto(`${base}/recipes/${keyboardRecipe.id}`);
  for (let i = 0; i < keyboardItems.length; i++) {
    const form = admin.getByRole("form", { name: "Add recipe ingredients" }); const picker = form.getByRole("combobox", { name: "Add ingredient", exact: true });
    if (i > 0) assert.equal(await picker.evaluate(element => element === document.activeElement), true, "Next ingredient row should receive focus");
    await picker.fill(keyboardItems[i].name); await picker.press("Tab");
    assert.equal(await admin.evaluate(() => document.activeElement?.getAttribute("name")), "quantity");
    await admin.keyboard.type(String(i + 1)); await admin.keyboard.press("Tab");
    assert.equal(await admin.evaluate(() => document.activeElement?.getAttribute("name")), "unit");
    await admin.keyboard.press("Enter");
    await until(async () => await db.recipeItem.count({ where: { recipeId: keyboardRecipe.id } }) === i + 1, "Keyboard ingredient did not persist");
    await until(() => picker.inputValue().then(value => value === ""), "Picker did not reset after save");
    await until(() => picker.evaluate(element => element === document.activeElement), "Picker did not regain focus");
  }
  const entered = await db.recipeItem.findMany({ where: { recipeId: keyboardRecipe.id }, orderBy: { sortOrder: "asc" } }); assert.deepEqual(entered.map(line => line.quantity), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(new Set(entered.map(line => line.itemId)).size, 10);
  console.log("Order guide unit-aware estimates and print controls, plus ten consecutive ingredients entered without mouse input, passed.");

  await admin.goto(`${base}/menus/clipboard-menu`);
  const dish = admin.getByRole("link", { name: "Clipboard Nested Dish", exact: true }).first();
  await dish.scrollIntoViewIfNeeded(); const scrollBefore = await admin.evaluate(() => scrollY); await dish.click();
  const inspector = admin.getByRole("dialog"); await inspector.getByRole("heading", { name: "Clipboard Nested Dish", exact: true }).first().waitFor();
  assert.equal(admin.url(), `${base}/menus/clipboard-menu`);
  await inspector.getByLabel("Standard yield quantity", { exact: true }).fill("8"); await inspector.getByLabel("Standard yield quantity", { exact: true }).press("Tab"); await saved(admin);
  await until(async () => (await db.recipe.findUnique({ where: { id: "clipboard-dish" } })).yieldQty === 8, "Inspector yield did not save");
  await until(() => admin.locator('td').filter({ hasText: /^Standard: 8 each/ }).count().then(count => count > 0), "Parent menu yield did not recalculate");
  await inspector.getByRole("link", { name: "Clipboard Sauce", exact: true }).click(); await inspector.getByRole("heading", { name: "Clipboard Sauce", exact: true }).first().waitFor();
  await inspector.getByRole("link", { name: "Clipboard Base", exact: true }).click(); await inspector.getByRole("heading", { name: "Clipboard Base", exact: true }).first().waitFor();
  await inspector.getByRole("link", { name: "Clipboard Butter", exact: true }).click(); await inspector.getByRole("heading", { name: "Clipboard Butter", exact: true }).waitFor();
  await cost(inspector, "Clipboard Butter").fill("12"); await cost(inspector, "Clipboard Butter").press("Tab"); await saved(admin);
  await inspector.getByRole("button", { name: "Back", exact: true }).click(); await inspector.getByRole("heading", { name: "Clipboard Base", exact: true }).first().waitFor();
  await until(() => inspector.getByText("$12.00", { exact: true }).count().then(count => count > 0), "Nested recipe cost did not refresh");
  await admin.screenshot({ path: `${output}/recipe-inspector.png`, fullPage: true });
  await inspector.getByRole("button", { name: "Close inspector", exact: true }).click(); await until(() => inspector.count().then(count => count === 0), "Inspector did not close");
  assert.equal(await dish.evaluate(element => element === document.activeElement), true); assert.ok(Math.abs((await admin.evaluate(() => scrollY)) - scrollBefore) < 5, "Parent scroll should survive inspector edits");
  // A deliberate invalid edit must remain visible and block accidental dismissal.
  await dish.click(); await inspector.getByLabel("Standard yield quantity", { exact: true }).fill("0"); await inspector.getByRole("button", { name: "Close inspector", exact: true }).click();
  await inspector.getByRole("alert").filter({ hasText: "Some edits have not saved" }).waitFor(); await inspector.getByRole("button", { name: "Discard unsaved edits and close", exact: true }).click();
  assert.equal((await db.recipe.findUnique({ where: { id: "clipboard-dish" } })).yieldQty, 8);
  await admin.goto(`${base}/banquets/clipboard-banquet`); await admin.getByRole("link", { name: "Clipboard Nested Dish", exact: true }).click(); await inspector.getByRole("heading", { name: "Clipboard Nested Dish", exact: true }).first().waitFor();
  await admin.keyboard.press("Escape"); await until(() => inspector.count().then(count => count === 0), "Escape did not close inspector");
  await admin.goto(`${base}/prep-orders/clipboard-order`); await admin.getByRole("link", { name: "Clipboard Nested Dish", exact: true }).click(); await inspector.getByRole("heading", { name: "Clipboard Nested Dish", exact: true }).first().waitFor(); await inspector.getByRole("button", { name: "Close inspector", exact: true }).click();

  const staff = await pageFor("staff", true);
  assert.equal((await staff.request.patch(`${base}/api/workspace`, { data: { entity: "item", id: a.id, field: "unitCost", expected: 20, value: "99" } })).status(), 403);
  await staff.goto(`${base}/items?q=Workspace+Butter`); assert.equal(await staff.locator('[data-grid-cell]').count(), 0);
  await staff.goto(`${base}/menus/clipboard-menu`); await staff.getByRole("link", { name: "Clipboard Nested Dish", exact: true }).first().click();
  const mobileInspector = staff.getByRole("dialog"); await mobileInspector.getByRole("heading", { name: "Clipboard Nested Dish", exact: true }).first().waitFor(); assert.equal(await mobileInspector.locator('[data-grid-cell]').count(), 0);
  assert.equal(await mobileInspector.evaluate(element => element.scrollWidth > element.clientWidth), false); await staff.screenshot({ path: `${output}/mobile-readonly-inspector.png`, fullPage: true });
  assert.equal(JSON.stringify(await db.prepPacketSnapshot.findUniqueOrThrow({ where: { scope: "clipboard-order" } })), beforeSnapshot); assert.equal(await db.productionBatch.count(), beforeBatches);
  assert.deepEqual(errors, []);
  console.log(`Menu, banquet and prep inspectors, nested recipe/item edits, live parent refresh, focus/scroll recovery, unsaved-edit protection, mobile read-only access and unchanged snapshots/ledger passed. Review: ${output}`);
} catch (error) { for (const [index, context] of contexts.entries()) { const page = context.pages()[0]; if (page) await page.screenshot({ path: `${output}/failure-${index}.png`, fullPage: true }).catch(() => {}); } throw error; }
finally { await browser.close(); await db.$disconnect(); }
