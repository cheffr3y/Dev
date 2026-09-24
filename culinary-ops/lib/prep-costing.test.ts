import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateCents,
  captureCost,
  snapshot,
  completeCost,
  returnCredit,
  type CapturedRecipe,
} from "./prep-costing";
import { chicagoToday, businessDate } from "./prep-dates";
const recipe: CapturedRecipe = {
  id: "sauce",
  name: "Sauce",
  yieldQty: 22,
  yieldUnit: "qt",
  productionPersonMinutes: 60,
  items: [
    {
      id: "cream-line",
      itemId: "cream",
      quantity: 22,
      unit: "qt",
      item: { name: "Cream", unit: "qt", unitCost: 2, gcode: "CREAM" },
    },
  ],
  components: [],
};
const capture = (weights = [10, 12], share = 0) =>
  captureCost({
    recipeId: recipe.id,
    recipes: [structuredClone(recipe)],
    quantity: 22,
    unit: "qt",
    weights,
    share,
    productionMinutes: null,
    dishwasherMinutes: 10,
    supplies: [],
  });
test("shared production splits 22 quarts 10/12 and reconciles each cost pool in cents", () => {
  const a = snapshot(capture()),
    b = snapshot(capture([10, 12], 1));
  assert.equal(a.charge.gross, 2000);
  assert.equal(b.charge.gross, 2400);
  assert.equal(a.charge.production! + b.charge.production!, 2067);
  assert.equal(a.charge.dishwasher! + b.charge.dishwasher!, 300);
  assert.equal(a.charge.total! + b.charge.total!, 6767);
});
test("retained output gets costs without creating a venue charge", () => {
  const a = snapshot(capture([10, 10, 2])),
    b = snapshot(capture([10, 10, 2], 1)),
    kept = snapshot(capture([10, 10, 2], 2));
  assert.equal(a.charge.total! + b.charge.total! + kept.charge.total!, 6767);
  assert.ok(a.charge.total! + b.charge.total! < 6767);
});
test("partial ingredient exclusions keep both labor charges", () => {
  const c = capture();
  c.supplies = [
    {
      itemId: "cream",
      quantity: 2,
      unit: "qt",
      venueId: "butcher",
      note: "Delivered cream",
      shared: false,
    },
  ];
  const s = snapshot(c);
  assert.equal(s.charge.excluded, 400);
  assert.equal(s.charge.net, 1600);
  assert.equal(s.charge.production, snapshot(capture()).charge.production);
  assert.equal(s.charge.dishwasher, snapshot(capture()).charge.dishwasher);
  assert.throws(
    () => snapshot({ ...c, supplies: [{ ...c.supplies[0], quantity: 11 }] }),
    /exceeds/,
  );
});
test("nested recipes expand ingredients without duplicating preparation labor", () => {
  const c = capture([22]);
  c.recipes[0].items = [];
  c.recipes[0].components = [
    { id: "sub", childId: "nested", quantity: 2, unit: "qt" },
  ];
  c.recipes.push({
    ...structuredClone(recipe),
    id: "nested",
    yieldQty: 2,
    productionPersonMinutes: 999,
  });
  const s = snapshot(c);
  assert.equal(s.charge.gross, 4400);
  assert.equal(s.charge.production, 2067);
});
test("missing prices and GCODEs hold full charge; captured prices survive completion", () => {
  const c = capture();
  c.recipes[0].items[0].item.unitCost = null;
  c.recipes[0].items[0].item.gcode = null;
  const s = snapshot(c);
  assert.equal(s.charge.gross, null);
  assert.equal(s.charge.total, null);
  const filled = completeCost(s, {
    prices: { "cream-line": 3 },
    gcodes: { "cream-line": "C" },
  });
  assert.equal(filled.charge.gross, 3000);
  assert.ok(filled.charge.total);
  assert.equal(s.charge.gross, null);
  assert.throws(
    () => completeCost(filled, { prices: { "cream-line": 100 } }),
    /cannot be changed/,
  );
});
test("incompatible ingredients and sub-recipe units remain unknown until explicit conversions", () => {
  const c = capture();
  c.recipes[0].items[0].unit = "lb";
  const s = snapshot(c);
  assert.equal(s.charge.gross, null);
  assert.ok(s.charge.issues.some((i) => i.startsWith("UNIT:cream-line:")));
  assert.equal(
    completeCost(s, { conversions: { "cream-line": 1 } }).charge.gross,
    2000,
  );
  const nested = capture();
  nested.recipes[0].components = [
    { id: "edge", childId: "child", quantity: 1, unit: "lb" },
  ];
  nested.recipes.push({ ...structuredClone(recipe), id: "child" });
  const n = snapshot(nested);
  assert.equal(n.charge.total, null);
  assert.equal(n.charge.gross, null);
  assert.ok(completeCost(n, { conversions: { edge: 22 } }).charge.total);
});
test("explicit zero labor differs from missing; standards and overrides use exact rates", () => {
  const c = capture();
  c.productionMinutes = null;
  c.dishwasherMinutes = null;
  assert.equal(snapshot(c).charge.total, null);
  const filled = completeCost(snapshot(c), {
    productionMinutes: 0,
    dishwasherMinutes: 0,
  });
  assert.equal(filled.charge.total, 2000);
  assert.equal(
    snapshot({ ...capture([22]), productionMinutes: 60 }).charge.production,
    2067,
  );
  assert.equal(
    snapshot({ ...capture([22]), productionMinutes: 60, productionRate: 30 })
      .charge.production,
    3000,
  );
});
test("shared venue supplies remain held for review", () => {
  const c = capture();
  c.supplies = [
    {
      itemId: "cream",
      quantity: 1,
      unit: "qt",
      venueId: "x",
      note: "Shared across two venues",
      shared: true,
    },
  ];
  assert.equal(snapshot(c).charge.total, null);
  assert.ok(snapshot(c).charge.production! > 0);
});
test("penny remainders and partial returns reconcile to original net food plus both labor charges", () => {
  assert.deepEqual(allocateCents(1, [1, 1, 1]), [1, 0, 0]);
  const c = snapshot(capture()).charge;
  let returned = 0,
    total = 0;
  const totals = { net: 0, production: 0, dishwasher: 0 };
  for (const q of [1, 2, 0.5, 6.5]) {
    const r = returnCredit(c, 10, returned, q);
    returned += q;
    total += r.total!;
    for (const k of ["net", "production", "dishwasher"] as const)
      totals[k] += r[k]!;
  }
  assert.equal(total, c.total);
  assert.equal(totals.net, c.net);
  assert.equal(totals.production, c.production);
  assert.equal(totals.dishwasher, c.dishwasher);
  assert.throws(() => returnCredit(c, 10, 10, 1), /exceed/);
});
test("Chicago dates handle midnight and daylight savings without local server timezone", () => {
  assert.equal(chicagoToday(new Date("2026-09-24T03:00:00Z")), "2026-09-23");
  assert.equal(chicagoToday(new Date("2026-01-01T05:59:59Z")), "2025-12-31");
  assert.throws(() => businessDate("2026-02-30"), /Invalid/);
});
