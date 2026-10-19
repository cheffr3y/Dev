import { buildCostMap, buildPriceGapMap, componentBatchFactor, costPerYieldUnit, foodCostPct, type PriceGap } from "./costing";
import { buildBanquetPlan, type BanquetRecipeRow } from "./banquet";
import { effectiveAllergens } from "./allergens";
import { convertQty } from "./units";

export const ROLLOUT_STATUSES = ["ACTIVE", "REVIEW", "DRAFT", "ARCHIVED"] as const;
export const PACKET_MODES = [
  { mode: "all", label: "All-in-One Launch Book" },
  { mode: "costing", label: "01 // Costing & Margin Dossier" },
  { mode: "order-guide", label: "02 // Vendor Order Guide" },
  { mode: "allergens", label: "03 // FOH & BOH Allergen & Study Matrix" },
  { mode: "recipes", label: "04 // Complete Recipe & Sub-Recipe Bible" },
] as const;
export type PacketMode = typeof PACKET_MODES[number]["mode"];
export function packetMode(raw: string | string[] | undefined): PacketMode {
  return PACKET_MODES.find(option => option.mode === raw)?.mode ?? "all";
}

export type RolloutRecipe = Omit<BanquetRecipeRow, "items"> & {
  name: string;
  station: string | null;
  menuPrice: number | null;
  allergens: string | null;
  items: Array<BanquetRecipeRow["items"][number] & {
    item: BanquetRecipeRow["items"][number]["item"] & {
      allergens?: string | null;
      sku?: string | null;
      gcode?: string | null;
      packSize?: string | null;
      vendor?: { id: string; name: string } | null;
    };
  }>;
};
export type RolloutLine = {
  id: string; recipeId: string; section: string; menuTitle: string | null;
  menuDescription: string | null; menuPrice: number | null; parBatches: number; sortOrder: number;
};

export function isRolloutOrderable(item: { name: string; sku?: string | null }) {
  const name = item.name.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return !(name === "water" || item.sku?.trim() === "007"
    || /^chicken (?:backs?(?: bones?)?|bones?|feet)$/.test(name)
    || name === "carrot tops");
}

// A plated recipe must have a count yield before it can be divided into orders.
// Never invent a serving weight for a recipe stored in pounds or quarts.
export function platedServingSpec(recipe: { yieldQty: number; yieldUnit: string }) {
  const servings = /^(?:servings?|portions?|orders?|plates?)$/i.test(recipe.yieldUnit.trim())
    ? recipe.yieldQty : convertQty(recipe.yieldQty, recipe.yieldUnit, "each");
  return servings != null && servings > 0 && Number.isFinite(servings)
    ? { scale: 1 / servings, servings } : null;
}

export function buildMenuRollout(rollout: { items: RolloutLine[] }, recipes: RolloutRecipe[], now = new Date()) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const costMap = buildCostMap(recipes);
  const gapMap = buildPriceGapMap(recipes.map(recipe => ({
    id: recipe.id, components: recipe.components,
    items: recipe.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })),
  })), now);
  const rows = [...rollout.items].sort((a, b) => a.sortOrder - b.sortOrder).flatMap(item => {
    const recipe = byId.get(item.recipeId);
    if (!recipe) return [];
    const batchCost = costMap.get(recipe.id) ?? 0;
    // Existing costing uses the recipe's saved yield unit, including non-serving yields.
    const portionCost = costPerYieldUnit(batchCost, recipe.yieldQty);
    const effectiveMenuPrice = item.menuPrice ?? recipe.menuPrice;
    return [{ ...item, recipe, title: item.menuTitle || recipe.name, batchCost, portionCost,
      effectiveMenuPrice, fcp: foodCostPct(portionCost, effectiveMenuPrice),
      grossMargin: effectiveMenuPrice != null ? effectiveMenuPrice - portionCost : null,
      priceGaps: gapMap.get(recipe.id) ?? { unpriced: new Set<string>(), stale: new Set<string>() },
      allergens: effectiveAllergens(recipe.id, byId),
    }];
  });
  const sections = new Map<string, typeof rows>();
  for (const row of rows) sections.set(row.section, [...(sections.get(row.section) ?? []), row]);

  // Accumulate every path to a component, including diamonds and shared dishes.
  // Only the current ancestry guards cycles; a global seen set would undercount
  // a foundation used through two different sauces in the same dish.
  const required = new Map<string, { usedIn: Set<string>; openingBatches: number; converted: boolean }>();
  for (const row of rows) {
    const walk = (id: string, batches: number, stack: Set<string>, converted: boolean) => {
      for (const component of byId.get(id)?.components ?? []) {
        const child = byId.get(component.childId);
        if (stack.has(component.childId) || !child) continue;
        const factor = componentBatchFactor(component.quantity, component.unit, child.yieldQty, child.yieldUnit);
        const openingBatches = batches * factor.batches;
        const pathConverted = converted && factor.converted && child.yieldQty > 0;
        const demand = required.get(child.id) ?? { usedIn: new Set<string>(), openingBatches: 0, converted: true };
        demand.usedIn.add(row.title);
        demand.openingBatches += openingBatches;
        if (openingBatches > 0) demand.converted &&= pathConverted;
        required.set(child.id, demand);
        walk(child.id, openingBatches, new Set(stack).add(child.id), pathConverted);
      }
    };
    walk(row.recipeId, row.parBatches, new Set([row.recipeId]), row.recipe.yieldQty > 0);
  }
  const dependencies = [...required].map(([id, demand]) => ({
    recipe: byId.get(id)!, usedIn: [...demand.usedIn].sort(),
    openingBatches: demand.openingBatches,
    openingYieldQty: demand.openingBatches * byId.get(id)!.yieldQty,
    converted: demand.converted,
  }))
    .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));

  const openingPlan = buildBanquetPlan(rows.filter(row => row.parBatches > 0).map(row => ({
    recipeId: row.recipeId, recipeName: row.title,
    orderedQty: row.parBatches * row.recipe.yieldQty, unit: row.recipe.yieldUnit,
  })), recipes);
  const catalog = new Map(recipes.flatMap(recipe => recipe.items.map(({ item }) => [item.id, item] as const)));
  const orderLines = openingPlan.shoppingList.categories.flatMap(category => category.items.map(line => {
    const item = catalog.get(line.itemId)!;
    const quantities = line.amounts.map(amount => convertQty(amount.qty, amount.unit, item.unit));
    const converted = quantities.every(quantity => quantity != null);
    const purchaseQty = converted ? quantities.reduce<number>((sum, quantity) => sum + quantity!, 0) : null;
    return { ...line, item, purchaseQty, converted, extendedCost: purchaseQty != null ? purchaseQty * item.unitCost : null };
  }));
  // Ordering is a catalog checklist for the entire menu, independent of pars.
  // Theoretical demand above remains available to the costing dossier only.
  const guideRecipes = new Set([...rows.map(row => row.recipeId), ...dependencies.map(row => row.recipe.id)]);
  const guideCatalog = new Map(recipes.filter(recipe => guideRecipes.has(recipe.id))
    .flatMap(recipe => recipe.items.map(({ item }) => [item.id, item] as const)));
  const guideLines = [...guideCatalog.values()].filter(isRolloutOrderable)
    .map(item => ({ itemId: item.id, name: item.name, category: item.category, item }));
  const vendors = new Map<string, { id: string; name: string; lines: typeof guideLines }>();
  for (const line of guideLines) {
    const id = line.item.vendor?.id ?? "unassigned";
    const vendor = vendors.get(id) ?? { id, name: line.item.vendor?.name ?? "Unassigned vendor", lines: [] as typeof guideLines };
    vendor.lines.push(line);
    vendors.set(id, vendor);
  }
  const vendorGroups = [...vendors.values()].sort((a, b) => a.name.localeCompare(b.name)).map(vendor => ({
    ...vendor, lines: vendor.lines.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  }));
  const priceGaps: PriceGap = { unpriced: new Set(), stale: new Set() };
  for (const row of rows) {
    for (const id of row.priceGaps.unpriced) priceGaps.unpriced.add(id);
    for (const id of row.priceGaps.stale) priceGaps.stale.add(id);
  }
  const names = (ids: Set<string>) => [...ids].map(id => catalog.get(id)?.name ?? id).sort();
  const average = (values: (number | null)[]) => {
    const priced = values.filter((value): value is number => value != null);
    return priced.length ? priced.reduce((sum, value) => sum + value, 0) / priced.length : null;
  };
  // Only priced dishes enter a cost/revenue ratio; missing-price dishes remain
  // in opening cost and are explicitly counted in the summary.
  const pricedRows = rows.filter(row => row.effectiveMenuPrice != null && row.effectiveMenuPrice > 0);
  const parRevenue = pricedRows.reduce((sum, row) => sum + row.effectiveMenuPrice! * row.recipe.yieldQty * row.parBatches, 0);
  const parCost = pricedRows.reduce((sum, row) => sum + row.batchCost * row.parBatches, 0);
  return { rows, sections: [...sections].map(([name, rows]) => ({ name, rows })), dependencies,
    vendorGroups, guideLines, orderLines, openingPlan, priceGaps,
    unpricedNames: names(priceGaps.unpriced), staleNames: names(priceGaps.stale),
    averageMenuPrice: average(rows.map(row => row.effectiveMenuPrice)),
    averageFcp: average(rows.map(row => row.fcp)), averageMargin: average(rows.map(row => row.grossMargin)),
    parWeightedFcp: parRevenue > 0 ? parCost / parRevenue * 100 : null,
    totalOpeningFoodCost: openingPlan.totalCost,
    missingMenuPrices: rows.filter(row => row.fcp == null).length,
  };
}
export type MenuRolloutPlan = ReturnType<typeof buildMenuRollout>;
