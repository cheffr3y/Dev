import test from "node:test";
import assert from "node:assert/strict";
import { guideAmounts, type GuideRow } from "./workspace-options";
const row: GuideRow = { id: "line", par: 32, unit: "oz", stock: { quantity: 1, unit: "lb" }, item: { id: "butter", name: "Butter", category: "Dairy", allergens: "milk", unit: "lb", unitCost: 8, packSize: "40 lb", vendorId: null, sku: null, gcode: null } };
test("order guide estimates normalize stock and cost units without rounding away demand", () => {
  assert.deepEqual(guideAmounts(row), { have: 16, need: 16, cost: 8 });
  assert.deepEqual(guideAmounts({ ...row, par: 16.5 }), { have: 16, need: 0.5, cost: 0.25 });
  assert.deepEqual(guideAmounts({ ...row, par: 8 }), { have: 16, need: 0, cost: 0 });
});
test("order guides expose incompatible stock/cost units and missing prices instead of totals", () => {
  assert.deepEqual(guideAmounts({ ...row, unit: "each" }), { have: null, need: null, cost: null });
  assert.deepEqual(guideAmounts({ ...row, item: { ...row.item, unit: "gal" } }), { have: 16, need: 16, cost: null });
  assert.equal(guideAmounts({ ...row, item: { ...row.item, unitCost: 0 } }).cost, null);
  assert.deepEqual(guideAmounts({ ...row, stock: null }), { have: 0, need: 32, cost: 16 });
});
