import assert from "node:assert/strict";
import test from "node:test";
import { hmrCopyData } from "./hmr-copy";
import type { ToGoLine } from "./to-go-rollup";

test("a new monthly rollout keeps menu setup and clears period-specific facts", () => {
  const item: ToGoLine = {
    id: "source-item", recipeId: "shared-recipe", name: "Family meal", section: "Meals", description: "A monthly special",
    sellingUnit: "kit", recipeQtyPerUnit: 0.5, recipeAmountUnit: "lb", price: 18, packagingCost: 0,
    forecastQty: 50, productionQty: 60, actualSoldQty: 42, confidence: "HIGH",
    packingNotes: "Use the family meal container", customerInstructions: "Keep refrigerated",
    notes: "November trial assumption", sortOrder: 3,
  };
  const source = { venueId: "meats", items: [item], status: "COMPLETE", orderCutoff: "2026-11-20", pickupNotes: "November only", notes: "Old plan" };
  const before = structuredClone(source);
  const copy = hmrCopyData(source, "December HMR");
  assert.deepEqual(source, before, "copying must leave the original untouched");
  assert.equal(copy.name, "December HMR");
  assert.equal(copy.venueId, source.venueId);
  assert.equal(copy.status, "DRAFT");
  assert.equal(copy.orderCutoff, null);
  assert.equal(copy.pickupNotes, null);
  assert.equal(copy.notes, null);
  const copied = copy.items.create[0];
  for (const key of ["recipeId", "name", "section", "description", "sellingUnit", "recipeQtyPerUnit", "recipeAmountUnit", "price", "packagingCost", "packingNotes", "customerInstructions", "sortOrder"] as const) {
    assert.equal(copied[key], item[key], key);
  }
  for (const key of ["forecastQty", "productionQty", "actualSoldQty", "notes"] as const) assert.equal(copied[key], null, key);
  assert.equal(copied.confidence, "NEW");
  assert.equal("id" in copied, false);
  assert.equal("rollupId" in copied, false);
});

test("empty menus copy without invented items", () => {
  assert.deepEqual(hmrCopyData({ venueId: null, items: [] }, "Next month").items.create, []);
});
