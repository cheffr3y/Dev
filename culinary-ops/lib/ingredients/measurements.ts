import { convertQty, unitFamily, UNIT_OPTIONS } from "../recipes/units";

export type IngredientMeasure = {
  unit?: string; packQty?: number | null; packUnit?: string | null;
  eachLabel?: string; eachWeightOz?: number | null; densityGPerMl?: number | null;
  measurementRevision?:number; yieldFactor?: number; usableCosting?: boolean; measurementReviewedAt?: Date | string | null;
};
export const measurementSelect = { eachLabel: true, eachWeightOz: true, densityGPerMl: true, yieldFactor: true, usableCosting: true, measurementReviewedAt: true, measurementRevision:true, packQty: true, packUnit: true } as const;
const positive = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value > 0;
function canonical(unit: string, item: IngredientMeasure) {
  const value = unit.trim().toLowerCase();
  const label = item.eachLabel?.trim().toLowerCase();
  return label && (value === label || value === `${label}s`) ? "each" : value;
}
function unpack(quantity: number, unit: string, item: IngredientMeasure) {
  unit = canonical(unit, item);
  if (!unitFamily(unit) && unit === canonical(item.unit ?? "", item) && positive(item.packQty) && item.packUnit && canonical(item.packUnit, item) !== unit) {
    return { quantity: quantity * item.packQty, unit: canonical(item.packUnit, item) };
  }
  return { quantity, unit };
}
function weightOz(quantity: number, unit: string, item: IngredientMeasure): number | null {
  const weight = convertQty(quantity, unit, "oz");
  if (weight != null) return weight;
  const count = convertQty(quantity, unit, "each");
  if (count != null && positive(item.eachWeightOz)) return count * item.eachWeightOz;
  const ml = convertQty(quantity, unit, "ml");
  return ml != null && positive(item.densityGPerMl) ? convertQty(ml * item.densityGPerMl, "g", "oz") : null;
}
/** Purchased quantities only. Trim is deliberately applied separately. */
export function convertIngredientQty(quantity: number, from: string, to: string, item: IngredientMeasure = {}): number | null {
  if (!Number.isFinite(quantity) || !from.trim() || !to.trim()) return null;
  const a = unpack(quantity, from, item), b = unpack(1, to, item);
  const direct = convertQty(a.quantity, a.unit, b.unit);
  if (direct != null) return Number.isFinite(direct / b.quantity) ? direct / b.quantity : null;
  const left = weightOz(a.quantity, a.unit, item), right = weightOz(b.quantity, b.unit, item);
  if (left == null || right == null || right <= 0 || !Number.isFinite(left / right)) return null;
  return left / right;
}
export function ingredientPurchaseQuantity(quantity: number, unit: string, item: IngredientMeasure & { unit: string }, usable = !!item.usableCosting): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const converted = convertIngredientQty(quantity, unit, item.unit, item);
  if(usable && (!positive(item.yieldFactor??1) || (item.yieldFactor??1)>1))return null;
  const count = unitFamily(canonical(unit,item)) === "count" || (!unitFamily(canonical(unit,item)) && canonical(unit,item) === canonical(item.unit,item));
  // Counts remain whole purchased items; trim reduces their usable weight, not their identity.
  const factor = usable && !count ? item.yieldFactor ?? 1 : 1;
  return converted != null && positive(factor) && factor <= 1 && Number.isFinite(converted/factor) ? converted / factor : null;
}
export function measurementSnapshot(item: IngredientMeasure & { unit: string }) {
  return { unit: item.unit, measurementReviewedAt: item.measurementReviewedAt instanceof Date ? item.measurementReviewedAt.toISOString() : item.measurementReviewedAt ?? null, eachLabel: item.eachLabel ?? "each", eachWeightOz: item.eachWeightOz ?? null, densityGPerMl: item.densityGPerMl ?? null, packQty: item.packQty ?? null, packUnit: item.packUnit ?? null };
}

export function ingredientUnits(item: IngredientMeasure & {unit:string}) {
  return [...new Set([item.unit,...UNIT_OPTIONS.flatMap(group=>group.units),item.eachLabel??"each"])].filter(unit=>convertIngredientQty(1,unit,item.unit,item)!=null);
}

/** Preserve legacy recipe interpretation until its ingredient is reviewed. */
export function recipePurchaseQuantity(quantity:number, unit:string, item:IngredientMeasure & {unit:string}) {
  return item.measurementReviewedAt ? ingredientPurchaseQuantity(quantity,unit,item) : convertQty(quantity,unit,item.unit);
}

export function measurementVersion(item:IngredientMeasure) { return item.measurementRevision ?? 0; }
