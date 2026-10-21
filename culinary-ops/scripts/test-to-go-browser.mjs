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
const venue = await prisma.venue.findUniqueOrThrow({ where: { standardKey: "foxtown-heritage-meats" } });
const vendor = await prisma.vendor.create({ data: { name: "Proposal Vendor" } });
const butter = await prisma.item.create({ data: { name: "Butter", category: "Dairy", allergens: "milk", unit: "lb", unitCost: 4, vendorId: vendor.id, sku: "BUT-001", priceUpdatedAt: new Date() } });
const potatoes = await prisma.recipe.create({ data: { name: "Mashed Potatoes", prodCode: "HMP", yieldQty: 10, yieldUnit: "lb", instructions: "Mash — Fold in the butter until smooth.", items: { create: { itemId: butter.id, quantity: 5, unit: "lb" } } } });
const soup = await prisma.recipe.create({ data: { name: "Squash Soup", prodCode: "HSS", yieldQty: 2, yieldUnit: "gallon", instructions: "Blend — Purée until smooth.", components: { create: { childId: potatoes.id, quantity: 1, unit: "lb" } } } });
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
async function expand(detail) {
  if (!(await detail.evaluate(element => element.open))) await detail.locator(":scope > summary").click();
}
async function save(page, form, button, redirects = false) {
  console.log(`Submitting: ${button}`);
  const previousUrl = page.url();
  const addedName = button === "Add item" ? await form.getByLabel("Item name", { exact: true }).inputValue() : null;
  const requestPromise = page.waitForRequest(request => request.method() === "POST" && request.url().includes("/to-go"));
  const responsePromise = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/to-go"));
  await form.getByRole("button", { name: button, exact: true }).click();
  const request = await requestPromise;
  await responsePromise;
  if (redirects) await page.waitForURL(url => url.href !== previousUrl);
  else if (addedName) await page.getByRole("heading", { name: addedName, exact: true }).waitFor();
  else await form.getByRole("button", { name: button, exact: true }).waitFor();
  return { headers: request.headers(), body: request.postDataBuffer() };
}
async function pickRecipe(form, recipe) {
  await form.getByPlaceholder("Search recipes or leave unlinked…").fill(recipe.name);
  await form.getByRole("button", { name: new RegExp(recipe.name) }).click();
}
try {
  manager = await login("manager");
  await manager.getByRole("link", { name: "HMR Rollouts", exact: true }).click();
  const header = manager.locator("#new-to-go-rollup");
  assert.equal(await header.getByLabel("Start with", { exact: true }).inputValue(), "blank");
  await header.getByLabel("Name", { exact: true }).fill("November HMR Proposal");
  await header.getByLabel("Venue", { exact: true }).selectOption(venue.id);
  await save(manager, header, "Create HMR rollout", true);
  await manager.waitForURL(/\/to-go\/[^/]+$/);
  console.log("Blank HMR menu created");
  const workspace = manager.url();
  const id = workspace.split("/").at(-1);
  assert.equal(await prisma.toGoRollupItem.count({ where: { rollupId: id } }), 0);
  const quick = manager.locator("#new-to-go-line");
  assert.equal(await quick.locator('input[required]').count(), 1);
  assert.equal(await quick.getByLabel("Estimated sales (unit undecided)", { exact: true }).isVisible(), false);
  for (const field of ["packagingCost", "productionQty", "actualSoldQty"]) assert.equal(await quick.locator(`input[name="${field}"]`).getAttribute("type"), "hidden");
  assert.equal(await quick.getByLabel("Storage & reheating notes", { exact: true }).isVisible(), true);
  await quick.screenshot({ path: `${output}/hmr-quick-add.png` });
  await quick.getByLabel("Item name", { exact: true }).fill("Possible seasonal entrée");
  await save(manager, quick, "Add item");
  await manager.getByRole("heading", { name: "Possible seasonal entrée", exact: true }).waitFor();
  const simple = await prisma.toGoRollupItem.findFirstOrThrow({ where: { rollupId: id } });
  assert.equal(simple.recipeId, null);
  assert.equal(simple.forecastQty, null);
  assert.equal(simple.packagingCost, null);

  await pickRecipe(quick, potatoes);
  assert.equal(await quick.getByLabel("Item name", { exact: true }).inputValue(), potatoes.name);
  assert.equal(await quick.getByLabel("Selling unit", { exact: true }).inputValue(), "lb");
  await quick.getByLabel("Proposed price ($ / lb)", { exact: true }).fill("8");
  await quick.getByLabel("Menu description", { exact: true }).fill("Yukon gold potatoes, butter and cream.");
  await quick.getByLabel("Storage & reheating notes", { exact: true }).fill("Warm gently; stir before serving.");
  await save(manager, quick, "Add item");
  await manager.getByRole("heading", { name: potatoes.name, exact: true }).waitFor();
  const potatoLine = await prisma.toGoRollupItem.findFirstOrThrow({ where: { rollupId: id, recipeId: potatoes.id } });
  // Existing operational facts survive proposal-only edits but never drive the
  // proposal's food costing or appear as demands for additional input.
  await prisma.toGoRollupItem.update({ where: { id: potatoLine.id }, data: { packagingCost: 999, productionQty: 120, actualSoldQty: 90, forecastQty: 100, packingNotes: "Legacy packing details" } });
  await manager.reload();
  const potatoForm = manager.locator(`#to-go-line-${potatoLine.id}`);
  await expand(potatoForm.locator("xpath=ancestor::details[1]"));
  await potatoForm.getByLabel("Proposed price ($ / lb)", { exact: true }).fill("9");
  await save(manager, potatoForm, "Save item");
  const preserved = await prisma.toGoRollupItem.findUniqueOrThrow({ where: { id: potatoLine.id } });
  assert.equal(preserved.packagingCost, 999);
  assert.equal(preserved.productionQty, 120);
  assert.equal(preserved.actualSoldQty, 90);
  assert.equal(preserved.packingNotes, "Legacy packing details");
  assert.equal(preserved.customerInstructions, "Warm gently; stir before serving.");
  await expand(manager.locator('[data-hmr-report="costing"]'));
  const pricing = await manager.locator('[data-hmr-report="costing"]').innerText();
  assert.match(pricing, /\$2\.00/);
  assert.match(pricing, /\$7\.00/);
  assert.doesNotMatch(pricing, /999|1,001|Packaging|Actual sold/);

  await pickRecipe(quick, soup);
  assert.equal(await quick.getByLabel("Selling unit", { exact: true }).inputValue(), "quart");
  await quick.getByLabel("Proposed price ($ / quart)", { exact: true }).fill("10");
  await save(manager, quick, "Add item");
  await manager.getByRole("heading", { name: soup.name, exact: true }).waitFor();
  await quick.getByLabel("Item name", { exact: true }).fill("Family Meal Kit");
  await pickRecipe(quick, potatoes);
  await quick.getByLabel("Selling unit", { exact: true }).selectOption("kit");
  assert.equal(await quick.locator('[data-hmr-section="recipe-amount"]').evaluate(element => element.open), true);
  await quick.locator('input[name="recipeQtyPerUnit"]').fill("0.5");
  await save(manager, quick, "Add item");
  const kit = await prisma.toGoRollupItem.findFirstOrThrow({ where: { rollupId: id, name: "Family Meal Kit" } });
  assert.equal(kit.recipeAmountUnit, "lb");

  const staff = await login("staff");
  await staff.goto(workspace);
  assert.equal(await staff.locator("#new-to-go-line").count(), 0);
  assert.equal(await staff.locator("#copy-hmr-rollout").count(), 0);
  for (const mode of ["proposal", "all", "costing", "allergens", "recipes", "order-guide"]) {
    await staff.goto(`${workspace}/packet?mode=${mode}`);
    assert.equal(await staff.locator("#costing").count(), ["all", "costing"].includes(mode) ? 1 : 0);
    assert.equal(await staff.locator(".launch-recipe-sheet").count(), ["all", "recipes"].includes(mode) ? 2 : 0);
    assert.equal(await staff.locator("#forecast, #packing").count(), 0);
    assert.doesNotMatch(await staff.locator("body").innerText(), /Actual sold|Packaging cost|Production target/);
    if (["all", "proposal"].includes(mode)) {
      assert.match(await staff.locator("#proposal").innerText(), /Warm gently; stir before serving/);
      assert.match(await staff.locator("#proposal").innerText(), /Yukon gold potatoes/);
    }
    if (mode === "allergens") assert.match(await staff.locator("#allergens").innerText(), /Milk/);
    if (mode === "order-guide") assert.match(await staff.locator("#order-guide").innerText(), /BUT-001/);
    await staff.emulateMedia({ media: "print" });
    await staff.pdf({ path: `${output}/hmr-${mode}.pdf`, format: "Letter", printBackground: true, preferCSSPageSize: true });
    await staff.emulateMedia({ media: "screen" });
  }
  await staff.goto(`${workspace}/packet`);
  assert.equal(await staff.locator("#proposal").count(), 1, "default print mode is the proposal");
  for (const mode of ["forecast", "packing"]) {
    await staff.goto(`${workspace}/packet?mode=${mode}`);
    assert.equal(await staff.locator(`#${mode}`).count(), 1, "old packet bookmarks still resolve");
  }

  await prisma.toGoRollup.update({ where: { id }, data: { status: "COMPLETE", orderCutoff: "2026-11-20", pickupNotes: "November only", notes: "Old monthly assumptions" } });
  await manager.goto(workspace);
  await manager.getByText("Copy for next month / another rollout", { exact: true }).click();
  const copyForm = manager.locator("#copy-hmr-rollout");
  await copyForm.getByLabel("New rollout name", { exact: true }).fill("December HMR Proposal");
  const source = await prisma.toGoRollup.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  const replay = await save(manager, copyForm, "Create new rollout from this menu", true);
  await manager.waitForURL(url => url.pathname.startsWith("/to-go/") && url.pathname !== new URL(workspace).pathname);
  const copiedId = manager.url().split("/").at(-1);
  const copied = await prisma.toGoRollup.findUniqueOrThrow({ where: { id: copiedId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  assert.equal(copied.name, "December HMR Proposal");
  assert.equal(copied.status, "DRAFT");
  assert.equal(copied.venueId, source.venueId);
  for (const key of ["orderCutoff", "pickupNotes", "notes"]) assert.equal(copied[key], null);
  assert.equal(copied.items.length, source.items.length);
  for (const [i, item] of copied.items.entries()) {
    assert.notEqual(item.id, source.items[i].id);
    for (const key of ["name", "recipeId", "section", "description", "sellingUnit", "recipeQtyPerUnit", "recipeAmountUnit", "price", "packagingCost", "packingNotes", "customerInstructions", "sortOrder"]) assert.equal(item[key], source.items[i][key], key);
    for (const key of ["forecastQty", "productionQty", "actualSoldQty", "notes"]) assert.equal(item[key], null, key);
  }
  assert.deepEqual(await prisma.toGoRollup.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } }), source);
  const count = await prisma.toGoRollup.count();
  await staff.request.post(workspace, { headers: { "next-action": replay.headers["next-action"], "content-type": replay.headers["content-type"], origin: process.env.AUTH_URL }, data: replay.body });
  assert.equal(await prisma.toGoRollup.count(), count, "staff cannot copy proposals");
  await manager.goto(`${process.env.AUTH_URL}/to-go`);
  await manager.getByText("+ New HMR Rollout", { exact: true }).click();
  await header.getByLabel("Name", { exact: true }).fill("Thanksgiving proposal");
  await header.getByLabel("Start with", { exact: true }).selectOption("thanksgiving");
  await save(manager, header, "Create HMR rollout", true);
  await manager.waitForURL(/\/to-go\/[^/]+$/);
  assert.equal(await prisma.toGoRollupItem.count({ where: { rollupId: manager.url().split("/").at(-1) } }), 11);
  await manager.goto(workspace);
  await manager.screenshot({ path: `${output}/hmr-workspace.png`, fullPage: true });
  await manager.setViewportSize({ width: 390, height: 844 });
  assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await quick.screenshot({ path: `${output}/hmr-mobile-form.png` });
  assert.deepEqual(errors, []);
  console.log(`HMR proposal quick entry, reheating notes, food-only costing, legacy-data preservation, monthly copies, staff permissions, six proposal print modes, old bookmarks, Thanksgiving starter and mobile checks passed. Review: ${output}`);
} catch (error) {
  if (manager) await manager.screenshot({ path: `${output}/hmr-failure.png`, fullPage: true });
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await prisma.$disconnect();
}
