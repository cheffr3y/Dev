import test from "node:test";
import assert from "node:assert/strict";
import { buildConsumerTree, buildDependencyPlan, parentRecipeIds, type DependencyRecipe } from "./recipe-dependencies";

const butter = { id: "butter", name: "Butter", unit: "lb", unitCost: 8, allergens: "milk", priceUpdatedAt: "2026-11-02T00:00:00Z" };
const base: DependencyRecipe = { id: "base", name: "Base", yieldQty: 2, yieldUnit: "qt", allergens: null, items: [{ item: butter, quantity: 1, unit: "lb" }], components: [] };
const sauce: DependencyRecipe = { id: "sauce", name: "Sauce", yieldQty: 1, yieldUnit: "qt", allergens: null, items: [], components: [{ childId: "base", quantity: 0.5, unit: "qt" }] };
const dish: DependencyRecipe = { id: "dish", name: "Dish", yieldQty: 4, yieldUnit: "each", allergens: "milk", items: [], components: [{ childId: "sauce", quantity: 1, unit: "qt" }, { childId: "base", quantity: 16, unit: "fl oz" }] };
const recipes = [dish, sauce, base], now = new Date("2026-11-02T12:00:00Z");
const plan = (rows = recipes, quantity = 4, unit = "each") => buildDependencyPlan("dish", rows, quantity, unit, now)!;

test("multi-tier scaling sums shared sub-recipes and raw ingredients across every path", () => {
  const result = plan(recipes, 250);
  assert.equal(result.root.batches, 62.5);
  assert.equal(result.root.cost, 250);
  assert.equal(result.ingredients.length, 1);
  assert.equal(result.ingredients[0].quantity, 31.25);
  assert.equal(result.ingredients[0].cost, 250);
  assert.equal(result.subRecipes.find(row => row.id === "base")?.quantity, 62.5);
  assert.equal(result.root.children[0].share, 50);
  assert.equal(result.root.children[1].share, 50);
  assert.deepEqual(result.root.allergens, ["milk"]);
  assert.deepEqual(result.root.inherited, ["milk"], "Inherited tags retain provenance even if manually selected too");
  assert.equal(result.complete, true);
  assert.equal(result.stale, false);
  assert.equal(plan(recipes, 1, "dozen").root.cost, 12);
  assert.equal(plan(recipes, 0.000001).ingredients[0].quantity, 0.000000125);
});

test("mixed-unit shared ingredients normalize to the cost basis while incompatible amounts remain separate", () => {
  const extra = { ...dish, items: [{ item: butter, quantity: 8, unit: "oz" }, { item: butter, quantity: 1, unit: "cup" }] };
  const result = plan([extra, sauce, base]);
  assert.equal(result.ingredients.find(row => row.unit === "lb")?.quantity, 1);
  assert.equal(result.ingredients.find(row => row.unit === "cup")?.quantity, 1);
  assert.equal(result.ingredients.find(row => row.unit === "cup")?.cost, null);
  assert.equal(result.root.cost, null);
  assert.ok(result.root.children.every(child => child.share === null));
});

test("unknown edge conversions propagate through descendants instead of treating unlike units as equal", () => {
  const mismatch = { ...dish, components: [{ childId: "sauce", quantity: 1, unit: "lb" }] };
  const result = plan([mismatch, sauce, base]);
  assert.equal(result.root.cost, null);
  assert.equal(result.ingredients[0].quantity, null);
  assert.equal(result.subRecipes.find(row => row.id === "base")?.quantity, null);
  assert.match(result.root.children[0].issues.join(" "), /Unit mismatch/);
  for (const quantity of [0, -1, NaN, Infinity]) assert.equal(plan(recipes, quantity).root.cost, null);
  assert.equal(plan(recipes, 1, "pax").root.batches, null, "Guest counts do not imply a portion conversion");
});

test("cycles, missing recipes, invalid yields, empty builds and missing prices never become complete costs", () => {
  for (const replacement of [
    { ...base, components: [{ childId: "dish", quantity: 1, unit: "each" }] },
    { ...base, yieldQty: 0 },
    { ...base, items: [], components: [] },
    { ...base, items: [{ ...base.items[0], item: { ...butter, unitCost: 0 } }] },
    { ...base, components: [{ childId: "missing", quantity: 1, unit: "qt" }] },
  ]) {
    const result = plan([dish, sauce, replacement]);
    assert.equal(result.root.cost, null);
    assert.equal(result.complete, false);
  }
  assert.equal(buildDependencyPlan("missing", recipes, 1, "each"), null);
  const stale = plan([dish, sauce, { ...base, items: [{ ...base.items[0], item: { ...butter, priceUpdatedAt: "2025-01-01T00:00:00Z" } }] }]);
  assert.equal(stale.root.cost, 4);
  assert.equal(stale.stale, true);
});

test("large/deep graphs stop with explicitly partial demand rather than unbounded expansion", () => {
  const deep = Array.from({ length: 40 }, (_, index): DependencyRecipe => ({ ...base, id: String(index), components: index < 39 ? [{ childId: String(index + 1), quantity: 2, unit: "qt" }] : [] }));
  const result = buildDependencyPlan("0", deep, 2, "qt", now)!;
  assert.equal(result.truncated, true);
  assert.equal(result.complete, false);
  assert.equal(result.root.cost, null);
  const wide = { ...dish, items: Array.from({ length: 600 }, () => ({ ...base.items[0] })) };
  assert.equal(plan([wide, sauce, base]).truncated, true);
});

test("consumer tree traces indirect parents and saved plans without changing stored facts", () => {
  const original = JSON.stringify(recipes);
  assert.deepEqual([...parentRecipeIds("base", recipes)].sort(), ["base", "dish", "sauce"]);
  const result = buildConsumerTree("base", recipes, [{ key: "menu:1", recipeId: "dish", kind: "menu", name: "Dinner menu", href: "/menus/1", detail: "ACTIVE", quantity: 1, unit: "batches" }]);
  const fromSauce = result.branches.find(branch => branch.key === "sauce")!;
  assert.match(fromSauce.detail, /100% of parent cost/);
  assert.match(fromSauce.detail, /Milk/);
  assert.equal(fromSauce.children.find(branch => branch.key === "dish")?.children[0].name, "Dinner menu");
  assert.equal(result.truncated, false);
  const cyclic = buildConsumerTree("base", [{ ...base, components: [{ childId: "sauce", quantity: 1, unit: "qt" }] }, sauce], []);
  assert.match(JSON.stringify(cyclic), /Recipe cycle/);
  assert.equal(JSON.stringify(recipes), original);
});
