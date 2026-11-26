import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShoppingList, type ShoppingRecipeNode } from "./shopping";

const oil = { itemId: "oil", name: "Oil, Canola Blend", category: "Oils & Vinegars" };

function list(measure?: { unit: string; densityGPerMl?: number }) {
  const recipe: ShoppingRecipeNode = {
    id: "r", yieldQty: 1, yieldUnit: "each", components: [],
    items: [
      { ...oil, quantity: 1, unit: "quart", measure },
      { ...oil, quantity: 1, unit: "lb", measure },
    ],
  };
  return buildShoppingList([{ recipeId: "r", recipeName: "R", requestedQty: 1, requestedUnit: "each" }], [recipe]);
}

test("weight and volume of one ingredient merge when the ingredient records a density", () => {
  const amounts = list({ unit: "gallon", densityGPerMl: 0.92 }).categories[0].items[0].amounts;
  assert.equal(amounts.length, 1);
  // 1 qt + 1 lb (≈ 16.5 fl oz at 0.92 g/mL) ≈ 48.5 fl oz ≈ 1.52 qt
  assert.equal(amounts[0].unit, "qt");
  assert.ok(Math.abs(amounts[0].qty - 1.515) < 0.01, String(amounts[0].qty));
});

test("without a recorded density the amounts stay separate rather than guessed", () => {
  assert.equal(list().categories[0].items[0].amounts.length, 2);
  assert.equal(list({ unit: "gallon" }).categories[0].items[0].amounts.length, 2);
});

test("count units round up on the pull list", () => {
  const recipe: ShoppingRecipeNode = { id: "r", yieldQty: 1, yieldUnit: "each", components: [],
    items: [{ itemId: "egg", name: "Eggs, Large", category: "Dairy", quantity: 10.83, unit: "eac" }] };
  const amounts = buildShoppingList([{ recipeId: "r", recipeName: "R", requestedQty: 1, requestedUnit: "each" }], [recipe]).categories[0].items[0].amounts;
  assert.deepEqual(amounts, [{ qty: 11, unit: "each" }]);
});
