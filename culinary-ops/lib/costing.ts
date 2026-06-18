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

// A recipe reduced to just what's needed to cost it, including sub-recipes.
export type RecipeCostNode = {
  id: string;
  yieldQty: number;
  yieldUnit: string;
  items: RecipeItemWithCost[];
  components: { childId: string; quantity: number; unit: string }[];
};

// How many child batches a sub-recipe line represents. The component quantity
// is given in `unit` (e.g. "2.5 gal"); we convert it into the child's yield
// unit and divide by the child's yield qty. When the unit can't convert to the
// yield unit (e.g. "gal" of something yielded in "servings") we fall back to
// treating the quantity as already being in yield units and report
// converted:false so callers can flag it.
export function componentBatchFactor(
  quantity: number,
  unit: string,
  childYieldQty: number,
  childYieldUnit: string,
): { batches: number; converted: boolean } {
  const denom = childYieldQty > 0 ? childYieldQty : 1;
  const inYield = convertQty(quantity, unit, childYieldUnit);
  if (inYield == null) return { batches: quantity / denom, converted: false };
  return { batches: inYield / denom, converted: true };
}

// Cost of a single sub-recipe line: child total cost × batches used.
export function componentLineCost(
  component: { childId: string; quantity: number; unit: string },
  costMap: Map<string, number>,
  byId: Map<string, RecipeCostNode>,
): number {
  const child = byId.get(component.childId);
  if (!child) return 0;
  const childTotal = costMap.get(component.childId) ?? 0;
  const { batches } = componentBatchFactor(component.quantity, component.unit, child.yieldQty, child.yieldUnit);
  return childTotal * batches;
}

// Build a map of recipeId -> fully-loaded cost (ingredients + nested
// sub-recipes). Cycles are guarded against and contribute nothing.
export function buildCostMap(recipes: RecipeCostNode[]): Map<string, number> {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const cache = new Map<string, number>();

  function cost(id: string, stack: Set<string>): number {
    const cached = cache.get(id);
    if (cached != null) return cached;
    const node = byId.get(id);
    if (!node || stack.has(id)) return 0;
    stack.add(id);
    let total = recipeCost(node.items);
    for (const c of node.components) {
      const child = byId.get(c.childId);
      if (!child) continue;
      const childTotal = cost(c.childId, stack);
      const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
      total += childTotal * batches;
    }
    stack.delete(id);
    cache.set(id, total);
    return total;
  }

  for (const r of recipes) cost(r.id, new Set());
  return cache;
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
