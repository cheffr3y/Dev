import assert from "node:assert/strict";
import test from "node:test";
import { nameHasNotes, similarCategoryGroups, stepLooksClipped, unitProblems, type LineForUnits } from "./cleanup-checks";

test("similar categories group when one name's words sit inside another's", () => {
  assert.deepEqual(similarCategoryGroups(["Spices", "Spices & Seasonings", "Produce", "Dairy", "dairy ", "Frozen"]),
    [["dairy", "Dairy"], ["Spices", "Spices & Seasonings"]].map(group => group.sort((a, b) => a.localeCompare(b))));
  assert.deepEqual(similarCategoryGroups(["Dry Goods", "Dry good", "Paper & Disposables", "Cleaning & Chemicals"]), [["Dry good", "Dry Goods"]]);
  assert.deepEqual(similarCategoryGroups(["Protein", "Poultry", "Seafood", "Other", ""]), []);
});

test("clipped steps start lowercase; normal steps don't", () => {
  assert.equal(stepLooksClipped("lace brisket in the smoker"), true);
  assert.equal(stepLooksClipped("Place brisket in the smoker"), false);
  assert.equal(stepLooksClipped("350°F oven for 20 min"), false);
});

test("names with notes typed in are flagged", () => {
  assert.equal(nameHasNotes("Mustard Powder[please add as cross-reference]"), true);
  assert.equal(nameHasNotes("Sauce?? check vendor"), true);
  assert.equal(nameHasNotes("Black Pepper, Coarse Grind"), false);
  assert.equal(nameHasNotes("Checkerboard Cookie"), false);
});

test("unit problems list lines that can't convert to the purchase unit, grouped by ingredient", () => {
  const ketchup = { id: "k", name: "Ketchup", unit: "fl oz" };
  const oil = { id: "o", name: "Oil, Canola Blend", unit: "qt" };
  const oilWithDensity = { ...oil, densityGPerMl: 0.92, measurementReviewedAt: new Date() };
  const line = (recipeId: string, unit: string, item: LineForUnits["item"]): LineForUnits => ({ recipeId, recipeName: recipeId, quantity: 2, unit, item });
  const problems = unitProblems([
    line("bbq", "oz", ketchup), line("slaw", "oz", ketchup), line("slaw", "fl oz", ketchup),
    line("fry", "lb", oil), line("fry", "cup", oil),
  ]);
  assert.deepEqual(problems.map(p => [p.itemName, p.units, p.recipes.map(r => r.id)]), [
    ["Ketchup", ["oz"], ["bbq", "slaw"]],
    ["Oil, Canola Blend", ["lb"], ["fry"]],
  ]);
  assert.deepEqual(unitProblems([line("fry", "lb", oilWithDensity)]), []);
});
