import { buildCostMap, buildPriceGapMap, costPerYieldUnit, foodCostPct, type PriceGap } from "./costing";
import { buildBanquetPlan, type BanquetRecipeRow } from "./banquet";
import { effectiveAllergens } from "./allergens";
import { convertQty } from "./units";

export const ROLLOUT_STATUSES = ["ACTIVE", "REVIEW", "DRAFT", "ARCHIVED"] as const;
export const PACKET_MODES = [
  { mode: "all", label: "All-in-One Launch Book" },
  { mode: "costing", label: "01 // Costing & Margin Dossier" },
  { mode: "order-guide", label: "02 // Vendor Order Guide & Pull Sheet" },
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

  // Walk separately for each dish so shared dependencies retain every parent.
  const required = new Map<string, Set<string>>();
  for (const row of rows) {
    const seen = new Set<string>([row.recipeId]);
    const walk = (id: string) => {
      for (const component of byId.get(id)?.components ?? []) {
        if (seen.has(component.childId) || !byId.has(component.childId)) continue;
        seen.add(component.childId);
        const parents = required.get(component.childId) ?? new Set<string>();
        parents.add(row.title);
        required.set(component.childId, parents);
        walk(component.childId);
      }
    };
    walk(row.recipeId);
  }
  const dependencies = [...required].map(([id, parents]) => ({ recipe: byId.get(id)!, usedIn: [...parents].sort() }))
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
  const vendors = new Map<string, { id: string; name: string; lines: typeof orderLines }>();
  for (const line of orderLines) {
    const id = line.item.vendor?.id ?? "unassigned";
    const vendor = vendors.get(id) ?? { id, name: line.item.vendor?.name ?? "Unassigned vendor", lines: [] as typeof orderLines };
    vendor.lines.push(line);
    vendors.set(id, vendor);
  }
  const vendorGroups = [...vendors.values()].sort((a, b) => a.name.localeCompare(b.name)).map(vendor => ({
    ...vendor, lines: vendor.lines.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    estimatedCost: vendor.lines.reduce((sum, line) => sum + (line.extendedCost ?? 0), 0),
  }));
  const categoryGroups = openingPlan.shoppingList.categories.map(category => ({
    category: category.category, lines: orderLines.filter(line => line.category === category.category),
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
    vendorGroups, categoryGroups, orderLines, openingPlan, priceGaps,
    unpricedNames: names(priceGaps.unpriced), staleNames: names(priceGaps.stale),
    averageMenuPrice: average(rows.map(row => row.effectiveMenuPrice)),
    averageFcp: average(rows.map(row => row.fcp)), averageMargin: average(rows.map(row => row.grossMargin)),
    parWeightedFcp: parRevenue > 0 ? parCost / parRevenue * 100 : null,
    totalOpeningFoodCost: openingPlan.totalCost,
    missingMenuPrices: rows.filter(row => row.fcp == null).length,
  };
}
export type MenuRolloutPlan = ReturnType<typeof buildMenuRollout>;
