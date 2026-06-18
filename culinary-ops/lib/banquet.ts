// Banquet kitchen rollup. Given the transcribed BEO food lines (recipe +
// ordered qty) and the recipe catalog, scale every dish by the ordered amount
// and produce (1) a per-line fully-loaded cost, (2) the banquet's total food
// cost, and (3) one aggregated prep/pull list with sub-recipes exploded to raw
// purchasable items. This reuses the same engines as costing/shopping so the
// numbers match the rest of the app:
//   • buildCostMap        — fully-loaded recipe cost incl. nested sub-recipes
//   • componentBatchFactor — ordered qty → batch multiplier (with unit convert)
//   • buildShoppingList    — explode + roll up raw items into natural units

import { buildCostMap, componentBatchFactor, type RecipeCostNode } from "./costing";
import { buildShoppingList, type ShoppingRecipeNode, type ShoppingList } from "./shopping";

// A recipe row loaded with everything both engines need. Callers select this
// exact shape from Prisma (see the banquet pages).
export type BanquetRecipeRow = {
  id: string;
  yieldQty: number;
  yieldUnit: string;
  items: Array<{
    quantity: number;
    unit: string;
    item: { id: string; name: string; category: string; unitCost: number; unit: string };
  }>;
  components: Array<{ childId: string; quantity: number; unit: string }>;
};

// One BEO food line reduced to what the rollup needs.
export type BanquetLine = {
  recipeId: string;
  recipeName: string;
  orderedQty: number;
  unit: string;
};

// Per-line result, returned in the same order as the input lines.
export type BanquetLineCost = {
  factor: number; // batch multiplier the recipe was scaled by
  converted: boolean; // false when the ordered unit didn't convert to the yield unit
  cost: number; // fully-loaded scaled cost for this line
};

export type BanquetPlan = {
  lineCosts: BanquetLineCost[];
  totalCost: number;
  shoppingList: ShoppingList;
};

export function buildBanquetPlan(lines: BanquetLine[], recipes: BanquetRecipeRow[]): BanquetPlan {
  const costNodes: RecipeCostNode[] = recipes.map((r) => ({
    id: r.id,
    yieldQty: r.yieldQty,
    yieldUnit: r.yieldUnit,
    items: r.items.map((ri) => ({ quantity: ri.quantity, unit: ri.unit, item: { unitCost: ri.item.unitCost, unit: ri.item.unit } })),
    components: r.components,
  }));
  const costMap = buildCostMap(costNodes);
  const yieldById = new Map(recipes.map((r) => [r.id, { qty: r.yieldQty, unit: r.yieldUnit }]));

  let totalCost = 0;
  const lineCosts: BanquetLineCost[] = lines.map((l) => {
    const y = yieldById.get(l.recipeId);
    const { batches, converted } = componentBatchFactor(l.orderedQty, l.unit, y?.qty ?? 1, y?.unit ?? l.unit);
    const cost = (costMap.get(l.recipeId) ?? 0) * batches;
    totalCost += cost;
    return { factor: batches, converted, cost };
  });

  const shoppingNodes: ShoppingRecipeNode[] = recipes.map((r) => ({
    id: r.id,
    yieldQty: r.yieldQty,
    yieldUnit: r.yieldUnit,
    items: r.items.map((ri) => ({
      itemId: ri.item.id,
      name: ri.item.name,
      category: ri.item.category,
      quantity: ri.quantity,
      unit: ri.unit,
    })),
    components: r.components,
  }));
  const shoppingList = buildShoppingList(
    lines.map((l) => ({ recipeId: l.recipeId, recipeName: l.recipeName, requestedQty: l.orderedQty, requestedUnit: l.unit })),
    shoppingNodes,
  );

  return { lineCosts, totalCost, shoppingList };
}

// The Prisma `select` shared by the banquet pages to load BanquetRecipeRow.
export const banquetRecipeSelect = {
  id: true,
  yieldQty: true,
  yieldUnit: true,
  items: { select: { quantity: true, unit: true, item: { select: { id: true, name: true, category: true, unitCost: true, unit: true } } } },
  components: { select: { childId: true, quantity: true, unit: true } },
} as const;
