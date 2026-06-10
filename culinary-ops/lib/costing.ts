// Costing helpers. The MVP assumes a recipe ingredient's quantity is
// expressed in the same unit as the catalog item's cost unit, so
// line cost = quantity * item.unitCost. Unit conversions can be layered
// on later without changing the call sites.

export type RecipeItemWithCost = {
  quantity: number;
  item: { unitCost: number };
};

export function recipeCost(items: RecipeItemWithCost[]): number {
  return items.reduce((sum, ri) => sum + ri.quantity * (ri.item.unitCost ?? 0), 0);
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
