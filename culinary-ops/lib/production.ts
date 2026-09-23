import { convertQty } from "./units";

export const DEFAULT_PRODUCTION_LABOR_RATE = (22 + 20 + 20) / 3;
export const DEFAULT_DISHWASHER_LABOR_RATE = 18;

export type CostPool = {
  outputQty: number;
  outputUnit: string;
  foodCost: number;
  productionMinutes: number;
  productionLaborCost: number;
  dishwasherMinutes: number;
  dishwasherLaborCost: number;
};

export type TransferCost = {
  ratio: number;
  foodCostBeforeExclusions: number;
  excludedFoodCost: number;
  netFoodCost: number;
  productionMinutes: number;
  productionLaborCost: number;
  dishwasherMinutes: number;
  dishwasherLaborCost: number;
  totalTransferCost: number;
};

export function batchLaborCost(personMinutes: number, hourlyRate: number): number {
  return (personMinutes / 60) * hourlyRate;
}

export function quantityInBatchUnit(quantity: number, unit: string, batchUnit: string): number {
  const converted = convertQty(quantity, unit, batchUnit);
  if (converted == null) throw new Error(`Unit ${unit} is not compatible with batch unit ${batchUnit}.`);
  return converted;
}

export function availableBatchQuantity(opts: {
  outputQty: number;
  transfers: Array<{ quantity: number; unit: string }>;
  adjustments: Array<{ quantity: number; unit: string }>;
  outputUnit: string;
}): number {
  const transferred = opts.transfers.reduce(
    (sum, row) => sum + quantityInBatchUnit(row.quantity, row.unit, opts.outputUnit),
    0,
  );
  const adjusted = opts.adjustments.reduce(
    (sum, row) => sum + quantityInBatchUnit(row.quantity, row.unit, opts.outputUnit),
    0,
  );
  return opts.outputQty + adjusted - transferred;
}

export function prorateTransferCost(
  pool: CostPool,
  quantity: number,
  unit: string,
  excludedFoodCost = 0,
): TransferCost {
  const inBatchUnit = quantityInBatchUnit(quantity, unit, pool.outputUnit);
  if (inBatchUnit <= 0 || pool.outputQty <= 0) throw new Error("Transfer quantity and batch output must be positive.");
  const ratio = inBatchUnit / pool.outputQty;
  if (ratio > 1 + 1e-9) throw new Error("Transfer quantity exceeds the batch output.");
  const foodCostBeforeExclusions = pool.foodCost * ratio;
  const excluded = Math.min(Math.max(excludedFoodCost, 0), foodCostBeforeExclusions);
  const productionLaborCost = pool.productionLaborCost * ratio;
  const dishwasherLaborCost = pool.dishwasherLaborCost * ratio;
  return {
    ratio,
    foodCostBeforeExclusions,
    excludedFoodCost: excluded,
    netFoodCost: foodCostBeforeExclusions - excluded,
    productionMinutes: pool.productionMinutes * ratio,
    productionLaborCost,
    dishwasherMinutes: pool.dishwasherMinutes * ratio,
    dishwasherLaborCost,
    totalTransferCost: foodCostBeforeExclusions - excluded + productionLaborCost + dishwasherLaborCost,
  };
}

// Allocate a daily amount in integer cents so displayed batch rows always add
// back to the exact daily total. The largest fractional remainders receive the
// leftover pennies; stable input order breaks ties.
export function allocateCurrencyByWeight(total: number, weights: number[]): number[] {
  if (weights.some((n) => !Number.isFinite(n) || n < 0)) throw new Error("Allocation weights cannot be negative.");
  const totalWeight = weights.reduce((sum, n) => sum + n, 0);
  if (totalWeight <= 0) throw new Error("An explicit allocation is required when the allocation basis is zero.");
  const totalCents = Math.round(total * 100);
  const exact = weights.map((weight) => (totalCents * weight) / totalWeight);
  const cents = exact.map(Math.floor);
  const remaining = totalCents - cents.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((n, index) => ({ index, fraction: n - Math.floor(n) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i += 1) cents[order[i % order.length].index] += 1;
  return cents.map((n) => n / 100);
}

export function allocateMinutesByWeight(totalMinutes: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, n) => sum + n, 0);
  if (totalWeight <= 0) throw new Error("An explicit allocation is required when the allocation basis is zero.");
  return weights.map((weight) => (totalMinutes * weight) / totalWeight);
}

export function reconcileExcludedFood(currentExcluded: number, delta: number, grossFood: number): number {
  const next = currentExcluded + delta;
  if (next < -1e-9 || next > grossFood + 1e-9) {
    throw new Error("Ingredient exclusions cannot exceed the transfer's captured food cost.");
  }
  return Math.max(0, Math.min(grossFood, next));
}
