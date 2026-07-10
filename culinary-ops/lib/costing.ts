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

// --- Price integrity -------------------------------------------------------
//
// A theoretical food cost is only as honest as its prices. Two gaps make it
// silently understated: an ingredient with no price on file (unitCost 0), and
// a price so old it no longer reflects what the vendor charges. These helpers
// surface both so the number can be trusted.

// An ingredient counts as unpriced when it has no cost on file.
export function isUnpriced(unitCost: number | null | undefined): boolean {
  return !(unitCost != null && unitCost > 0);
}

// Prices not re-costed within this many days are treated as stale and flagged
// for re-quoting. One knob for the whole app's "recently costed" assurance.
export const PRICE_STALE_DAYS = 90;

export type PriceFreshness = { label: string; stale: boolean; unpriced: boolean };

// Turn a priceUpdatedAt (and its cost) into a human freshness read: "no price"
// (understates cost), "needs re-cost" (priced but never stamped, so recency
// can't be confirmed), stale (older than the window), or fresh. `now` is
// injectable for stable tests. Stale + unpriced both mean "needs attention".
export function priceFreshness(
  priceUpdatedAt: Date | null | undefined,
  unitCost: number | null | undefined,
  now: Date = new Date(),
): PriceFreshness {
  if (isUnpriced(unitCost)) return { label: "no price", stale: false, unpriced: true };
  // Priced but never re-costed in-system — can't confirm it's recent, so treat
  // it as needing attention (the point of starting cost tracking).
  if (!priceUpdatedAt) return { label: "needs re-cost", stale: true, unpriced: false };
  const days = Math.floor((now.getTime() - priceUpdatedAt.getTime()) / 86400000);
  const stale = days >= PRICE_STALE_DAYS;
  let ago: string;
  if (days <= 0) ago = "today";
  else if (days < 30) ago = `${days}d ago`;
  else if (days < 365) ago = `${Math.floor(days / 30)}mo ago`;
  else ago = `${Math.floor(days / 365)}y ago`;
  return { label: `priced ${ago}`, stale, unpriced: false };
}

// A recipe reduced to just what price-coverage needs — item identity, cost, and
// when it was last priced, plus its sub-recipe links so gaps propagate up.
export type RecipePriceNode = {
  id: string;
  items: { itemId: string; unitCost: number; priceUpdatedAt: Date | null }[];
  components: { childId: string }[];
};

// Ingredients in a recipe tree that need cost attention: `unpriced` (no cost on
// file — the recipe cost is understated) and `stale` (priced but not re-costed
// within PRICE_STALE_DAYS, or never stamped).
export type PriceGap = { unpriced: Set<string>; stale: Set<string> };

// recipeId -> the price gaps reachable ANYWHERE in its tree: its own ingredients
// plus every nested sub-recipe's, to any depth. This is what makes "ensure all
// items are recently costed" hold for a mother recipe, not just its top layer.
// Mirrors buildCostMap's cycle guard; cycles contribute nothing.
export function buildPriceGapMap(recipes: RecipePriceNode[], now: Date = new Date()): Map<string, PriceGap> {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const cache = new Map<string, PriceGap>();

  function walk(id: string, stack: Set<string>): PriceGap {
    const cached = cache.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node || stack.has(id)) return { unpriced: new Set(), stale: new Set() };
    stack.add(id);
    const gap: PriceGap = { unpriced: new Set(), stale: new Set() };
    for (const ri of node.items) {
      if (isUnpriced(ri.unitCost)) gap.unpriced.add(ri.itemId);
      else if (priceFreshness(ri.priceUpdatedAt, ri.unitCost, now).stale) gap.stale.add(ri.itemId);
    }
    for (const c of node.components) {
      const cg = walk(c.childId, stack);
      for (const x of cg.unpriced) gap.unpriced.add(x);
      for (const x of cg.stale) gap.stale.add(x);
    }
    stack.delete(id);
    cache.set(id, gap);
    return gap;
  }

  for (const r of recipes) walk(r.id, new Set());
  return cache;
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
