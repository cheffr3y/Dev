import { convertQty } from "../recipes/units";
export type PriceObservation = { vendorId: string; vendorName: string; normalizedUnit: string | null; normalizedUnitCost: number | null; amountCents: number; voided?: boolean; invoiceDate: Date | string };
export type PriceTrend = { prices: number[]; supplier: string; unit: string; change: number | null; threshold: number };
export function priceVariance(previous: number | null, current: number | null) {
  if (previous == null || current == null || !Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current <= 0) return null;
  const change = (current - previous) / previous * 100;
  return Number.isFinite(change) ? change : null;
}
export function priceJump(change: number | null, threshold: number) {
  return change != null && Number.isFinite(change) && change - threshold > 1e-8;
}
export function varianceThreshold(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : 10;
}
export function normalizedObservation(row: PriceObservation, unit: string) {
  if (row.voided || row.amountCents <= 0 || row.normalizedUnitCost == null || !Number.isFinite(row.normalizedUnitCost) || row.normalizedUnitCost <= 0 || !row.normalizedUnit) return null;
  const factor = convertQty(1, unit, row.normalizedUnit);
  const value = factor == null ? null : factor * row.normalizedUnitCost;
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}
/** Input is newest first, with stable database tie ordering. */
export function priceTrend(rows: PriceObservation[], unit: string, vendorId?: string | null, threshold = 10): PriceTrend | null {
  const valid = rows.flatMap(row => { const price = normalizedObservation(row, unit); return price == null ? [] : [{ ...row, price }]; });
  const supplierId = vendorId || valid[0]?.vendorId;
  const selected = valid.filter(row => row.vendorId === supplierId).slice(0, 8);
  if (!selected.length) return null;
  const prices = selected.map(row => row.price).reverse();
  return { prices, supplier: selected[0].vendorName, unit, change: priceVariance(prices.at(-2) ?? null, prices.at(-1) ?? null), threshold: varianceThreshold(threshold) };
}
