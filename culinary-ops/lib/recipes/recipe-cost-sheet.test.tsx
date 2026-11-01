import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeCosting } from "../../components/RecipeCosting";
import { costPerYieldUnit, costUnitLabel, money, type RecipeCostNode } from "./costing";
import { recipeCostSheet, type CostSheetRecipe } from "./recipe-cost-sheet";

const stock: RecipeCostNode = {
  id: "stock", yieldQty: 2, yieldUnit: "qt",
  items: [{ quantity: 1, unit: "lb", item: { unit: "oz", unitCost: 0.5 } }],
  components: [],
};
const sauce: RecipeCostNode = {
  id: "sauce", yieldQty: 1, yieldUnit: "qt", items: [],
  components: [{ childId: stock.id, quantity: 16, unit: "fl oz" }],
};
const recipe: CostSheetRecipe = {
  id: "dish", yieldQty: 5, yieldUnit: "lb", menuPrice: 8,
  items: [{ id: "butter", quantity: 8, unit: "oz", item: { name: "Butter", unit: "lb", unitCost: 4 } }],
  components: [{ id: "sauce-line", childId: sauce.id, child: { name: "Sauce" }, quantity: 8, unit: "fl oz" }],
};
const catalog = [recipe, sauce, stock];

test("costing includes converted ingredients and nested sub-recipes without rounding early", () => {
  const sheet = recipeCostSheet(recipe, catalog, 1);
  assert.equal(sheet.ingredientsCost, 2);
  assert.equal(sheet.componentsCost, 0.5);
  assert.equal(sheet.totalCost, 2.5);
  assert.equal(sheet.perUnit, 0.5);
  assert.equal(sheet.costUnit, "lb");
  assert.equal(sheet.components[0].unitCost, 2);
  assert.equal(sheet.components[0].costUnit, "qt");
  assert.equal(sheet.components[0].converted, true);
  assert.equal(sheet.foodCostPercent, 6.25);
});

test("2x and 4x batches scale yield, quantities and totals while rates and food cost stay fixed", () => {
  for (const scale of [2, 4]) {
    const sheet = recipeCostSheet(recipe, catalog, scale);
    assert.equal(sheet.ingredients[0].quantity, 8 * scale);
    assert.equal(sheet.components[0].quantity, 8 * scale);
    assert.equal(sheet.ingredients[0].cost, 2 * scale);
    assert.equal(sheet.components[0].cost, 0.5 * scale);
    assert.equal(sheet.totalCost, 2.5 * scale);
    assert.equal(sheet.perUnit, 0.5);
    assert.equal(sheet.ingredients[0].unitCost, 4);
    assert.equal(sheet.components[0].unitCost, 2);
    assert.equal(sheet.menuPrice, 8);
    assert.equal(sheet.foodCostPercent, 6.25);
  }
});

test("yield rates label servings, grams, ounces, volume and free-text yields correctly", () => {
  for (const [unit, label] of [
    ["servings", "serving"], ["Serving", "serving"], [" portions ", "portion"],
    ["gram", "g"], ["oz", "oz"], ["lbs", "lb"], ["gallons", "gal"],
    ["fl oz", "fl oz"], ["each", "each"], ["batch", "batch"],
  ]) assert.equal(costUnitLabel(unit), label);
  assert.ok(Math.abs(costPerYieldUnit(4.69, 5) - 0.938) < 1e-12);
  const grams = recipeCostSheet({ ...recipe, yieldQty: 2500, yieldUnit: "gram" }, catalog, 1);
  assert.equal(grams.costUnit, "g");
  assert.equal(grams.perUnit, 0.001);
  assert.equal(money(grams.perUnit, 5), "$0.001");
  assert.equal(costPerYieldUnit(4, 0), 0);
});

test("print breakdown shows scaled costs, unit labels and optional menu pricing", () => {
  const html = renderToStaticMarkup(<RecipeCosting costs={recipeCostSheet(recipe, catalog, 4)} />);
  assert.match(html, /Recipe Costing/);
  assert.match(html, /Cost \/ lb/);
  assert.doesNotMatch(html, /serving/i);
  assert.match(html, /32 oz/);
  assert.match(html, /32 fl oz/);
  assert.match(html, /\$4\.00 \/ lb/);
  assert.match(html, /\$2\.00 \/ qt/);
  assert.match(html, /\$10\.00/);
  assert.match(html, /Menu price \/ lb/);
  assert.match(html, /6\.3%/);
  const noMenu = renderToStaticMarkup(<RecipeCosting costs={recipeCostSheet({ ...recipe, menuPrice: null }, catalog, 1)} />);
  assert.doesNotMatch(noMenu, /Menu price|Food cost %/);
});

test("print costing retains unit mismatch indicators", () => {
  const mismatch: CostSheetRecipe = {
    ...recipe,
    items: [{ ...recipe.items[0], unit: "cup" }],
    components: [{ ...recipe.components[0], unit: "lb" }],
  };
  const sheet = recipeCostSheet(mismatch, catalog, 1);
  assert.equal(sheet.ingredients[0].converted, false);
  assert.equal(sheet.components[0].converted, false);
  const html = renderToStaticMarkup(<RecipeCosting costs={sheet} />);
  assert.equal(html.match(/Unit mismatch — verify cost/g)?.length, 2);
});
