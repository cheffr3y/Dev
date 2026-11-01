import assert from "node:assert/strict";
import test from "node:test";
import { duplicateIngredientGroups, ingredientNameKey, packageBasisConflict, planIngredientReplacement, type IngredientLine } from "./ingredient-cleanup";
import { parseIngredientForm } from "./ingredient-fields";

const line = (id: string, recipeId: string, quantity: number, unit: string, note: string | null = null): IngredientLine => ({ id, recipeId, quantity, unit, note, recipe: { name: recipeId, version: 1 } });

test("duplicate suggestions match punctuation/order/plurals but retain product distinctions", () => {
  assert.equal(ingredientNameKey("Tomato, Roma"), ingredientNameKey("Roma Tomatoes"));
  assert.equal(ingredientNameKey("Chicken, Airline Breast"), ingredientNameKey("Chicken, Breast Airline"));
  const groups = duplicateIngredientGroups([
    { id: "1", name: "Roma Tomato" }, { id: "2", name: "Tomato, Roma" },
    { id: "3", name: "Tomato, Roma canned" }, { id: "4", name: "Canola Oil" },
    { id: "5", name: "Oil, Canola Blend" }, { id: "6", name: "" }, { id: "7", name: "" },
  ]);
  assert.deepEqual(groups.map(group => group.map(item => item.id)), [["1", "2"]]);
});

test("replacement retains untouched recipe measurements and combines compatible duplicate lines", () => {
  const source = [line("s1", "soup", 1, "lb", "diced"), line("s2", "salad", 3, "oz", "seeded")];
  const plan = planIngredientReplacement("lb", "oz", source, [line("t1", "soup", 8, "oz", "peeled")]);
  assert.equal(plan[0].quantity, 24);
  assert.equal(plan[0].unit, "oz");
  assert.equal(plan[0].note, "peeled\ndiced");
  assert.deepEqual({ quantity: plan[1].quantity, unit: plan[1].unit, note: plan[1].note }, { quantity: 3, unit: "oz", note: "seeded" });
  assert.ok(plan.every(result => !result.error));
  assert.equal(source[0].quantity, 1);
});

test("replacement blocks ambiguous measurement bases and conflicting line units", () => {
  assert.match(planIngredientReplacement("each", "oz", [line("s", "salad", 2, "each")], [])[0].error!, /Purchase units/);
  assert.match(planIngredientReplacement("fl oz", "gallon", [line("s", "salad", 2, "oz")], [line("t", "salad", 1, "fl oz")])[0].error!, /Cannot combine/);
  // A legacy mismatch is preserved when an explicitly chosen replacement has
  // the same purchase basis; do not invent an oil density conversion.
  const legacy = planIngredientReplacement("fl oz", "fl oz", [line("s", "salad", 2, "oz")], [])[0];
  assert.equal(legacy.error, null);
  assert.equal(legacy.quantity, 2);
  assert.equal(legacy.unit, "oz");
});

test("ingredient editor round-trips structured packs, custom categories, yield and allergen tags", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Tomato, Roma", category: "House produce", unit: "lb", unitCost: "1.23456", packSize: "2 x 10 lb", packQty: "20", packUnit: "lb", yieldFactor: "0.9", sku: "TOM", gcode: "G001", vendorId: "vendor" })) form.set(key, value);
  form.append("allergen", "soy"); form.append("allergen", "milk");
  const item = parseIngredientForm(form);
  assert.equal(item.category, "House produce"); assert.equal(item.packQty, 20);
  assert.equal(item.packUnit, "lb"); assert.equal(item.yieldFactor, 0.9);
  assert.equal(item.unitCost, 1.23456); assert.equal(item.allergens, "milk,soy");
  form.set("packQty", "-1"); assert.throws(() => parseIngredientForm(form));
});

test("matching package-unit labels do not imply equal pack sizes", () => {
  const source = { unit: "case", packQty: 6, packUnit: "lb", packSize: "6 lb" };
  assert.equal(packageBasisConflict(source, { ...source, packQty: 12, packSize: "12 lb" }), true);
  assert.equal(packageBasisConflict(source, { ...source }), false);
  assert.equal(packageBasisConflict({ ...source, unit: "lb" }, { ...source, unit: "lb", packQty: 12 }), false);
});
