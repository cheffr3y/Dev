import assert from "node:assert/strict";
import test from "node:test";
import { buildPrepCostDetail } from "./prep-cost-detail";
import { defaultPrepReportRange } from "./prep-report";
import { createXlsx } from "./xlsx";

test("weekly accounting range runs Sunday through Saturday", () => {
  assert.deepEqual(defaultPrepReportRange(new Date("2026-09-02T12:00:00Z")), {
    from: "2026-08-30",
    to: "2026-09-05",
  });
});

test("ingredient detail explodes sub-recipes and scales to actual production", () => {
  const rows = buildPrepCostDetail("finished", 4, "gal", [
    {
      id: "finished",
      yieldQty: 2,
      yieldUnit: "gal",
      items: [{
        itemId: "salt",
        quantity: 1,
        unit: "oz",
        item: { name: "Salt", category: "Spices", unit: "lb", unitCost: 2, sku: null, gcode: "G-SALT" },
      }],
      components: [{ childId: "sauce", quantity: 1, unit: "gal" }],
    },
    {
      id: "sauce",
      yieldQty: 1,
      yieldUnit: "gal",
      items: [{
        itemId: "tomato",
        quantity: 3,
        unit: "lb",
        item: { name: "Tomato", category: "Produce", unit: "lb", unitCost: 1.5, sku: "T1", gcode: "G-TOM" },
      }],
      components: [],
    },
  ]);

  assert.deepEqual(rows.map((r) => [r.itemName, r.quantity, r.unit, r.extendedCost]), [
    ["Tomato", 6, "lb", 9],
    ["Salt", 0.125, "lb", 0.25],
  ]);
});

test("xlsx writer creates a ZIP-based Excel workbook", () => {
  const output = createXlsx([{ name: "Test", title: "Test workbook", headers: ["Name", "Cost"], rows: [["Soup", 2.5]], currencyColumns: [1] }]);
  assert.equal(output.subarray(0, 2).toString(), "PK");
  assert.ok(output.includes(Buffer.from("xl/worksheets/sheet1.xml")));
  assert.ok(output.includes(Buffer.from("Soup")));
});
