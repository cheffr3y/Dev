import test from "node:test";
import assert from "node:assert/strict";
import { buildOperatingMonth, dollarsToCents, operatingMonth, operatingCsv, type OperatingDayData, type FoodExpenseData } from "./operating-calendar";
import { normalizedInvoicePrice } from "./invoice-purchases";
const day = (date: string, sales: number | null, labor: number | null, reviewed = false): OperatingDayData => ({ id: date, venueId: "v", businessDate: date, grossSalesCents: sales, laborCents: labor, foodReviewed: reviewed, notes: "", revision: 0, history: [] });
const food = (date: string, amount: number, id = date): FoodExpenseData => ({ id, venueId: "v", invoiceDate: date, amountCents: amount, description: "Invoice", invoiceDocumentId: null, voided: false, revision: 0, history: [] });
test("currency uses exact cents, distinguishes blanks from zero and permits signed food credits", () => {
  assert.equal(dollarsToCents(""), null); assert.equal(dollarsToCents("0.00"), 0); assert.equal(dollarsToCents("12.29"), 1229); assert.equal(dollarsToCents("-0.01", true), -1);
  for (const value of ["1.001", "NaN", "-1", "1e4", "20,000", "20000001"]) assert.throws(() => dollarsToCents(value));
});
test("months use real calendar dates across leap years and year changes", () => {
  assert.equal(operatingMonth("2028-02").dayCount, 29); assert.equal(operatingMonth("2026-11").offset, 0);
  assert.equal(operatingMonth("2026-12").next, "2027-01"); assert.equal(operatingMonth("2026-01").previous, "2025-12");
  for (const month of ["2026-13", "2026-2", "1899-12", "2101-01"]) assert.throws(() => operatingMonth(month));
});
test("month percentages use total dollars over total gross sales, not averages of daily percentages", () => {
  const result = buildOperatingMonth("2026-11", [day("2026-11-01", 100000, 10000, true), day("2026-11-02", 10000, 5000, true)], [food("2026-11-01", 20000)], "2026-11-02");
  assert.equal(result.totals.grossSalesCents, 110000); assert.equal(result.totals.laborRate, 15000 / 110000 * 100);
  assert.equal(result.totals.foodCents, 20000); assert.equal(result.totals.completeCount, 2); assert.equal(result.totals.provisional, false);
  assert.equal(result.days[1].foodCents, 0);
});
test("missing entries, zero sales, pending invoices, credits and voids remain distinct", () => {
  const result = buildOperatingMonth("2026-11", [day("2026-11-01", 0, 0, true)], [food("2026-11-01", 1000), food("2026-11-01", -200, "credit"), { ...food("2026-11-01", 9900, "void"), voided: true }], "2026-11-02");
  assert.equal(result.days[0].foodCents, 800); assert.equal(result.days[0].foodRate, null); assert.equal(result.days[1].grossSalesCents, null); assert.equal(result.days[1].foodCents, null); assert.equal(result.totals.provisional, true);
  const pending = buildOperatingMonth("2026-11", [day("2026-11-01", 1000, 200, true)], [{ ...food("2026-11-01", 100), invoiceReviewPending: true }], "2026-11-01");
  assert.equal(pending.days[0].complete, false);
});
test("CSV exports all dates, preserves missing amounts and zeroes, and neutralizes spreadsheet text formulas", () => {
  const data = buildOperatingMonth("2026-11", [{ ...day("2026-11-01", 0, 100), notes: '=HYPERLINK("bad")' }], [], "2026-11-02");
  const csv = operatingCsv(data, "+Venue"); assert.ok(csv.startsWith('"Venue","Business date","Gross sales USD"')); assert.equal(csv.split("\r\n").length, 32);
  assert.match(csv, /"0.00","1.00",""/); assert.match(csv, /'\+Venue/); assert.match(csv, /'=HYPERLINK/);
});
test("paid invoice prices normalize case contents to the catalog measurement basis", () => {
  assert.equal(normalizedInvoicePrice(6000, 2, 10, "lb", "lb"), 3);
  assert.equal(normalizedInvoicePrice(6000, 2, 160, "oz", "lb"), 3);
  assert.equal(normalizedInvoicePrice(-6000, 2, 10, "lb", "lb"), -3);
  assert.equal(normalizedInvoicePrice(1200, 12, 1, "each", "each"), 1);
  assert.throws(() => normalizedInvoicePrice(6000, 2, 10, "quart", "lb"), /do not convert/);
  assert.throws(() => normalizedInvoicePrice(6000, 0, 10, "lb", "lb"));
});
