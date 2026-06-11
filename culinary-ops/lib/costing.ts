// Costing helpers. Recipe quantities are converted from the recipe's unit
// into the item's purchase/cost unit (e.g. 2 tbsp of an item bought by the
// gallon), so line cost = converted quantity * item.unitCost. When the two
// units aren't convertible (e.g. cups of an item costed by the lb) we fall
// back to the legacy same-unit assumption and report `converted: false` so
// the UI can flag the line.

import { convertQty } from "./units";

export type RecipeItemWithCost = {
  quantity: number;
  unit: string;
  item: { unitCost: number; unit: string };
};

export function lineCost(ri: RecipeItemWithCost): { cost: number; converted: boolean } {
  const qty = convertQty(ri.quantity, ri.unit, ri.item.unit);
  if (qty == null) return { cost: ri.quantity * (ri.item.unitCost ?? 0), converted: false };
  return { cost: qty * (ri.item.unitCost ?? 0), converted: true };
}

export function recipeCost(items: RecipeItemWithCost[]): number {
  return items.reduce((sum, ri) => sum + lineCost(ri).cost, 0);
}

export function costPerServing(totalCost: number, yieldQty: number): number {
  if (!yieldQty || yieldQty <= 0) return 0;
  return totalCost / yieldQty;
}

// Food cost % = ingredient cost per serving / menu price.
export function foodCostPct(costPerServing: number, menuPrice?: number | null): number | null {
  if (!menuPrice || menuPrice <= 0) return null;
  return (costPerServing / menuPrice) * 100;
}

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  // trim trailing zeros but keep up to 2 decimals
  return Number(n.toFixed(2)).toString();
}
