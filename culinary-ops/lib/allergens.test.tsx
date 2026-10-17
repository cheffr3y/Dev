import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AllergenPicker } from "../components/AllergenPicker";
import { RecipeBuildCard, buildRecipeTree, type RecipeTreeNode } from "../components/RecipeBuild";
import { effectiveAllergens, inheritedAllergenSources, parseAllergens, serializeAllergens, type AllergenNode } from "./allergens";

test("recipes inherit ingredient tags, manual tags and all levels of sub-recipes in canonical order", () => {
  const byId = new Map<string, AllergenNode>([
    ["dish", { allergens: "mustard", items: [{ item: { name: "Cream", allergens: "dairy" } }], components: [{ childId: "sauce" }] }],
    ["sauce", { name: "House sauce", allergens: "fish", items: [{ item: { name: "Mayonnaise", allergens: "eggs,soy" } }], components: [{ childId: "paste" }] }],
    ["paste", { allergens: null, items: [{ name: "Tahini", allergens: "sesame" }], components: [{ childId: "dish" }, { childId: "missing" }] }],
  ]);
  assert.deepEqual(effectiveAllergens("dish", byId), ["milk", "eggs", "fish", "soy", "sesame", "mustard"]);
  assert.deepEqual([...inheritedAllergenSources("dish", byId)], [
    ["milk", "Cream"], ["fish", "House sauce"], ["eggs", "House sauce"],
    ["soy", "House sauce"], ["sesame", "House sauce"],
  ]);
  assert.deepEqual(effectiveAllergens("missing", byId), []);
});

test("ingredient tag edits propagate dynamically without overwriting manual recipe tags", () => {
  const ingredient = { name: "Cream", allergens: "milk" as string | null };
  const recipe: AllergenNode = { allergens: "milk,wheat", items: [{ item: ingredient }], components: [] };
  const byId = new Map([["dish", recipe]]);
  assert.deepEqual(effectiveAllergens("dish", byId), ["milk", "wheat"]);
  assert.equal(inheritedAllergenSources("dish", byId).size, 0);
  ingredient.allergens = "soy";
  assert.deepEqual(effectiveAllergens("dish", byId), ["milk", "wheat", "soy"]);
  ingredient.allergens = null;
  assert.deepEqual(effectiveAllergens("dish", byId), ["milk", "wheat"]);
  assert.equal(recipe.allergens, "milk,wheat");
  recipe.allergens = null;
  ingredient.allergens = "milk";
  assert.deepEqual([...inheritedAllergenSources("dish", byId)], [["milk", "Cream"]]);
  ingredient.allergens = null;
  assert.deepEqual(effectiveAllergens("dish", byId), []);
});

test("duplicate sources deduplicate and absent historical ingredient tags add nothing", () => {
  const byId = new Map<string, AllergenNode>([
    ["dish", { allergens: "dairy,unknown", items: [{ item: { name: "Legacy ingredient" } }, { name: "Butter", allergens: "milk" }], components: [{ childId: "sauce" }] }],
    ["sauce", { allergens: "milk", components: [{ childId: "dish" }] }],
  ]);
  assert.deepEqual(effectiveAllergens("dish", byId), ["milk"]);
  assert.equal(inheritedAllergenSources("dish", byId).size, 0);
  assert.equal(serializeAllergens(["soy", "milk", "soy", "unknown"]), "milk,soy");
  assert.deepEqual(parseAllergens("dairy,egg,soya"), ["milk", "eggs", "soy"]);
});

test("ingredient picker has editable tags; recipe picker does not submit inherited tags", () => {
  const ingredient = renderToStaticMarkup(<AllergenPicker selected={["milk"]} />);
  assert.match(ingredient, /<legend[^>]*>Allergens<\/legend>/);
  assert.match(ingredient, /<input(?=[^>]*name="allergen")(?=[^>]*value="milk")(?=[^>]*checked="")[^>]*>/);
  assert.doesNotMatch(ingredient, /disabled=""/);
  const recipe = renderToStaticMarkup(<AllergenPicker selected={["wheat"]} inherited={new Map([["milk", "Cream"]])} />);
  assert.match(recipe, /<input(?=[^>]*name="allergen")(?=[^>]*value="milk")(?=[^>]*checked="")(?=[^>]*disabled="")[^>]*>/);
  assert.match(recipe, /Inherited from “Cream”/);
  assert.match(recipe, /<input(?=[^>]*name="allergen")(?=[^>]*value="wheat")(?=[^>]*checked="")[^>]*>/);
});

test("print trees carry captured ingredient tags into parent profiles and keep old snapshots unchanged", () => {
  const row = {
    id: "child", name: "Sauce", prodCode: "SCE", version: 1,
    yieldQty: 1, yieldUnit: "qt", instructions: null, allergens: null, criticalNotes: null,
    items: [{ id: "cream", quantity: 1, unit: "qt", note: null, item: { name: "Cream", allergens: "milk" } }],
    components: [],
  };
  const byId = buildRecipeTree([row]);
  const parent: RecipeTreeNode = { ...byId.get("child")!, id: "parent", name: "Soup", prodCode: "SUP", items: [], components: [{ id: "sauce", childId: "child", quantity: 1, unit: "qt" }] };
  byId.set(parent.id, parent);
  const html = renderToStaticMarkup(<RecipeBuildCard node={parent} byId={byId} totalBatches={1} compact={false} depth={0} stack={new Set()} />);
  const firstProfile = html.slice(html.indexOf("Allergen Profile"), html.indexOf('class="recipe-workspace'));
  assert.match(firstProfile, /Milk/);
  row.items[0].item.allergens = "soy";
  assert.deepEqual(effectiveAllergens(parent.id, byId), ["milk"]);
  const legacy = buildRecipeTree([{ ...row, items: [{ ...row.items[0], item: { name: "Cream" } }] }]);
  assert.deepEqual(effectiveAllergens("child", legacy), []);
});
