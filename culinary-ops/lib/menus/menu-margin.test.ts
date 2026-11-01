import test from "node:test";
import assert from "node:assert/strict";
import { buildMenuRollout, type RolloutRecipe } from "./menu-rollout";
import { buildMenuMarginMatrix } from "./menu-margin";

const now = new Date("2026-11-01T12:00:00Z");
function fixture() {
  const item = { id: "item", name: "Ingredient", category: "Produce", unitCost: 4, unit: "lb", priceUpdatedAt: now };
  const base: RolloutRecipe = { id: "base", name: "Base", yieldQty: 2, yieldUnit: "qt", menuPrice: null, station: null, allergens: null, items: [{ quantity: 1, unit: "lb", item }], components: [] };
  const dish: RolloutRecipe = { ...base, id: "dish", name: "Dish", yieldQty: 2, yieldUnit: "each", menuPrice: 10, items: [], components: [{ childId: base.id, quantity: 2, unit: "qt" }] };
  const second = { ...dish, id: "second", menuPrice: 5 };
  const recipes = [base, dish, second];
  const menu = { items: [dish, second].map((recipe, index) => ({ id: recipe.id, recipeId: recipe.id, section: index ? "Sides" : "Entrees", menuTitle: null, menuDescription: null, menuPrice: null, parBatches: 1, sortOrder: index })) };
  const calculate = () => buildMenuMarginMatrix(buildMenuRollout(menu, recipes, now), recipes, 30);
  return { item, base, dish, second, recipes, menu, calculate };
}
test("category averages and contribution margins use complete nested costs and flag over-target dishes", () => {
  const matrix = fixture().calculate();
  assert.equal(matrix.averageFcp, 30); assert.equal(matrix.averageMargin, 5.5);
  assert.equal(matrix.categories[0].averageFcp, 20); assert.equal(matrix.categories[1].averageFcp, 40);
  assert.equal(matrix.categories[1].overTarget, 1); assert.equal(matrix.needsReview, 0);
});
test("missing price, missing costs, bad yields, cycles and conversion fallbacks cannot appear on target", () => {
  for (const alter of [
    (f: ReturnType<typeof fixture>) => { f.item.unitCost = 0; },
    (f: ReturnType<typeof fixture>) => { f.base.yieldQty = 0; },
    (f: ReturnType<typeof fixture>) => { f.base.items[0].unit = "cup"; },
    (f: ReturnType<typeof fixture>) => { f.base.components.push({ childId: f.dish.id, quantity: 1, unit: "each" }); },
    (f: ReturnType<typeof fixture>) => { f.base.items = []; },
  ]) {
    const f = fixture(); alter(f); const matrix = f.calculate();
    assert.equal(matrix.needsReview, 2); assert.equal(matrix.averageFcp, null); assert.equal(matrix.averageMargin, null);
  }
  const f = fixture(); f.dish.menuPrice = 0;
  assert.equal(f.calculate().needsReview, 1);
});
test("stale costs stay visible as estimates", () => {
  const f = fixture(); f.item.priceUpdatedAt = new Date("2020-01-01T00:00:00Z");
  assert.equal(f.calculate().rows[0].stale, true); assert.equal(f.calculate().averageFcp, 30);
});
