// Shopping (pull) list for a prep order: every raw ingredient needed across
// the whole packet, summed and rolled up into natural units. Sub-recipes are
// exploded down to their purchasable raw items — the same recursion the cost
// engine uses (lib/costing buildCostMap), but accumulating quantities per item
// instead of cost. The result is grouped by item category for the printout.

import { convertQty, canConvert, displayMeasure } from "./units";
import { componentBatchFactor } from "./costing";

// A recipe reduced to what the explosion needs: its raw items (with the parent
// Item's identity/category for grouping) and its sub-recipe components.
export type ShoppingRecipeNode = {
  id: string;
  yieldQty: number;
  yieldUnit: string;
  items: Array<{
    itemId: string;
    name: string;
    category: string;
    quantity: number;
    unit: string;
  }>;
  components: Array<{ childId: string; quantity: number; unit: string }>;
};

// One requested batch from the prep order (a printed line).
export type ShoppingRootLine = {
  recipeId: string;
  recipeName: string;
  requestedQty: number;
  requestedUnit: string;
};

// Display-ready amount (already rolled up to a natural unit).
export type ShoppingAmount = { qty: number; unit: string };

export type ShoppingListItem = {
  itemId: string;
  name: string;
  category: string;
  // Usually one amount; more than one only when an item is called for in
  // unit families that don't convert (e.g. some by weight, some by volume).
  amounts: ShoppingAmount[];
};

export type ShoppingListCategory = {
  category: string;
  items: ShoppingListItem[];
};

export type ShoppingList = {
  categories: ShoppingListCategory[];
  itemCount: number;
  // Recipes whose requested unit didn't convert to the yield unit — scaled ×1
  // as a fallback (same behaviour as the cook packet), surfaced as a warning.
  unscaledRecipes: string[];
};

// Per-item accumulator. Quantities are bucketed by convertibility: each bucket
// holds a running total in its representative unit; an incoming amount joins
// the first bucket it can convert into, else opens a new one.
type ItemAccumulator = {
  name: string;
  category: string;
  buckets: Array<{ unit: string; qty: number }>;
};

// Walk a recipe, adding its raw items (scaled by `factor`) and recursing into
// sub-recipes. `factor` multiplies the recipe's own item quantities; a child
// contributes (component qty / child yield) of a batch, times the parent's
// factor — identical to the cost engine's per-yield-unit math. Cycles are
// guarded via `stack` and contribute nothing.
function accumulate(
  recipeId: string,
  factor: number,
  byId: Map<string, ShoppingRecipeNode>,
  stack: Set<string>,
  add: (itemId: string, name: string, category: string, qty: number, unit: string) => void,
) {
  const node = byId.get(recipeId);
  if (!node || stack.has(recipeId)) return;
  stack.add(recipeId);

  for (const ri of node.items) {
    add(ri.itemId, ri.name, ri.category, ri.quantity * factor, ri.unit);
  }
  for (const c of node.components) {
    const child = byId.get(c.childId);
    if (!child) continue;
    // Convert the sub-recipe quantity into the child's yield unit, then express
    // it as a batch fraction of the child — same math the cost engine uses.
    const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
    accumulate(c.childId, batches * factor, byId, stack, add);
  }

  stack.delete(recipeId);
}

export function buildShoppingList(roots: ShoppingRootLine[], recipes: ShoppingRecipeNode[]): ShoppingList {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const items = new Map<string, ItemAccumulator>();
  const unscaled = new Set<string>();

  const add = (itemId: string, name: string, category: string, qty: number, unit: string) => {
    let agg = items.get(itemId);
    if (!agg) {
      agg = { name, category, buckets: [] };
      items.set(itemId, agg);
    }
    const bucket = agg.buckets.find((b) => canConvert(unit, b.unit));
    if (bucket) {
      bucket.qty += convertQty(qty, unit, bucket.unit)!;
    } else {
      agg.buckets.push({ unit, qty });
    }
  };

  for (const line of roots) {
    const node = byId.get(line.recipeId);
    if (!node) continue;
    const inYield = convertQty(line.requestedQty, line.requestedUnit, node.yieldUnit);
    let factor: number;
    if (inYield == null || node.yieldQty <= 0) {
      factor = 1; // fallback: assume one base batch, like the cook packet
      unscaled.add(line.recipeName);
    } else {
      factor = inYield / node.yieldQty;
    }
    accumulate(line.recipeId, factor, byId, new Set(), add);
  }

  const byCategory = new Map<string, ShoppingListItem[]>();
  for (const [itemId, agg] of items) {
    const amounts = agg.buckets.map((b) => {
      const m = displayMeasure(b.qty, b.unit);
      return { qty: m.qty, unit: m.label };
    });
    const arr = byCategory.get(agg.category) ?? [];
    arr.push({ itemId, name: agg.name, category: agg.category, amounts });
    byCategory.set(agg.category, arr);
  }

  const categories = [...byCategory.entries()]
    .map(([category, list]) => ({ category, items: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return { categories, itemCount: items.size, unscaledRecipes: [...unscaled].sort() };
}
