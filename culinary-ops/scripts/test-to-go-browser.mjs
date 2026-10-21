import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

assert.equal(process.env.TO_GO_DISPOSABLE_DB, "1");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/to_go_test");
const prisma = new PrismaClient();
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
const output = process.env.TO_GO_REVIEW_DIR || "/tmp/to-go-review";
await mkdir(output, { recursive: true });
const passwordHash = await bcrypt.hash("local-smoke-only", 4);
await prisma.user.createMany({ data: ["MANAGER", "STAFF"].map(role => ({ name: role, email: `${role.toLowerCase()}@local.test`, passwordHash, role })) });
const venue = await prisma.venue.create({ data: { name: "Disposable Butchershop", code: "BUT" } });
const vendor = await prisma.vendor.create({ data: { name: "Holiday Vendor" } });
const butter = await prisma.item.create({ data: { name: "Butter", category: "Dairy", allergens: "milk", unit: "lb", unitCost: 4, vendorId: vendor.id, sku: "BUT-001", priceUpdatedAt: new Date() } });
const potatoes = await prisma.recipe.create({ data: { name: "Holiday Mashed Potatoes", prodCode: "HMP", yieldQty: 10, yieldUnit: "lb", instructions: "Mash — Fold in the butter until smooth.", items: { create: { itemId: butter.id, quantity: 5, unit: "lb" } } } });
const soup = await prisma.recipe.create({ data: { name: "Holiday Squash Soup", prodCode: "HSS", yieldQty: 2, yieldUnit: "gallon", instructions: "Blend — Purée until smooth.", components: { create: { childId: potatoes.id, quantity: 1, unit: "lb" } } } });
const browser = await chromium.launch({ headless: true, ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}) });
const contexts = [];
const errors = [];
let manager;
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Chicago" });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${process.env.AUTH_URL}/login`);
  await page.getByLabel("Email").fill(`${role}@local.test`);
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${process.env.AUTH_URL}/`);
  return page;
}
async function save(page, form, button) {
  const requestPromise = page.waitForRequest(request => request.method() === "POST" && request.url().includes("/to-go"));
  const responsePromise = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/to-go"));
  await form.getByRole("button", { name: button, exact: true }).click();
  const request = await requestPromise;
  await responsePromise;
  await page.waitForLoadState("networkidle");
  return { headers: request.headers(), body: request.postDataBuffer() };
}
try {
  manager = await login("manager");
  await manager.getByRole("link", { name: "Holiday & To-Go", exact: true }).click();
  const header = manager.locator("#new-to-go-rollup");
  await header.getByLabel("Name", { exact: true }).fill("Butchershop Thanksgiving 2026");
  await header.getByLabel("Venue", { exact: true }).selectOption(venue.id);
  await header.getByLabel("Pickup dates and details").fill("November 25 · Butchershop");
  await save(manager, header, "Create holiday rollup");
  await manager.waitForURL(/\/to-go\/[^/]+$/);
  const workspace = manager.url();
  const id = workspace.split("/").at(-1);
  const initial = await prisma.toGoRollup.findUniqueOrThrow({ where: { id }, include: { items: true } });
  assert.equal(initial.items.length, 11);
  assert.ok(initial.items.every(item => item.forecastQty === null && item.recipeId === null));
  const potatoLine = initial.items.find(item => item.name === "Mashed Potatoes");
  const potatoForm = manager.locator(`#to-go-line-${potatoLine.id}`);
  await potatoForm.locator("xpath=ancestor::details[1]").locator("summary").click();
  await potatoForm.getByPlaceholder("Search recipes or leave unlinked…").fill(potatoes.name);
  await potatoForm.getByRole("button", { name: new RegExp(potatoes.name) }).click();
  await potatoForm.getByLabel("Estimated sales (lb)", { exact: true }).fill("100");
  await potatoForm.getByLabel("Selling price ($ / lb)", { exact: true }).fill("8");
  await potatoForm.getByLabel("Packaging cost ($ / lb)", { exact: true }).fill("0.5");
  await potatoForm.getByLabel("Production target (lb)", { exact: true }).fill("120");
  await potatoForm.getByLabel("Actual sold (lb)", { exact: true }).fill("90");
  await potatoForm.getByLabel("Packing specification").fill("Pack by net weight. Label with product name.");
  const replay = await save(manager, potatoForm, "Save item");
  let saved = await prisma.toGoRollupItem.findUniqueOrThrow({ where: { id: potatoLine.id } });
  assert.equal(saved.forecastQty, 100);
  assert.equal(saved.productionQty, 120);
  assert.equal(saved.actualSoldQty, 90);
  assert.equal(saved.recipeId, potatoes.id);
  await manager.reload();
  await manager.getByRole("heading", { name: "Mashed Potatoes", exact: true }).waitFor();
  assert.match(await manager.locator("body").innerText(), /\$800\.00/);
  assert.match(await manager.locator("body").innerText(), /\$250\.00/);
  assert.match(await manager.locator("body").innerText(), /\$550\.00/);

  const soupLine = initial.items.find(item => item.name === "Roasted Butternut Squash Soup");
  const soupForm = manager.locator(`#to-go-line-${soupLine.id}`);
  await soupForm.locator("xpath=ancestor::details[1]").locator("summary").click();
  await soupForm.getByLabel("Selling unit", { exact: true }).selectOption("quart");
  await soupForm.getByPlaceholder("Search recipes or leave unlinked…").fill(soup.name);
  await soupForm.getByRole("button", { name: new RegExp(soup.name) }).click();
  await soupForm.getByLabel("Estimated sales (quart)", { exact: true }).fill("12");
  await soupForm.getByLabel("Selling price ($ / quart)", { exact: true }).fill("10");
  await soupForm.getByLabel("Packaging cost ($ / quart)", { exact: true }).fill("0");
  await save(manager, soupForm, "Save item");
  await manager.reload();
  await manager.screenshot({ path: `${output}/workspace.png`, fullPage: true });

  // An item cannot be edited through another rollup's identifier.
  const other = await prisma.toGoRollup.create({ data: { name: "Other rollup" } });
  await potatoForm.locator("xpath=ancestor::details[1]").locator("summary").click();
  await potatoForm.locator('input[name="rollupId"]').evaluate((input, otherId) => { input.value = otherId; }, other.id);
  await potatoForm.getByLabel("Estimated sales (lb)", { exact: true }).fill("999");
  await save(manager, potatoForm, "Save item");
  assert.equal((await prisma.toGoRollupItem.findUniqueOrThrow({ where: { id: potatoLine.id } })).forecastQty, 100);

  const staff = await login("staff");
  await staff.goto(workspace);
  assert.equal(await staff.locator("#new-to-go-line").count(), 0);
  assert.equal(await staff.getByRole("button", { name: "Save item", exact: true }).count(), 0);
  // Replay a captured legitimate action using staff cookies: server role check must reject it.
  const before = await prisma.toGoRollup.findUniqueOrThrow({ where: { id } });
  await staff.request.post(workspace, { headers: { "next-action": replay.headers["next-action"], "content-type": replay.headers["content-type"], origin: process.env.AUTH_URL }, data: replay.body });
  const after = await prisma.toGoRollup.findUniqueOrThrow({ where: { id } });
  assert.equal(after.updatedAt.toISOString(), before.updatedAt.toISOString());

  for (const mode of ["all", "forecast", "costing", "packing", "allergens", "recipes", "order-guide"]) {
    await staff.goto(`${workspace}/packet?mode=${mode}`);
    assert.equal(await staff.locator("#costing").count(), ["all", "costing"].includes(mode) ? 1 : 0);
    assert.equal(await staff.locator(".launch-recipe-sheet").count(), ["all", "recipes"].includes(mode) ? 2 : 0);
    if (mode === "forecast") {
      assert.match(await staff.locator("#forecast").innerText(), /120 lb/);
      assert.match(await staff.locator("#forecast").innerText(), /3 gallon/);
      assert.match(await staff.locator("#forecast").innerText(), /121\.5 lb/);
    }
    if (mode === "recipes") {
      assert.match(await staff.locator(".launch-recipe-sheet").first().innerText(), /Standard Batch/);
      assert.doesNotMatch(await staff.locator("body").innerText(), /Single-Serving|baseline covers/);
    }
    if (mode === "allergens") assert.match(await staff.locator("#allergens").innerText(), /Milk/);
    if (mode === "order-guide") {
      assert.match(await staff.locator("#order-guide").innerText(), /BUT-001/);
      assert.match(await staff.locator("#order-guide").innerText(), /Order Qty/i);
    }
    await staff.emulateMedia({ media: "print" });
    await staff.pdf({ path: `${output}/${mode}.pdf`, format: "Letter", printBackground: true, preferCSSPageSize: true });
    await staff.emulateMedia({ media: "screen" });
  }
  await manager.goto(workspace);
  const brieLine = initial.items.find(item => item.name === "Baked Brie Kit");
  const brieForm = manager.locator(`#to-go-line-${brieLine.id}`);
  await brieForm.locator("xpath=ancestor::details[1]").locator("summary").click();
  await brieForm.getByLabel("Selling unit", { exact: true }).selectOption("kit");
  await brieForm.getByPlaceholder("Search recipes or leave unlinked…").fill(potatoes.name);
  await brieForm.getByRole("button", { name: new RegExp(potatoes.name) }).click();
  await brieForm.getByLabel("Estimated sales (kit)", { exact: true }).fill("10");
  await brieForm.locator('input[name="recipeQtyPerUnit"]').fill("0.5");
  await save(manager, brieForm, "Save item");
  assert.equal((await prisma.toGoRollupItem.findUniqueOrThrow({ where: { id: brieLine.id } })).recipeAmountUnit, "lb");
  await prisma.recipe.update({ where: { id: potatoes.id }, data: { yieldQty: 160, yieldUnit: "oz" } });
  await manager.reload();
  assert.match(await manager.locator("table").first().getByRole("row").filter({ hasText: "Baked Brie Kit" }).innerText(), /80 oz/);
  await brieForm.locator("xpath=ancestor::details[1]").locator("summary").click();
  assert.equal(await brieForm.locator('input[name="recipeAmountUnit"]').inputValue(), "lb");
  await brieForm.getByRole("button", { name: /Use current recipe yield unit/ }).click();
  assert.equal(await brieForm.locator('input[name="recipeAmountUnit"]').inputValue(), "oz");
  assert.equal(await brieForm.locator('input[name="recipeQtyPerUnit"]').inputValue(), "");
  await potatoForm.locator("xpath=ancestor::details[1]").locator("summary").click();
  await potatoForm.getByLabel("Selling unit", { exact: true }).selectOption("oz");
  assert.equal(await potatoForm.getByLabel("Estimated sales (oz)", { exact: true }).inputValue(), "");
  assert.equal(await potatoForm.getByLabel("Selling price ($ / oz)", { exact: true }).inputValue(), "");
  await manager.setViewportSize({ width: 390, height: 844 });
  await manager.goto(workspace);
  assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile page must not overflow horizontally");
  await manager.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Holiday starter, saved weight/volume forecasts, production overrides, actual sales, item binding, staff role enforcement, seven print modes and mobile checks passed. Review: ${output}`);
} catch (error) {
  if (manager) await manager.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await prisma.$disconnect();
}
