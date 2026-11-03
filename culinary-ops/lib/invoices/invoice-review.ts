import type { IngredientMeasure } from "../ingredients/measurements";
import { invoiceMathWarning, type LocalInvoiceLine } from "./invoice-parser";
import { normalizedInvoicePrice } from "./invoice-purchases";

type Amounts = Pick<LocalInvoiceLine, "quantity" | "unitPrice" | "extendedPrice"> & {
  totalMode?: "calculated" | "entered";
};
type ReviewLine = Amounts & Pick<LocalInvoiceLine, "rawDescription" | "unit" | "packQty" | "packUnit" | "warnings"> & {
  eachWeightOz?: number | null;
};

export function invoiceLineAmounts(row: Amounts) {
  let calculatedTotal: number | null = null;
  if (row.quantity !== null && row.quantity > 0 && Number.isFinite(row.quantity) && row.unitPrice !== null && Number.isFinite(row.unitPrice)) {
    const product = row.quantity * row.unitPrice;
    const magnitude = Math.abs(product);
    const cents = Math.round((magnitude + Number.EPSILON * Math.max(1, magnitude)) * 100);
    if (Number.isSafeInteger(cents)) calculatedTotal = Math.sign(product) * cents / 100;
  }
  // Older drafts with no recognized total also get the calculation. An entered
  // total remains authoritative, including discounts and other adjustments.
  const automatic = row.totalMode ? row.totalMode === "calculated" : row.extendedPrice === null;
  return { total: automatic ? calculatedTotal : row.extendedPrice, calculatedTotal, automatic };
}

export function invoiceLineReview(row: ReviewLine, item: (IngredientMeasure & { unit: string }) | null | undefined) {
  const amounts = invoiceLineAmounts(row), problems: string[] = [];
  const validQuantity = row.quantity !== null && Number.isFinite(row.quantity) && row.quantity > 0 && row.quantity <= 1e8;
  const validPack = row.packQty !== null && Number.isFinite(row.packQty) && row.packQty > 0 && row.packQty <= 1e8;
  if (!item) problems.push("Choose an ingredient.");
  if (!row.rawDescription.trim()) problems.push("Enter an item description.");
  if (!validQuantity) problems.push("Enter a billed quantity greater than zero.");
  if (!row.unit.trim()) problems.push("Enter the billed unit.");
  if (amounts.total === null || !Number.isFinite(amounts.total)) problems.push("Enter a unit price to calculate the total, or enter the line total.");
  else if (Math.round(amounts.total * 100) === 0) problems.push("Enter a non-zero line total; use a negative total for a credit.");
  else if (Math.abs(amounts.total) > 20_000_000) problems.push("Keep each line total at or below $20,000,000.");
  if (!validPack) problems.push("Enter the contents per billed unit.");
  if (!row.packUnit.trim()) problems.push("Enter the content unit, such as oz or lb.");
  if (row.eachWeightOz != null && (!Number.isFinite(row.eachWeightOz) || row.eachWeightOz <= 0 || row.eachWeightOz > 1e7)) problems.push("Enter a received average weight greater than zero.");

  let newPrice: number | null = null;
  if (item && validQuantity && validPack && row.packUnit.trim() && amounts.total !== null && Number.isFinite(amounts.total)) {
    try {
      newPrice = normalizedInvoicePrice(Math.round(amounts.total * 100), row.quantity!, row.packQty!, row.packUnit, item.unit, { ...item, eachWeightOz: row.eachWeightOz ?? item.eachWeightOz });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "Check the pack conversion for this ingredient.");
    }
  }
  const math = row.quantity !== null && row.unitPrice !== null && amounts.total !== null && invoiceMathWarning(row.quantity, row.unitPrice, amounts.total);
  const outdatedWarnings = new Set([
    "Amounts unreadable or missing. Enter manually or mark ignored.",
    "Confirm billed quantity and unit.",
    "Quantity × unit price does not match the paid total, or a number is missing.",
  ]);
  const warnings = row.warnings.filter(warning => !outdatedWarnings.has(warning));
  if (math) warnings.push("Quantity × unit price differs from the entered total. Check discounts or charges against the invoice.");
  return { ...amounts, newPrice, problems, warnings, math };
}
