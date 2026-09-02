import assert from "node:assert/strict";
import test from "node:test";
import { buildFestivalAccounting } from "./festival-accounting";

test("festival accounting includes labor, fixed costs, and revenue fees", () => {
  const result = buildFestivalAccounting(10_000, 2_500, {
    laborHours: 40,
    laborRate: 25,
    boothFee: 500,
    equipmentCost: 250,
    disposablesCost: 200,
    transportCost: 150,
    otherCost: 100,
    salesFeePct: 0.03,
    targetMarginPct: 0.2,
  });

  assert.equal(result.laborCost, 1_000);
  assert.equal(result.fixedCosts, 2_200);
  assert.equal(result.salesFees, 300);
  assert.equal(result.totalCost, 5_000);
  assert.equal(result.projectedProfit, 5_000);
  assert.equal(result.netMarginPct, 0.5);
});

test("target revenue solves for fees and desired net margin", () => {
  const result = buildFestivalAccounting(5_000, 2_000, {
    laborHours: 0,
    laborRate: 0,
    boothFee: 1_000,
    equipmentCost: 0,
    disposablesCost: 0,
    transportCost: 0,
    otherCost: 0,
    salesFeePct: 0.05,
    targetMarginPct: 0.2,
  });

  assert.equal(result.breakEvenRevenue, 3_000 / 0.95);
  assert.equal(result.targetRevenue, 4_000);
  assert.equal(result.revenueGap, 0);
  assert.equal(result.priceMultiplier, 0.8);
});

test("an impossible fee plus target margin reports no target revenue", () => {
  const result = buildFestivalAccounting(0, 100, {
    laborHours: 0,
    laborRate: 0,
    boothFee: 0,
    equipmentCost: 0,
    disposablesCost: 0,
    transportCost: 0,
    otherCost: 0,
    salesFeePct: 0.9,
    targetMarginPct: 0.2,
  });

  assert.equal(result.netMarginPct, null);
  assert.equal(result.targetRevenue, null);
  assert.equal(result.revenueGap, null);
  assert.equal(result.priceMultiplier, null);
});
