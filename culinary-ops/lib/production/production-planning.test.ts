import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchasingList, planningRange, type PlanningSource, type PurchasingItem } from "./production-planning";
import type { ShoppingRecipeNode } from "../purchasing/shopping";

const item: PurchasingItem = { id: "tomato", name: "Tomato", category: "Produce", unit: "lb", yieldFactor: 0.5, packQty: 5, packUnit: "lb", packSize: "5 lb case", sku: "TOM", vendor: { name: "Produce Vendor" } };
const sauce: ShoppingRecipeNode = { id: "sauce", yieldQty: 4, yieldUnit: "quart", items: [{ itemId: item.id, name: item.name, category: item.category, quantity: 16, unit: "oz" }], components: [] };
const source = (id: string, quantity = 4): PlanningSource => ({ id, kind: "Banquet", name: id, date: "2026-12-10", dateLabel: "Service date", time: "5pm", destination: "Ballroom", venueId: "v", notes: "", href: "/", packetHref: "/", lines: [{ id: `${id}-line`, recipeId: "sauce", name: "Sauce", quantity, unit: "quart", notes: "" }] });
test("purchasing combines raw demand with source contributions, usable yield and pack rounding; selected sources count once", () => {
  const a = source("Wedding", 12), b = source("Dinner", 8);
  const plan = buildPurchasingList([a, b, a], [sauce], [item]);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].quantity, 10);
  assert.deepEqual(plan.rows[0].contributions.map(p => p.quantity), [6, 4]);
  assert.equal(plan.rows[0].suggestedPacks, 2);
  assert.equal(plan.sourceCount, 2);
  assert.deepEqual(plan.warnings, []);
  assert.equal(a.lines[0].quantity, 12);
});
test("shared nested paths add correctly, including diamonds", () => {
  const branch = (id: string): ShoppingRecipeNode => ({ id, yieldQty: 1, yieldUnit: "each", items: [], components: [{ childId: sauce.id, quantity: 4, unit: "quart" }] });
  const root: ShoppingRecipeNode = { id: "root", yieldQty: 1, yieldUnit: "each", items: [], components: [{ childId: "a", quantity: 1, unit: "each" }, { childId: "b", quantity: 1, unit: "each" }] };
  const event = source("Event"); event.lines[0] = { ...event.lines[0], recipeId: "root", quantity: 1, unit: "each" };
  assert.equal(buildPurchasingList([event], [root, branch("a"), branch("b"), sauce], [item]).rows[0].quantity, 4);
});
test("bad nested conversions, missing recipes and cycles never publish partial root demand", () => {
  for (const childId of ["missing", "sauce"]) {
    const bad = { ...sauce, components: [{ childId, quantity: 1, unit: "quart" }] };
    const plan = buildPurchasingList([source("Bad")], [bad], [item]);
    assert.equal(plan.rows.length, 0); assert.equal(plan.warnings.length, 1);
  }
  const bad = { ...sauce, components: [{ childId: "child", quantity: 1, unit: "lb" }] };
  const plan = buildPurchasingList([source("Bad")], [bad, { ...sauce, id: "child" }], [item]);
  assert.equal(plan.rows.length, 0); assert.match(plan.warnings[0], /Cannot scale/);
});
test("incompatible ingredient units stay separate and are explicitly labeled as recipe use", () => {
  const mixed = { ...sauce, items: [...sauce.items, { ...sauce.items[0], quantity: 2, unit: "cup" }] };
  const plan = buildPurchasingList([source("Mixed")], [mixed], [item]);
  assert.equal(plan.rows.length, 2);
  const unknown = plan.rows.find(r => r.unit === "cup")!;
  assert.match(unknown.basis, /review/); assert.equal(unknown.quantity, 2); assert.equal(unknown.suggestedPacks, null);
  assert.ok(plan.warnings.some(w => /incompatible unit/.test(w)));
});
test("frozen source recipes override current recipe demand without modifying either", () => {
  const frozen = source("Printed"); frozen.recipes = [sauce];
  const plan = buildPurchasingList([frozen], [{ ...sauce, items: [{ ...sauce.items[0], quantity: 1600 }] }], [item]);
  assert.equal(plan.rows[0].quantity, 2);
  assert.equal(sauce.items[0].quantity, 16);
});
test("unknown quantities and mappings are warnings; explicit zero adds no demand", () => {
  const incomplete = source("Retail"); incomplete.lines[0].quantity = null;
  assert.equal(buildPurchasingList([incomplete], [sauce], [item]).rows.length, 0);
  assert.equal(buildPurchasingList([source("Zero", 0)], [sauce], [item]).rows.length, 0);
  const warning = source("Mapping"); warning.lines[0].warning = "Package undecided";
  assert.match(buildPurchasingList([warning], [sauce], [item]).warnings[0], /Package undecided/);
});
test("planning dates validate real Chicago business date labels and a bounded inclusive range", () => {
  assert.equal(planningRange("2026-12-01", "2026-12-31").end.toISOString(), "2027-01-01T00:00:00.000Z");
  for (const range of [["2026-12-02", "2026-12-01"], ["2026-02-30", "2026-03-01"], ["2026-12-01", "2027-01-01"]]) assert.throws(() => planningRange(range[0], range[1]));
});
