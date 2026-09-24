import test from "node:test";
import assert from "node:assert/strict";
import { canOrderForVenue, assertOrderVenue } from "./prep-access";
import { groupPrepRequests, type PrepRequest } from "./prep-worksheet";
const row: PrepRequest = {
  id: "a",
  prepOrderId: "order",
  recipeId: "beans",
  recipeName: "Borracho Beans",
  yieldQty: 128,
  yieldUnit: "fl oz",
  productionPersonMinutes: 30,
  venueId: "brewpub",
  venueName: "Brewpub",
  quantity: 2,
  unit: "qt",
  lot: null,
  status: "REQUESTED",
};
test("chefs can order only for their assigned venue, including managers", () => {
  for (const role of ["STAFF", "MANAGER"] as const) {
    assert.ok(canOrderForVenue({ role, homeVenueId: "brewpub" }, "brewpub"));
    assert.throws(
      () => assertOrderVenue({ role, homeVenueId: "brewpub" }, "butcher"),
      /assigned venue/,
    );
    assert.throws(
      () => assertOrderVenue({ role, homeVenueId: null }, "brewpub"),
      /assign your home venue/,
    );
  }
  assert.ok(canOrderForVenue({ role: "ADMIN", homeVenueId: null }, "butcher"));
});
test("worksheet preserves a shared requested unit and individual request links", () => {
  const [group] = groupPrepRequests([
    row,
    { ...row, id: "b", venueId: "butcher", quantity: 3 },
  ]);
  assert.equal(group.unit, "qt");
  assert.equal(group.requested, 5);
  assert.deepEqual(
    group.rows.map((r) => r.id),
    ["a", "b"],
  );
});
test("mixed requested units convert to the recipe output unit; incompatible units are visible", () => {
  const [group] = groupPrepRequests([
    row,
    { ...row, id: "b", quantity: 1, unit: "gal" },
  ]);
  assert.equal(group.unit, "fl oz");
  assert.equal(group.requested, 192);
  assert.equal(
    groupPrepRequests([row, { ...row, id: "b", unit: "lb" }])[0].requested,
    null,
  );
});
