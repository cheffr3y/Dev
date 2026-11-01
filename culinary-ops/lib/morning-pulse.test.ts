import assert from "node:assert/strict";
import test from "node:test";
import { buildCloseoutQueue, buildMarginWatchlist, ingredientIntegrity, pulseDates } from "./morning-pulse";
import { commandActions } from "./command-actions";

const now = new Date("2026-11-01T04:30:00Z"); // Still October 31 in Chicago.
function fixture() {
  const item = { id: "butter", unitCost: 8, unit: "lb", priceUpdatedAt: now };
  const base = { id: "base", name: "Base", yieldQty: 2, yieldUnit: "qt", menuPrice: null as number | null,
    items: [{ quantity: 16, unit: "oz", item }], components: [] as Array<{ childId: string; quantity: number; unit: string }> };
  const dish = { ...base, id: "dish", name: "Dish", yieldQty: 4, yieldUnit: "each", menuPrice: 4,
    items: [], components: [{ childId: "base", quantity: 2, unit: "qt" }] };
  const menu = { id: "menu", name: "Dinner", targetFcp: 28,
    items: [{ id: "line", recipeId: "dish", menuTitle: "Dinner dish", menuPrice: null as number | null }] };
  return { item, base, dish, menu, recipes: [base, dish] };
}

test("pulse windows follow Chicago dates, include today and span seven calendar days across DST", () => {
  const dates = pulseDates(now);
  assert.equal(dates.day, "2026-10-31");
  assert.equal(dates.start.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(dates.end.toISOString(), "2026-11-07T00:00:00.000Z");
  assert.equal(dates.week, "2026-10-26");
  assert.equal(pulseDates(new Date("2026-11-01T07:30:00Z")).day, "2026-11-01");
  assert.equal(pulseDates(new Date("2027-01-01T12:00:00Z")).week, "2026-12-28");
});

test("ingredient integrity catches negative/zero costs, blank units, and missing vendors independently", () => {
  assert.deepEqual(ingredientIntegrity({ unitCost: 0, unit: "  ", vendorId: null }), { missingCost: true, missingUnit: true, missingVendor: true });
  assert.deepEqual(ingredientIntegrity({ unitCost: 2, unit: "lb", vendorId: "vendor" }), { missingCost: false, missingUnit: false, missingVendor: false });
  assert.equal(ingredientIntegrity({ unitCost: -1, unit: "lb", vendorId: null }).missingCost, true);
});

test("watchlist uses nested conversion, yield, menu overrides, and each menu's target", () => {
  const f = fixture();
  assert.equal(buildMarginWatchlist([f.menu], f.recipes, now).rows[0].fcp, 50);
  f.menu.items[0].menuPrice = 10;
  assert.equal(buildMarginWatchlist([f.menu], f.recipes, now).rows.length, 0);
  f.menu.targetFcp = 15;
  const row = buildMarginWatchlist([f.menu], f.recipes, now).rows[0];
  assert.equal(row.fcp, 20);
  assert.equal(row.title, "Dinner dish");
  assert.equal(row.target, 15);
});

test("missing nested ingredient costs and explicit zero sale price require review", () => {
  const f = fixture();
  f.item.unitCost = 0;
  assert.deepEqual(buildMarginWatchlist([f.menu], f.recipes, now), { rows: [], needsReview: 1 });
  f.item.unitCost = 8;
  f.menu.items[0].menuPrice = 0;
  assert.deepEqual(buildMarginWatchlist([f.menu], f.recipes, now), { rows: [], needsReview: 1 });
});

test("stale nested costs remain explicit on flagged dishes", () => {
  const f = fixture();
  f.item.priceUpdatedAt = new Date("2026-01-01");
  assert.equal(buildMarginWatchlist([f.menu], f.recipes, now).rows[0].stale, true);
});

test("invalid yields, incompatible ingredient/component units, missing children and cycles cannot imply healthy margins", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.base.yieldQty = 0; },
    (f: ReturnType<typeof fixture>) => { f.base.items = []; },
    (f: ReturnType<typeof fixture>) => { f.base.items[0].unit = "cup"; },
    (f: ReturnType<typeof fixture>) => { f.dish.components[0].unit = "lb"; },
    (f: ReturnType<typeof fixture>) => { f.dish.components[0].childId = "missing"; },
    (f: ReturnType<typeof fixture>) => { f.base.components.push({ childId: "dish", quantity: 1, unit: "each" }); },
  ]) {
    const f = fixture(); change(f);
    assert.deepEqual(buildMarginWatchlist([f.menu], f.recipes, now), { rows: [], needsReview: 1 });
  }
});

test("closeout queue merges activity dates, excludes finalized days and retains days with only pickups", () => {
  const day = (date: string, count: number) => ({ date: new Date(date), count });
  assert.deepEqual(buildCloseoutQueue(
    [day("2026-10-30", 2), day("2026-10-29", 1)],
    [day("2026-10-30", 3)],
    [day("2026-10-28", 1), day("2026-10-30", 4)],
    [new Date("2026-10-29")],
  ), [
    { day: "2026-10-28", requests: 0, batches: 0, transfers: 1 },
    { day: "2026-10-30", requests: 2, batches: 3, transfers: 4 },
  ]);
});

test("action permissions match existing admin and manager workflows", () => {
  const ids = (role: "ADMIN" | "MANAGER" | "STAFF") => commandActions(role, now).map(action => action.id);
  assert.deepEqual(ids("STAFF"), ["print-banquet-week", "daily-prep"]);
  assert.deepEqual(ids("MANAGER"), ["print-banquet-week", "merge-items", "new-recipe", "daily-prep"]);
  assert.equal(ids("ADMIN").includes("export-accounting"), true);
  assert.equal(ids("ADMIN").includes("daily-closeout"), true);
});

test("action destinations open real workflows with Chicago business dates", () => {
  const actions = commandActions("ADMIN", now);
  assert.equal(actions.find(action => action.id === "print-banquet-week")?.href, "/banquets/week/2026-10-26/packet?print=1");
  assert.equal(actions.find(action => action.id === "export-accounting")?.href, "/prep-orders/report/export-xlsx?from=2026-10-25&to=2026-10-31");
  assert.equal(actions.find(action => action.id === "daily-closeout")?.href, "/prep-orders/closeout?date=2026-10-31");
  assert.equal(actions.find(action => action.id === "new-recipe")?.href, "/recipes?new=1#new-recipe");
});
