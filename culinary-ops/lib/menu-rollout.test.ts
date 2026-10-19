import assert from "node:assert/strict";
import test from "node:test";
import { buildMenuRollout, packetMode, isRolloutOrderable, type RolloutRecipe, type RolloutLine } from "./menu-rollout";

const now = new Date("2026-10-17T12:00:00Z");
function fixture() {
  const butter = { id: "butter", name: "Butter", category: "Dairy", unitCost: 4, unit: "lb", priceUpdatedAt: now, allergens: "milk", sku: "B01", gcode: "G01", packSize: "4 x 1 lb", vendor: { id: "dairy", name: "Dairy Vendor" } };
  const greens = { ...butter, id: "greens", name: "Greens", category: "Produce", unitCost: 2, allergens: null, vendor: { id: "farm", name: "Farm Vendor" } };
  const node = (id: string, overrides: Partial<RolloutRecipe>): RolloutRecipe => ({ id, name: id, station: "Cold", menuPrice: null, allergens: null, yieldQty: 1, yieldUnit: "qt", items: [], components: [], ...overrides });
  const stock = node("Stock", { yieldQty: 2, items: [{ quantity: 16, unit: "oz", item: butter }] });
  const sauce = node("Sauce", { items: [{ quantity: 2, unit: "oz", item: butter }], components: [{ childId: stock.id, quantity: 16, unit: "fl oz" }] });
  const dish = node("Dish", { yieldQty: 10, yieldUnit: "each", menuPrice: 3.5, items: [{ quantity: 16, unit: "oz", item: greens }], components: [{ childId: sauce.id, quantity: 32, unit: "fl oz" }] });
  const second = node("Second", { yieldQty: 5, yieldUnit: "each", menuPrice: 3, components: [{ childId: sauce.id, quantity: 16, unit: "fl oz" }] });
  const line = (recipeId: string, parBatches: number, sortOrder: number): RolloutLine => ({ id: recipeId, recipeId, section: "Cold", menuTitle: null, menuDescription: null, menuPrice: null, parBatches, sortOrder });
  return { recipes: [dish, second, sauce, stock], items: [line(dish.id, 2, 1), line(second.id, 3, 2)], butter, dish, second, sauce, stock };
}
const close = (actual: number | null, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test("nested menu costs, margins and vendor quantities agree across fractional child batches", () => {
  const f = fixture();
  const plan = buildMenuRollout(f, f.recipes, now);
  close(plan.rows[0].batchCost, 3.5);
  close(plan.rows[0].portionCost, 0.35);
  close(plan.rows[0].grossMargin, 3.15);
  close(plan.rows[0].fcp, 10);
  close(plan.rows[1].fcp, 5);
  close(plan.averageFcp, 7.5);
  close(plan.averageMenuPrice, 3.25);
  close(plan.totalOpeningFoodCost, 9.25);
  close(plan.parWeightedFcp, 9.25 / 115 * 100);
  assert.deepEqual(plan.dependencies.map(row => row.recipe.id), ["Sauce", "Stock"]);
  for (const dependency of plan.dependencies) assert.deepEqual(dependency.usedIn, ["Dish", "Second"]);
  const sauce = plan.dependencies.find(row => row.recipe.id === "Sauce")!;
  const stock = plan.dependencies.find(row => row.recipe.id === "Stock")!;
  close(sauce.openingBatches, 3.5);
  close(sauce.openingYieldQty, 3.5);
  close(stock.openingBatches, 0.875);
  close(stock.openingYieldQty, 1.75);
  const dairy = plan.vendorGroups.find(vendor => vendor.id === "dairy")!;
  close(plan.orderLines.find(line => line.itemId === "butter")!.purchaseQty, 1.3125);
  assert.equal(dairy.lines[0].item.sku, "B01");
  assert.equal(dairy.lines[0].item.gcode, "G01");
  assert.equal(dairy.lines[0].item.packSize, "4 x 1 lb");
  close(plan.orderLines.find(line => line.itemId === "greens")!.purchaseQty, 2);
  assert.equal("purchaseQty" in dairy.lines[0], false);
  assert.deepEqual(plan.rows[0].allergens, ["milk"]);
  assert.deepEqual(plan.guideLines.map(line => line.itemId).sort(), ["butter", "greens"]);
});

test("overrides, zero pars and missing prices do not imply free verified dishes", () => {
  const f = fixture();
  f.items[0].menuPrice = 7;
  f.items[1].menuPrice = 0;
  f.items[1].parBatches = 0;
  f.butter.unitCost = 0;
  const plan = buildMenuRollout(f, f.recipes, now);
  close(plan.rows[0].effectiveMenuPrice, 7);
  assert.equal(plan.rows[1].fcp, null);
  assert.equal(plan.missingMenuPrices, 1);
  assert.deepEqual(plan.unpricedNames, ["Butter"]);
  assert.equal(plan.priceGaps.unpriced.size, 1);
  close(plan.totalOpeningFoodCost, 4);
  assert.equal(plan.orderLines.length, 2);
});

test("stale nested prices are deduplicated; untracked paid prices are neutral", () => {
  const f = fixture();
  f.butter.priceUpdatedAt = new Date("2026-01-01");
  const plan = buildMenuRollout(f, f.recipes, now);
  assert.deepEqual(plan.staleNames, ["Butter"]);
  assert.equal(plan.rows[0].priceGaps.stale.size, 1);
  assert.equal(plan.rows[1].priceGaps.stale.size, 1);
  const untracked = { ...f.butter, priceUpdatedAt: null };
  for (const recipe of f.recipes) for (const line of recipe.items) if (line.item.id === "butter") line.item = untracked;
  assert.deepEqual(buildMenuRollout(f, f.recipes, now).staleNames, []);
});

test("dependency traversal terminates cycles and purchase-unit mismatches stay explicit", () => {
  const f = fixture();
  f.stock.components.push({ childId: f.dish.id, quantity: 1, unit: "each" });
  assert.equal(buildMenuRollout(f, f.recipes, now).dependencies.length, 3);
  f.stock.components = [];
  f.stock.items[0].unit = "cup";
  const line = buildMenuRollout(f, f.recipes, now).orderLines.find(line => line.itemId === "butter")!;
  assert.equal(line.converted, false);
  assert.equal(line.extendedCost, null);
  assert.equal(line.purchaseQty, null);
});

test("empty rollout and unsupported packet modes have deterministic defaults", () => {
  const plan = buildMenuRollout({ items: [] }, [], now);
  assert.equal(plan.averageFcp, null);
  assert.equal(plan.totalOpeningFoodCost, 0);
  assert.deepEqual(plan.dependencies, []);
  assert.equal(packetMode("bad-mode"), "all");
  assert.equal(packetMode(["recipes", "costing"]), "all");
  assert.equal(packetMode("order-guide"), "order-guide");
});

test("opening prep counts every path to a shared foundation within the same dish", () => {
  const f = fixture();
  f.dish.components.push({ childId: f.stock.id, quantity: 1, unit: "qt" });
  const plan = buildMenuRollout(f, f.recipes, now);
  const stock = plan.dependencies.find(row => row.recipe.id === f.stock.id)!;
  close(stock.openingBatches, 1.875);
  close(stock.openingYieldQty, 3.75);
  assert.deepEqual(stock.usedIn, ["Dish", "Second"]);
});

test("zero opening pars retain reference dependencies without inventing a batch", () => {
  const f = fixture();
  for (const item of f.items) item.parBatches = 0;
  const plan = buildMenuRollout(f, f.recipes, now);
  assert.equal(plan.dependencies.length, 2);
  for (const dependency of plan.dependencies) {
    assert.equal(dependency.openingBatches, 0);
    assert.equal(dependency.openingYieldQty, 0);
  }
  assert.equal(plan.orderLines.length, 0);
});

test("component conversion fallbacks remain visible on affected prep recipes", () => {
  const f = fixture();
  f.sauce.components[0].unit = "lb";
  const stock = buildMenuRollout(f, f.recipes, now).dependencies.find(row => row.recipe.id === f.stock.id)!;
  assert.equal(stock.converted, false);
});

test("vendor checklist includes zero-par dishes and nested ingredients, excluding only non-orderables", () => {
  const f = fixture();
  for (const line of f.items) line.parBatches = 0;
  const names = ["Water", "Chicken, Backs / Bones", "Chicken Feet", "Carrot Tops", "Nutmeg", "Oil, Canola Blend"];
  f.stock.items.push(...names.map((name, i) => ({ quantity: 0.0001, unit: "oz", item: { ...f.butter, id: name, name, sku: i === 0 ? "007" : null } })));
  const plan = buildMenuRollout(f, f.recipes, now);
  assert.equal(plan.totalOpeningFoodCost, 0);
  assert.deepEqual(plan.guideLines.map(line => line.name).sort(), ["Butter", "Greens", "Nutmeg", "Oil, Canola Blend"]);
  assert.equal(plan.vendorGroups.flatMap(group => group.lines).length, 4);
  assert.equal(isRolloutOrderable({ name: "Carrots, Baby w/ Tops" }), true);
  assert.equal(isRolloutOrderable({ name: "Fruit, Watermelon" }), true);
});

test("hazelnut catalog flag cascades through pesto into the plated carrot matrix row", () => {
  const f = fixture();
  f.butter.allergens = "tree_nuts";
  f.stock.name = "Carrot Top Pesto";
  f.dish.name = "Plated, Blistered Carrot";
  assert.ok(buildMenuRollout(f, f.recipes, now).rows[0].allergens.includes("tree_nuts"));
});
