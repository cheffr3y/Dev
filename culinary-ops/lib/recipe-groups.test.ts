import assert from "node:assert/strict";
import test from "node:test";
import { groupMiseLines } from "./recipe-groups";

test("automatic stages combine related categories and keep sub-recipes first", () => {
  const groups = groupMiseLines([
    { category: "Dairy" }, { category: "Bakery" }, { category: "Seafood" },
    { category: "Poultry" }, { category: "Produce" }, { category: "Unknown legacy value" }, { subRecipe: true },
  ]);
  assert.deepEqual(groups.map(group => group.label), ["House Sub-Recipes", "Produce & Botanicals", "Proteins & Seafood", "Dairy & Emulsion", "Pantry, Acids & Lipids", "Seasonings & Aromatics"]);
  assert.equal(groups[2].lines.length, 2);
});
test("one manual group switches the entire recipe to custom groups and stable row order", () => {
  const groups = groupMiseLines([
    { id: "a", groupName: "Emulsion", category: "Dairy", sortOrder: 20 },
    { id: "b", groupName: "Herb base", category: "Produce", sortOrder: 5 },
    { id: "c", groupName: "Emulsion", category: "Produce", sortOrder: 10 },
    { id: "d", category: "Seafood", sortOrder: 25 },
  ]);
  assert.deepEqual(groups.map(group => group.label), ["Herb base", "Emulsion", "Ungrouped"]);
  assert.deepEqual(groups[1].lines.map(line => line.id), ["c", "a"]);
  assert.equal(groupMiseLines([{ category: "Produce" }]).length, 1);
});
