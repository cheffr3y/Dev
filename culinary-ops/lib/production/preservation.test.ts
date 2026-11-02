import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preservationCatalogCost, preservationCreateSchema, preservationFinishSchema, preservationMetrics, type PreservationFacts, type PreservationInput } from "./preservation";

const input: PreservationInput = { id: randomUUID(), name: "Dried mushrooms", venueId: "venue", recipeId: null, itemId: "item", method: "Dehydration", productionDate: "2026-10-01", startedAt: "2026-10-01T12:00:00Z", unit: "lb", wetGross: 12, wetTare: 2, inputCost: 100, costNotes: "Reviewed invoice", equipment: "Dehydrator", temperature: 130, temperatureUnit: "F", humidity: 40, cycleMinutes: 2880, shelfLife: "Assigned storage instructions", useBy: "2026-10-10", allergens: [], notes: "" };
const finished = { gross: 3, tare: 1, finishedAt: "2026-10-03T12:00:00Z", notes: "" };
const facts: PreservationFacts = { version: 1, input, finished, recipe: null, item: { id: "item", name: "Dried mushrooms", unit: "oz" }, venueName: "Kitchen", allergens: "", posting: null, void: null };
test("preservation yields use net weights, actual multi-day elapsed time and concentrated input cost", () => {
  assert.deepEqual(preservationMetrics(input, finished), { wet: 10, finished: 2, yieldPct: 20, lossPct: 80, elapsedMinutes: 2880, unitCost: 50 });
  assert.equal(preservationCatalogCost(facts, "oz"), 3.125);
  assert.equal(preservationCatalogCost(facts, "lb"), 50);
  assert.equal(preservationCatalogCost(facts, "case"), null);
  assert.equal(preservationCatalogCost(facts, "qt"), null);
});
test("running and zero-yield batches retain missing versus zero values without infinite costs", () => {
  assert.equal(preservationMetrics(input, null).finished, null);
  const zero = { ...finished, gross: 1, tare: 1 };
  assert.equal(preservationMetrics(input, zero).yieldPct, 0);
  assert.equal(preservationMetrics(input, zero).lossPct, 100);
  assert.equal(preservationMetrics(input, zero).unitCost, null);
  assert.equal(preservationCatalogCost({ ...facts, finished: zero }, "lb"), null);
  assert.equal(preservationMetrics({ ...input, inputCost: 0 }, finished).unitCost, 0);
});
test("invalid measurements and reversed times reject, while gains and floating-point noise stay explicit", () => {
  assert.throws(() => preservationMetrics({ ...input, wetTare: 12 }, finished));
  assert.throws(() => preservationMetrics({ ...input, wetGross: -1, wetTare: -2 }, finished));
  assert.throws(() => preservationMetrics({ ...input, inputCost: NaN }, finished));
  assert.throws(() => preservationMetrics(input, { ...finished, gross: 0 }));
  assert.throws(() => preservationMetrics(input, { ...finished, finishedAt: "2026-09-01T00:00:00Z" }));
  assert.equal(preservationMetrics(input, { ...finished, gross: 13 }).yieldPct, 120);
  assert.equal(preservationMetrics(input, { ...finished, gross: 13 }).lossPct, -20);
  assert.equal(preservationMetrics({ ...input, wetGross: 0.3, wetTare: 0.1 }, { ...finished, gross: 0.2, tare: 0 }).yieldPct, 100);
});
test("schemas preserve explicit dates and reject impossible dates, tares, humidity and unknown units", () => {
  assert.equal(preservationCreateSchema.parse(input).useBy, "2026-10-10");
  for (const change of [{ productionDate: "2026-02-30" }, { useBy: "2026-09-01" }, { unit: "gal" }, { humidity: 101 }, { wetTare: 13 }, { inputCost: -1 }]) assert.equal(preservationCreateSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(preservationFinishSchema.safeParse({ ...finished, tare: 4 }).success, false);
});
test("catalog cost conversion and calculations do not mutate frozen source facts", () => {
  const original = JSON.stringify(facts);
  preservationCatalogCost(facts, "gram"); preservationMetrics(input, finished);
  assert.equal(JSON.stringify(facts), original);
  assert.equal(preservationCatalogCost({ ...facts, input: { ...input, inputCost: 1e8 }, finished: { ...finished, gross: 1e-12, tare: 0 } }, "lb"), null);
});
