import test from "node:test";
import assert from "node:assert/strict";
import { invoiceLineAmounts, invoiceLineReview } from "./invoice-review";
import { reviewRowSchema } from "./review-draft";

const nutmeg = {
  rawDescription: "SPC NUTMEG GROUND", quantity: 1, unitPrice: 13.84, extendedPrice: null,
  unit: "16oz", packQty: 16, packUnit: "oz",
  warnings: ["Amounts unreadable or missing. Enter manually or mark ignored.", "Confirm billed quantity and unit."],
};

test("the missing nutmeg total is calculated and usable for approval and ingredient pricing", () => {
  const review = invoiceLineReview(nutmeg, { unit: "oz" });
  assert.equal(review.total, 13.84);
  assert.equal(review.automatic, true);
  assert.equal(review.newPrice, .865);
  assert.deepEqual(review.problems, []);
  assert.deepEqual(review.warnings, []);
  assert.equal(nutmeg.extendedPrice, null, "Original recognition is preserved");
  assert.equal(invoiceLineAmounts({ ...nutmeg, quantity: 2 }).total, 27.68);
  assert.equal(invoiceLineAmounts({ ...nutmeg, unitPrice: 12 }).total, 12);
});

test("calculated totals round fractional quantities and credits to cents", () => {
  for (const [quantity, unitPrice, total] of [[2.5, 13.84, 34.6], [3, .335, 1.01], [1, 10.075, 10.08], [1, -10.075, -10.08]]) {
    assert.equal(invoiceLineAmounts({ quantity, unitPrice, extendedPrice: null }).total, total);
  }
  for (const quantity of [null, 0, -1, Infinity, NaN]) assert.equal(invoiceLineAmounts({ ...nutmeg, quantity }).total, null);
  for (const unitPrice of [null, Infinity, NaN]) assert.equal(invoiceLineAmounts({ ...nutmeg, unitPrice }).total, null);
});

test("entered or recognized totals survive quantity edits and require an explicit switch back to calculation", () => {
  const discounted = { ...nutmeg, extendedPrice: 12, quantity: 2 };
  const review = invoiceLineReview(discounted, { unit: "oz" });
  assert.equal(review.total, 12);
  assert.equal(review.automatic, false);
  assert.equal(review.newPrice, .375);
  assert.deepEqual(review.problems, []);
  assert.match(review.warnings.join(" "), /discounts or charges/);
  assert.equal(invoiceLineAmounts({ ...discounted, totalMode: "calculated" }).total, 27.68);
  assert.equal(invoiceLineAmounts({ ...nutmeg, totalMode: "entered" }).total, null, "A cleared input stays editable");
});

test("missing values, zero amounts and incompatible units produce specific confirmation problems", () => {
  assert.match(invoiceLineReview({ ...nutmeg, quantity: null }, { unit: "oz" }).problems.join(" "), /billed quantity/);
  assert.match(invoiceLineReview({ ...nutmeg, unitPrice: null }, { unit: "oz" }).problems.join(" "), /unit price/);
  assert.match(invoiceLineReview({ ...nutmeg, extendedPrice: 0 }, { unit: "oz" }).problems.join(" "), /non-zero/);
  assert.match(invoiceLineReview({ ...nutmeg, packQty: null }, { unit: "oz" }).problems.join(" "), /contents per billed unit/);
  const mismatch = invoiceLineReview({ ...nutmeg, packUnit: "qt" }, { unit: "oz" });
  assert.equal(mismatch.newPrice, null);
  assert.match(mismatch.problems.join(" "), /qt do not convert.*oz/);
  const credit = invoiceLineReview({ ...nutmeg, unitPrice: -13.84 }, { unit: "oz" });
  assert.equal(credit.total, -13.84);
  assert.deepEqual(credit.problems, []);
});

test("draft recovery retains calculation mode and entered overrides, without restoring verification", () => {
  const draft = { ...nutmeg, key: "nutmeg", purchaseId: "4e1615d3-5952-4c4e-b54b-25d0f3f9a421", itemId: "nutmeg", rawCode: "SPN100", ignored: false, remember: true, newName: "Nutmeg", newUnit: "oz" };
  const legacy = reviewRowSchema.parse(draft);
  assert.equal(invoiceLineAmounts(legacy).total, 13.84);
  for (const totalMode of ["entered", "calculated"] as const) {
    const restored = reviewRowSchema.parse(JSON.parse(JSON.stringify({ ...draft, extendedPrice: 12, totalMode, verified: true })));
    assert.equal(restored.totalMode, totalMode);
    assert.equal(invoiceLineAmounts(restored).total, totalMode === "entered" ? 12 : 13.84);
    assert.equal("verified" in restored, false);
  }
});
