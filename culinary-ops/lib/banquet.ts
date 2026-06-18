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

// --- Day rollup (multiple banquets, one date) -----------------------------
//
// Kitchens batch prep by recipe and sub-recipe, not by event. When two parties
// on the same day both call for "House Marinara" — directly or buried inside a
// dish — the chef wants to make ONE batch for the day, then divide it between
// the parties afterward. buildDayPlan rolls every recipe and sub-recipe up by
// batch across all of the day's banquets, records which party contributed how
// much (the split), and produces one combined raw-item pull list.

// One banquet on the day, reduced to its food lines.
export type BanquetParty = {
  id: string;
  name: string;
  guestCount: number;
  lines: BanquetLine[];
};

// What one party contributes to a rolled-up recipe/sub-recipe.
export type RecipeRollupSplit = { partyId: string; partyName: string; batches: number; qty: number };

// One recipe or sub-recipe, summed across the whole day.
export type RecipeRollupRow = {
  recipeId: string;
  recipeName: string;
  yieldUnit: string;
  isSubRecipe: boolean; // reached only through another recipe's components, never ordered directly
  totalBatches: number;
  totalQty: number; // totalBatches × yieldQty, expressed in yieldUnit
  splits: RecipeRollupSplit[]; // per party, in day order; shared when length > 1
};

export type DayPlan = {
  parties: Array<{ id: string; name: string; guestCount: number; cost: number }>;
  recipeRollup: RecipeRollupRow[];
  shoppingList: ShoppingList;
  totalCost: number;
  totalGuests: number;
};

// Walk a recipe tree recording the batch factor for every recipe touched —
// same recursion the cost/shopping engines use, but accumulating batches per
// recipe instead of cost or raw items. Cycles contribute nothing.
function accumulateRecipeBatches(
  recipeId: string,
  factor: number,
  byId: Map<string, BanquetRecipeRow>,
  stack: Set<string>,
  add: (recipeId: string, batches: number) => void,
) {
  const node = byId.get(recipeId);
  if (!node || stack.has(recipeId)) return;
  stack.add(recipeId);
  add(recipeId, factor);
  for (const c of node.components) {
    const child = byId.get(c.childId);
    if (!child) continue;
    const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
    accumulateRecipeBatches(c.childId, batches * factor, byId, stack, add);
  }
  stack.delete(recipeId);
}

export function buildDayPlan(parties: BanquetParty[], recipes: Array<BanquetRecipeRow & { name: string }>): DayPlan {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const nameById = new Map(recipes.map((r) => [r.id, r.name]));

  // Recipes ordered directly on any BEO line are dishes, not sub-recipes —
  // even if they also appear inside another recipe.
  const rootRecipeIds = new Set<string>();
  for (const p of parties) for (const l of p.lines) rootRecipeIds.add(l.recipeId);

  // recipeId → (partyId → batches)
  const perRecipe = new Map<string, Map<string, number>>();
  for (const party of parties) {
    for (const line of party.lines) {
      const y = byId.get(line.recipeId);
      const { batches } = componentBatchFactor(line.orderedQty, line.unit, y?.yieldQty ?? 1, y?.yieldUnit ?? line.unit);
      accumulateRecipeBatches(line.recipeId, batches, byId, new Set(), (rid, b) => {
        let byParty = perRecipe.get(rid);
        if (!byParty) {
          byParty = new Map();
          perRecipe.set(rid, byParty);
        }
        byParty.set(party.id, (byParty.get(party.id) ?? 0) + b);
      });
    }
  }

  const recipeRollup: RecipeRollupRow[] = [];
  for (const [recipeId, byParty] of perRecipe) {
    const node = byId.get(recipeId);
    const yieldQty = node?.yieldQty ?? 1;
    const yieldUnit = node?.yieldUnit ?? "batch";
    const splits: RecipeRollupSplit[] = parties
      .filter((p) => (byParty.get(p.id) ?? 0) > 0)
      .map((p) => {
        const batches = byParty.get(p.id)!;
        return { partyId: p.id, partyName: p.name, batches, qty: batches * yieldQty };
      });
    const totalBatches = splits.reduce((s, x) => s + x.batches, 0);
    recipeRollup.push({
      recipeId,
      recipeName: nameById.get(recipeId) ?? "Unknown recipe",
      yieldUnit,
      isSubRecipe: !rootRecipeIds.has(recipeId),
      totalBatches,
      totalQty: totalBatches * yieldQty,
      splits,
    });
  }
  // Shared lines (2+ parties) first, then dishes before sub-recipes, then name.
  recipeRollup.sort(
    (a, b) =>
      Number(b.splits.length > 1) - Number(a.splits.length > 1) ||
      Number(a.isSubRecipe) - Number(b.isSubRecipe) ||
      a.recipeName.localeCompare(b.recipeName),
  );

  // Combined pull list + per-party cost reuse the single-banquet engine.
  const allLines = parties.flatMap((p) => p.lines);
  const { shoppingList } = buildBanquetPlan(allLines, recipes);

  let totalCost = 0;
  let totalGuests = 0;
  const partySummaries = parties.map((p) => {
    const cost = buildBanquetPlan(p.lines, recipes).totalCost;
    totalCost += cost;
    totalGuests += p.guestCount;
    return { id: p.id, name: p.name, guestCount: p.guestCount, cost };
  });

  return { parties: partySummaries, recipeRollup, shoppingList, totalCost, totalGuests };
}

// The Prisma `select` shared by the banquet pages to load BanquetRecipeRow.
export const banquetRecipeSelect = {
  id: true,
  yieldQty: true,
  yieldUnit: true,
  items: { select: { quantity: true, unit: true, item: { select: { id: true, name: true, category: true, unitCost: true, unit: true } } } },
  components: { select: { childId: true, quantity: true, unit: true } },
} as const;
