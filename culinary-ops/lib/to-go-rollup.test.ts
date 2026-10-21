import assert from "node:assert/strict";
import test from "node:test";
import { buildToGoRollup, type ToGoLine } from "./to-go-rollup";
import type { RolloutRecipe } from "./menu-rollout";
import { toGoHeaderSchema, toGoLineSchema } from "./to-go-validation";
import { THANKSGIVING_STARTER } from "./to-go-starter";

const now = new Date("2026-10-20T12:00:00Z");
const butter = { id: "butter", name: "Butter", category: "Dairy", unitCost: 4, unit: "lb", priceUpdatedAt: now, allergens: "milk" };
const node = (id: string, overrides: Partial<RolloutRecipe> = {}): RolloutRecipe => ({
  id, name: id, station: null, menuPrice: 99, allergens: null, yieldQty: 10, yieldUnit: "lb",
  items: [{ quantity: 5, unit: "lb", item: butter }], components: [], ...overrides,
});
const line = (overrides: Partial<ToGoLine> = {}): ToGoLine => ({
  id: "line", name: "Potatoes", recipeId: "potatoes", section: "Sides", description: null, sellingUnit: "lb",
  recipeQtyPerUnit: null, price: 8, packagingCost: 0.5, forecastQty: 100,
  productionQty: null, actualSoldQty: null, confidence: "NEW", packingNotes: null,
  customerInstructions: null, notes: null, sortOrder: 0, ...overrides,
  recipeAmountUnit: overrides.recipeAmountUnit ?? (overrides.recipeQtyPerUnit != null ? "lb" : null),
});
const plan = (items: ToGoLine[], recipes = [node("potatoes")]) => buildToGoRollup({ items }, recipes, now);
const close = (actual: number | null, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("weight-based sales cost per pound, convert ounces and retain fractional batches", () => {
  const result = plan([line({ forecastQty: 2.5 })], [node("potatoes", { yieldQty: 160, yieldUnit: "oz" })]);
  close(result.rows[0].foodCost, 2);
  close(result.rows[0].unitCost, 2.5);
  close(result.rows[0].margin, 5.5);
  close(result.rows[0].revenue, 20);
  close(result.rows[0].productionYield, 40);
  close(result.production.recipeRollup[0].totalBatches, 0.25);
  assert.equal(result.rows[0].price, 8, "recipe menu price must not replace retail price");
});

test("liquids convert within volume; kits require an explicit content amount", () => {
  const recipes = [node("soup", { yieldQty: 2, yieldUnit: "gallon" }), node("kit")];
  const result = plan([
    line({ id: "soup", recipeId: "soup", sellingUnit: "quart", forecastQty: 12 }),
    line({ id: "kit", recipeId: "kit", sellingUnit: "kit", forecastQty: 10, recipeQtyPerUnit: 0.5 }),
  ], recipes);
  close(result.rows[0].productionYield, 3);
  close(result.rows[0].foodCost, 2.5);
  close(result.rows[1].productionYield, 5);
  close(result.rows[1].foodCost, 1);
  assert.deepEqual(result.salesByUnit, [{ unit: "quart", qty: 12 }, { unit: "kit", qty: 10 }]);
  assert.equal(plan([line({ sellingUnit: "kit" })]).rows[0].productionYield, null);
});

test("unknown estimates and prices stay distinct from explicit zero", () => {
  const unknown = plan([line({ forecastQty: null, price: null, packagingCost: null })]);
  assert.equal(unknown.forecastRevenue, null);
  assert.equal(unknown.forecastCost, null);
  assert.equal(unknown.rows[0].unitCost, null);
  assert.equal(unknown.rows[0].targetQty, null);
  const zero = plan([line({ forecastQty: 0, price: 0, packagingCost: 0 })]);
  assert.equal(zero.forecastRevenue, 0);
  assert.equal(zero.forecastCost, 0);
  assert.equal(zero.revenueCoverage, 1);
  assert.equal(zero.rows[0].totalCostPct, null);
  assert.deepEqual(zero.production.recipeRollup, []);
  assert.equal(plan([]).forecastRevenue, null);
});

test("production override and actual sold never overwrite estimated sales", () => {
  const result = plan([line({ forecastQty: 100, productionQty: 120, actualSoldQty: 90 })]);
  close(result.rows[0].revenue, 800);
  close(result.rows[0].productionYield, 120);
  close(result.rows[0].actualRevenue, 720);
  close(result.rows[0].salesVariance, -10);
  close(result.forecastMargin, 550);
  assert.equal(plan([line({ productionQty: 0 })]).rows[0].productionYield, 0);
  assert.deepEqual(plan([line({ productionQty: 0 })]).production.recipeRollup, []);
});

test("custom package amounts retain their measurement when recipe yield units change", () => {
  const item = line({ sellingUnit: "kit", forecastQty: 10, recipeQtyPerUnit: 0.5, recipeAmountUnit: "lb" });
  const ounces = plan([item], [node("potatoes", { yieldQty: 160, yieldUnit: "oz" })]);
  close(ounces.rows[0].quantityPerUnit, 8);
  close(ounces.rows[0].productionYield, 80);
  close(ounces.rows[0].foodCost, 1);
  const changedFamily = plan([item], [node("potatoes", { yieldQty: 10, yieldUnit: "quart" })]);
  assert.equal(changedFamily.rows[0].productionYield, null);
  assert.match(changedFamily.rows[0].warnings.join(" "), /Saved content amount 0.5 lb/);
});

test("unlinked new items can forecast revenue while food cost and demand remain incomplete", () => {
  const result = plan([line({ recipeId: null, sellingUnit: "board" })]);
  close(result.forecastRevenue, 800);
  assert.equal(result.forecastCost, null);
  assert.equal(result.marginCoverage, 0);
  assert.equal(result.productionExcluded.length, 1);
  assert.equal(result.rows[0].productionReady, false);
  assert.equal(plan([line({ sellingUnit: null })]).forecastRevenue, null);
});

test("missing ingredient prices suppress costs and margins, stale costs stay flagged", () => {
  const missing = node("potatoes", { items: [{ quantity: 5, unit: "lb", item: { ...butter, unitCost: 0 } }] });
  assert.equal(plan([line()], [missing]).rows[0].foodCost, null);
  assert.equal(plan([line()], [missing]).forecastMargin, null);
  assert.equal(plan([line()], [missing]).productionExcluded.length, 0, "pricing gap does not prevent known prep quantities");
  const stale = node("potatoes", { items: [{ quantity: 5, unit: "lb", item: { ...butter, priceUpdatedAt: new Date("2025-01-01") } }] });
  close(plan([line()], [stale]).rows[0].foodCost, 2);
  assert.match(plan([line()], [stale]).rows[0].warnings.join(" "), /price\(s\) need review/);
});

test("incompatible yields, nested conversions and cycles never produce guessed demand", () => {
  const mismatched = plan([line({ sellingUnit: "quart" })]);
  assert.equal(mismatched.rows[0].productionYield, null);
  assert.equal(mismatched.productionExcluded.length, 1);
  const broken = [node("potatoes", { components: [{ childId: "stock", quantity: 2, unit: "lb" }] }), node("stock", { yieldUnit: "quart" })];
  assert.equal(plan([line()], broken).rows[0].productionYield, null);
  broken[0].components[0].unit = "quart";
  broken[1].components = [{ childId: "potatoes", quantity: 1, unit: "lb" }];
  assert.equal(plan([line()], broken).production.recipeRollup.length, 0);
  assert.match(plan([line()], broken).rows[0].warnings.join(" "), /Circular/);
  assert.equal(plan([line()], [node("potatoes", { yieldQty: 0 })]).rows[0].foodCost, null);
  assert.equal(plan([line()], [node("potatoes", { items: [] })]).rows[0].foodCost, null);
  assert.equal(plan([line()], [node("potatoes", { items: [{ quantity: 2, unit: "cup", item: butter }] })]).rows[0].foodCost, null);
});

test("shared sub-recipes aggregate every path and every selling format exactly once", () => {
  const base = node("base", { yieldQty: 2 });
  const sauce = node("sauce", { yieldQty: 1, items: [], components: [{ childId: "base", quantity: 1, unit: "lb" }] });
  const potatoes = node("potatoes", { components: [{ childId: "sauce", quantity: 1, unit: "lb" }, { childId: "base", quantity: 1, unit: "lb" }] });
  const result = plan([line({ forecastQty: 10 }), line({ id: "tray", sellingUnit: "tray", recipeQtyPerUnit: 5, forecastQty: 2 })], [potatoes, sauce, base]);
  const root = result.production.recipeRollup.find(row => row.recipeId === "potatoes")!;
  const foundation = result.production.recipeRollup.find(row => row.recipeId === "base")!;
  close(root.totalBatches, 2);
  close(foundation.totalBatches, 2);
  close(foundation.totalQty, 4);
  assert.equal(result.menuPlan.guideLines.length, 1);
});

test("validation preserves blank and zero, rejects invalid dates, units and non-finite numbers", () => {
  const input = { ...line(), recipeId: "", sellingUnit: "", recipeQtyPerUnit: "", recipeAmountUnit: "", price: "", packagingCost: "0", forecastQty: "", productionQty: "", actualSoldQty: "", description: "", packingNotes: "", customerInstructions: "", notes: "" };
  const parsed = toGoLineSchema.parse(input);
  assert.equal(parsed.forecastQty, null);
  assert.equal(parsed.packagingCost, 0);
  assert.equal(parsed.recipeId, null);
  for (const value of ["Infinity", "NaN", "-1"]) assert.equal(toGoLineSchema.safeParse({ ...input, forecastQty: value }).success, false);
  assert.equal(toGoLineSchema.safeParse({ ...input, recipeQtyPerUnit: "0" }).success, false);
  assert.equal(toGoLineSchema.safeParse({ ...input, sellingUnit: "servings" }).success, false);
  const header = { name: "Holiday", venueId: "", status: "DRAFT", notes: "", pickupNotes: "", orderCutoff: "2026-02-30" };
  assert.equal(toGoHeaderSchema.safeParse(header).success, false);
  assert.equal(toGoHeaderSchema.safeParse({ ...header, orderCutoff: "2026-11-25" }).success, true);
  assert.equal(THANKSGIVING_STARTER.length, 11);
});
