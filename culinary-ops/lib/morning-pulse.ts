import type { Prisma } from "@prisma/client";
import { buildCostMap, buildPriceGapMap, componentBatchFactor, costPerYieldUnit, foodCostPct, isUnpriced, lineCost, type RecipeCostNode } from "./costing";
import { addDays, isoDate, startOfUtcWeek } from "./banquet-week";
import { businessDate, chicagoToday } from "./prep-dates";

// Items have no archive flag. Current operational references define in-use items.
export const inUseIngredientWhere = {
  OR: [
    { recipeItems: { some: {} } }, { inventoryItems: { some: {} } },
    { orderGuideLines: { some: {} } }, { festivalOnHand: { some: {} } },
  ],
} satisfies Prisma.ItemWhereInput;

export function ingredientIntegrity(item: { unitCost: number; unit: string; vendorId: string | null }) {
  return { missingCost: isUnpriced(item.unitCost), missingUnit: !item.unit.trim(), missingVendor: !item.vendorId };
}

export function pulseDates(now = new Date()) {
  const day = chicagoToday(now);
  const start = businessDate(day);
  return { day, start, end: addDays(start, 7), week: isoDate(startOfUtcWeek(start)) };
}

type PulseRecipe = Omit<RecipeCostNode, "items"> & {
  name: string; menuPrice: number | null;
  items: Array<RecipeCostNode["items"][number] & { item: { id: string; unitCost: number; unit: string; priceUpdatedAt: Date | null } }>;
};
type PulseMenu = {
  id: string; name: string; targetFcp: number;
  items: Array<{ id: string; recipeId: string; menuTitle: string | null; menuPrice: number | null }>;
};

export function buildMarginWatchlist(menus: PulseMenu[], recipes: PulseRecipe[], now = new Date()) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const costs = buildCostMap(recipes);
  const gaps = buildPriceGapMap(recipes.map(recipe => ({
    id: recipe.id, components: recipe.components,
    items: recipe.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })),
  })), now);
  // A fallback unit conversion, missing dependency, cycle, or invalid yield
  // cannot support a trustworthy margin. Check the complete recipe tree.
  function valid(id: string, path = new Set<string>()): boolean {
    const recipe = byId.get(id);
    if (!recipe || path.has(id) || !(recipe.yieldQty > 0) || recipe.items.length + recipe.components.length === 0) return false;
    const next = new Set(path).add(id);
    return recipe.items.every(item => lineCost(item).converted)
      && recipe.components.every(component => {
        const child = byId.get(component.childId);
        return child && componentBatchFactor(component.quantity, component.unit, child.yieldQty, child.yieldUnit).converted
          && valid(child.id, next);
      });
  }
  let needsReview = 0;
  const rows = menus.flatMap(menu => menu.items.flatMap(item => {
    const recipe = byId.get(item.recipeId);
    const price = item.menuPrice ?? recipe?.menuPrice;
    const gap = gaps.get(item.recipeId);
    if (!recipe || !price || price <= 0 || gap?.unpriced.size || !valid(item.recipeId)) {
      needsReview++;
      return [];
    }
    const fcp = foodCostPct(costPerYieldUnit(costs.get(recipe.id) ?? 0, recipe.yieldQty), price)!;
    return fcp > menu.targetFcp ? [{
      id: item.id, menuId: menu.id, menuName: menu.name, recipeId: recipe.id,
      title: item.menuTitle || recipe.name, fcp, target: menu.targetFcp, stale: !!gap?.stale.size,
    }] : [];
  })).sort((a, b) => (b.fcp - b.target) - (a.fcp - a.target) || a.title.localeCompare(b.title));
  return { rows, needsReview };
}

type DayCount = { date: Date; count: number };
export function buildCloseoutQueue(requests: DayCount[], batches: DayCount[], transfers: DayCount[], closed: Date[]) {
  const finalized = new Set(closed.map(isoDate));
  const days = new Map<string, { day: string; requests: number; batches: number; transfers: number }>();
  for (const [kind, records] of [["requests", requests], ["batches", batches], ["transfers", transfers]] as const) {
    for (const record of records) {
      const day = isoDate(record.date);
      if (finalized.has(day)) continue;
      const row = days.get(day) ?? { day, requests: 0, batches: 0, transfers: 0 };
      row[kind] += record.count;
      days.set(day, row);
    }
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
