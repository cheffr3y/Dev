import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { launchBrowser, browserBaseUrl } from "../harness.mjs";

const db = new PrismaClient(), base = browserBaseUrl(), browser = await launchBrowser(), errors = [], output = "/tmp/recipe-dependencies-review";
await mkdir(output, { recursive: true });
let page;
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: "America/Chicago" });
  const p = await context.newPage(); p.on("pageerror", error => errors.push(error.message)); p.setDefaultTimeout(15000);
  await p.goto(`${base}/login`); await p.getByLabel("Email").fill(`${role}@local.test`); await p.getByLabel("Password").fill("local-smoke-only");
  await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(`${base}/`); return p;
}
try {
  const butter = await db.item.create({ data: { name: "Dependency Butter", unit: "lb", unitCost: 8, allergens: "milk", priceUpdatedAt: new Date() } });
  const stock = await db.recipe.create({ data: { name: "Dependency Base", prodCode: "DEPBASE", yieldQty: 2, yieldUnit: "qt", items: { create: { itemId: butter.id, quantity: 1, unit: "lb" } } } });
  const sauce = await db.recipe.create({ data: { name: "Dependency Sauce", prodCode: "DEPSAUCE", yieldQty: 1, yieldUnit: "qt", components: { create: { childId: stock.id, quantity: 0.5, unit: "qt" } } } });
  const dish = await db.recipe.create({ data: { name: "Dependency Dish", prodCode: "DEPDISH", yieldQty: 4, yieldUnit: "each", components: { create: [{ childId: sauce.id, quantity: 1, unit: "qt" }, { childId: stock.id, quantity: 16, unit: "fl oz" }] } } });
  const menu = await db.menuRollout.create({ data: { name: "Dependency Menu", status: "ACTIVE", items: { create: { recipeId: dish.id, parBatches: 2 } } } });
  const banquet = await db.banquet.create({ data: { name: "Dependency Banquet", venueId: "clipboard-venue", date: new Date("2027-02-10T00:00:00Z"), guestCount: 250, menuItems: { create: { recipeId: dish.id, orderedQty: 250, unit: "each" } } } });
  const before = JSON.stringify({ recipes: await db.recipe.findMany({ where: { id: { in: [dish.id, sauce.id, stock.id] } }, include: { items: true, components: true } }), banquet: await db.banquet.findUnique({ where: { id: banquet.id }, include: { menuItems: true } }), snapshots: await db.prepPacketSnapshot.findMany(), batches: await db.productionBatch.findMany(), transfers: await db.stockTransfer.findMany() });
  page = await login("admin"); await page.goto(`${base}/recipes/${dish.id}`);
  const explorer = page.getByRole("region", { name: "Recipe dependency and rollup explorer", exact: true });
  assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "$4.00");
  await explorer.getByRole("button", { name: "Expand all branches", exact: true }).click();
  await explorer.getByLabel("Dependency preview quantity", { exact: true }).fill("250");
  assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "$250.00");
  const raw = explorer.getByRole("region", { name: "Total raw ingredient demand", exact: true });
  assert.match(await raw.innerText(), /31.25 lb/); assert.match(await raw.innerText(), /\$250.00/);
  const sub = explorer.getByRole("region", { name: "Total sub-recipe demand", exact: true });
  assert.match(await sub.locator("tr").filter({ hasText: "Dependency Base" }).innerText(), /62.5 qt/);
  assert.match(await explorer.innerText(), /Inherited: Milk/);
  assert.match(await explorer.locator(`[data-dependency-id="${sauce.id}"]`).first().innerText(), /50% of parent cost/);
  await explorer.screenshot({ path: `${output}/scaled-desktop.png` });
  await explorer.getByLabel("Dependency preview quantity", { exact: true }).fill("");
  await explorer.getByRole("alert").filter({ hasText: "Enter a quantity" }).waitFor(); assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "—");
  await explorer.getByLabel("Dependency preview quantity", { exact: true }).fill("1"); await explorer.getByLabel("Dependency preview unit", { exact: true }).selectOption("dozen");
  assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "$12.00");
  await explorer.getByRole("button", { name: "Reset to standard yield", exact: true }).click();
  assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "$4.00");
  await explorer.getByLabel("Dependency preview quantity", { exact: true }).fill("0.000001");
  assert.match(await raw.innerText(), /0.000000125 lb/);
  await explorer.getByRole("button", { name: "Reset to standard yield", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await explorer.screenshot({ path: `${output}/mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto(`${base}/recipes/${stock.id}`);
  const uses = explorer.getByRole("heading", { name: "Where this recipe is used", exact: true }).locator("..");
  await uses.locator("details").evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  assert.ok(await uses.getByRole("link", { name: "Dependency Sauce", exact: true }).count());
  assert.ok(await uses.getByRole("link", { name: "Dependency Menu", exact: true }).count());
  assert.ok(await uses.getByRole("link", { name: "Dependency Banquet", exact: true }).count());
  assert.equal(await uses.getByRole("link", { name: "Dependency Menu", exact: true }).first().getAttribute("href"), `/menus/${menu.id}`);
  await explorer.screenshot({ path: `${output}/consumers.png` });
  // Failure modes are synthetic fixture edits; the preview itself has no writes.
  const after = JSON.stringify({ recipes: await db.recipe.findMany({ where: { id: { in: [dish.id, sauce.id, stock.id] } }, include: { items: true, components: true } }), banquet: await db.banquet.findUnique({ where: { id: banquet.id }, include: { menuItems: true } }), snapshots: await db.prepPacketSnapshot.findMany(), batches: await db.productionBatch.findMany(), transfers: await db.stockTransfer.findMany() });
  assert.equal(after, before);
  await db.recipeComponent.updateMany({ where: { parentId: dish.id, childId: stock.id }, data: { unit: "lb" } });
  await page.goto(`${base}/recipes/${dish.id}`); await explorer.getByRole("button", { name: "Expand all branches", exact: true }).click();
  assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "—"); assert.match(await explorer.innerText(), /Unit mismatch/);
  await db.recipeComponent.updateMany({ where: { parentId: dish.id, childId: stock.id }, data: { unit: "fl oz" } });
  await page.goto(`${base}/recipes/${stock.id}`);
  await db.item.update({ where: { id: butter.id }, data: { unitCost: 0 } }); await page.reload();
  assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "—"); assert.match(await explorer.innerText(), /Missing or invalid ingredient price/);
  await db.item.update({ where: { id: butter.id }, data: { unitCost: 8, priceUpdatedAt: new Date("2020-01-01") } }); await page.reload();
  assert.match(await explorer.innerText(), /Stale source prices/);
  await db.recipeComponent.create({ data: { parentId: stock.id, childId: dish.id, quantity: 1, unit: "each" } }); await page.reload();
  await explorer.getByRole("button", { name: "Expand all branches", exact: true }).click();
  assert.match(await explorer.innerText(), /Recipe cycle/); assert.equal(await explorer.getByTestId("dependency-total-cost").innerText(), "—");
  const staff = await login("staff"); await staff.goto(`${base}/recipes/${dish.id}`);
  await staff.getByLabel("Dependency preview quantity", { exact: true }).fill("250");
  assert.equal(await staff.getByRole("button", { name: "Save changes", exact: true }).count(), 0);
  assert.ok(await staff.getByRole("region", { name: "Recipe dependency and rollup explorer", exact: true }).count());
  assert.deepEqual(errors, []);
  console.log(`Recursive scaling, shared totals, cost shares/allergens, indirect consumers, invalid/zero/stale costs, cycles, mobile, staff preview and unchanged saved facts passed. Review: ${output}`);
} catch (error) { if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); throw error; }
finally { await browser.close(); await db.$disconnect(); }
