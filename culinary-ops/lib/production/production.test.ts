import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRODUCTION_LABOR_RATE,
  allocateCurrencyByWeight,
  availableBatchQuantity,
  batchLaborCost,
  prorateTransferCost,
  reconcileExcludedFood,
} from "./production";

test("production rate preserves the exact average while display can round", () => {
  assert.equal(DEFAULT_PRODUCTION_LABOR_RATE, 62 / 3);
  assert.equal(DEFAULT_PRODUCTION_LABOR_RATE.toFixed(2), "20.67");
  assert.equal(batchLaborCost(60, DEFAULT_PRODUCTION_LABOR_RATE), 62 / 3);
});

test("split transfers preserve separate food and labor pools", () => {
  const half = prorateTransferCost({
    outputQty: 10, outputUnit: "lb", foodCost: 100,
    productionMinutes: 90, productionLaborCost: 31,
    dishwasherMinutes: 30, dishwasherLaborCost: 9,
  }, 5, "lb", 12);
  assert.deepEqual(half, {
    ratio: 0.5, foodCostBeforeExclusions: 50, excludedFoodCost: 12, netFoodCost: 38,
    productionMinutes: 45, productionLaborCost: 15.5,
    dishwasherMinutes: 15, dishwasherLaborCost: 4.5, totalTransferCost: 58,
  });
});

test("partial exclusions cannot leak outside one venue transfer", () => {
  assert.equal(reconcileExcludedFood(3, 2.5, 10), 5.5);
  assert.throws(() => reconcileExcludedFood(8, 3, 10));
});

test("cross-day pickups consume captured batch stock without going negative", () => {
  assert.equal(availableBatchQuantity({
    outputQty: 2, outputUnit: "gallon",
    transfers: [{ quantity: 2, unit: "quart" }, { quantity: 1, unit: "quart" }],
    adjustments: [{ quantity: -1, unit: "quart" }],
  }), 1);
});

test("dishwasher rounding reconciles to the daily total", () => {
  const allocation = allocateCurrencyByWeight(10, [1, 1, 1]);
  assert.deepEqual(allocation, [3.34, 3.33, 3.33]);
  assert.equal(allocation.reduce((sum, n) => sum + n, 0), 10);
  assert.throws(() => allocateCurrencyByWeight(10, [0, 0]));
});
