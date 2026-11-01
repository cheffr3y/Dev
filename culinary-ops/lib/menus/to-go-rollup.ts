import { buildCostMap, buildPriceGapMap } from "../recipes/costing";
import { buildDayPlan } from "../banquets/banquet";
import { buildMenuRollout, type RolloutRecipe } from "./menu-rollout";
import { convertQty } from "../recipes/units";

export type ToGoLine = {
  id: string; recipeId: string | null; name: string; section: string; description: string | null;
  sellingUnit: string | null; recipeQtyPerUnit: number | null; recipeAmountUnit: string | null; price: number | null;
  packagingCost: number | null; forecastQty: number | null; productionQty: number | null;
  actualSoldQty: number | null; confidence: string; packingNotes: string | null;
  customerInstructions: string | null; notes: string | null; sortOrder: number;
};

// Fail closed on incompatible yields. The older banquet engine permits legacy
// same-unit fallbacks; retail quantities must never silently use those fallbacks.
function recipeIssues(id: string, byId: Map<string, RolloutRecipe>, stack = new Set<string>()): string[] {
  const recipe = byId.get(id);
  if (!recipe) return ["Linked recipe is unavailable."];
  if (stack.has(id)) return [`Circular sub-recipe link in ${recipe.name}.`];
  const next = new Set(stack).add(id);
  const issues: string[] = [];
  if (!(recipe.yieldQty > 0)) issues.push(`${recipe.name}: standard yield needs review.`);
  if (!recipe.items.length && !recipe.components.length) issues.push(`${recipe.name}: ingredients and build are still empty.`);
  for (const line of recipe.items) {
    if (convertQty(line.quantity, line.unit, line.item.unit) == null) {
      issues.push(`${recipe.name}: ${line.item.name} uses ${line.unit}, but is purchased in ${line.item.unit}. Review conversion.`);
    }
  }
  for (const component of recipe.components) {
    const child = byId.get(component.childId);
    if (!child) { issues.push(`${recipe.name}: sub-recipe is unavailable.`); continue; }
    if (convertQty(component.quantity, component.unit, child.yieldUnit) == null) {
      issues.push(`${recipe.name}: ${component.unit} does not convert to ${child.name}'s ${child.yieldUnit} yield.`);
    }
    issues.push(...recipeIssues(child.id, byId, next));
  }
  return [...new Set(issues)];
}

export function buildToGoRollup(rollup: { items: ToGoLine[] }, recipes: RolloutRecipe[], now = new Date()) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const costs = buildCostMap(recipes);
  const priceGaps = buildPriceGapMap(recipes.map(recipe => ({
    id: recipe.id, components: recipe.components,
    items: recipe.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })),
  })), now);
  const rows = [...rollup.items].sort((a, b) => a.sortOrder - b.sortOrder).map(line => {
    const recipe = line.recipeId ? byId.get(line.recipeId) ?? null : null;
    const issues = recipe ? recipeIssues(recipe.id, byId) : ["Link a recipe when ready."];
    const mappedQty = recipe && line.sellingUnit
      ? line.recipeQtyPerUnit != null
        ? line.recipeAmountUnit ? convertQty(line.recipeQtyPerUnit, line.recipeAmountUnit, recipe.yieldUnit) : null
        : convertQty(1, line.sellingUnit, recipe.yieldUnit) : null;
    const quantityPerUnit = mappedQty != null && mappedQty > 0 && Number.isFinite(mappedQty) ? mappedQty : null;
    if (!line.sellingUnit) issues.push("Selling unit is still undecided.");
    else if (recipe && quantityPerUnit == null) issues.push(`Set the amount of ${recipe.yieldUnit} per ${line.sellingUnit}; no weight or package size is assumed.`);
    if (recipe && line.recipeQtyPerUnit != null && quantityPerUnit == null) issues.push(`Saved content amount ${line.recipeQtyPerUnit} ${line.recipeAmountUnit ?? "unit missing"} does not convert to the current ${recipe.yieldUnit} yield. Review the package specification.`);
    const gap = recipe ? priceGaps.get(recipe.id) : undefined;
    const yieldReady = recipe != null && recipe.yieldQty > 0 && quantityPerUnit != null;
    const productionReady = yieldReady && issues.length === 0;
    const foodCost = productionReady && !gap?.unpriced.size
      ? (costs.get(recipe!.id) ?? 0) / recipe!.yieldQty * quantityPerUnit! : null;
    const unitCost = foodCost != null && line.packagingCost != null ? foodCost + line.packagingCost : null;
    const margin = line.price != null && unitCost != null ? line.price - unitCost : null;
    const revenue = line.forecastQty != null && line.sellingUnit && line.price != null ? line.forecastQty * line.price : null;
    const forecastCost = unitCost != null && line.forecastQty != null ? line.forecastQty * unitCost : null;
    const targetQty = line.productionQty ?? line.forecastQty;
    const productionYield = productionReady && targetQty != null ? targetQty * quantityPerUnit! : null;
    const warnings = [...issues];
    if (line.forecastQty == null) warnings.push("Sales estimate has not been entered.");
    if (line.price == null) warnings.push("Selling price is not set.");
    if (line.packagingCost == null) warnings.push("Packaging cost is not set; enter 0 if none.");
    if (gap?.unpriced.size) warnings.push(`${gap.unpriced.size} ingredient price(s) missing; food cost is incomplete.`);
    if (gap?.stale.size) warnings.push(`${gap.stale.size} ingredient price(s) need review.`);
    return { ...line, recipe, quantityPerUnit, productionReady, foodCost, unitCost, margin, revenue, forecastCost,
      foodCostPct: foodCost != null && line.price != null && line.price > 0 ? foodCost / line.price * 100 : null,
      totalCostPct: unitCost != null && line.price != null && line.price > 0 ? unitCost / line.price * 100 : null,
      targetQty, targetSource: line.productionQty != null ? "Production target" : "Sales estimate",
      productionYield, warnings,
      actualRevenue: line.actualSoldQty != null && line.price != null && line.sellingUnit ? line.actualSoldQty * line.price : null,
      salesVariance: line.actualSoldQty != null && line.forecastQty != null && line.sellingUnit ? line.actualSoldQty - line.forecastQty : null,
    };
  });
  const menuPlan = buildMenuRollout({ items: rows.filter(row => row.recipe).map(row => ({
    id: row.id, recipeId: row.recipe!.id, section: row.section, menuTitle: row.name,
    menuDescription: row.description, menuPrice: null, parBatches: 0, sortOrder: row.sortOrder,
  })) }, recipes, now);
  const eligible = rows.filter(row => row.productionYield != null && row.productionYield > 0 && row.recipe);
  const production = buildDayPlan(eligible.map(row => ({
    id: row.id, name: row.name, guestCount: 0,
    lines: [{ recipeId: row.recipe!.id, recipeName: row.name, orderedQty: row.productionYield!, unit: row.recipe!.yieldUnit }],
  })), recipes);
  const sections = new Map<string, typeof rows>();
  for (const row of rows) sections.set(row.section, [...(sections.get(row.section) ?? []), row]);
  const salesByUnit = new Map<string, number>();
  for (const row of rows) if (row.sellingUnit && row.forecastQty != null) {
    salesByUnit.set(row.sellingUnit, (salesByUnit.get(row.sellingUnit) ?? 0) + row.forecastQty);
  }
  const sumKnown = (values: (number | null)[]) => values.some(value => value != null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const completeMarginRows = rows.filter(row => row.revenue != null && row.forecastCost != null);
  return {
    rows, sections: [...sections].map(([name, rows]) => ({ name, rows })), menuPlan, production,
    salesByUnit: [...salesByUnit].map(([unit, qty]) => ({ unit, qty })),
    forecastRevenue: sumKnown(rows.map(row => row.revenue)),
    forecastCost: sumKnown(rows.map(row => row.forecastCost)),
    forecastMargin: sumKnown(completeMarginRows.map(row => row.revenue! - row.forecastCost!)),
    revenueCoverage: rows.filter(row => row.revenue != null).length,
    costCoverage: rows.filter(row => row.forecastCost != null).length,
    marginCoverage: completeMarginRows.length,
    productionExcluded: rows.filter(row => row.targetQty != null && row.targetQty > 0 && row.productionYield == null),
  };
}
export type ToGoPlan = ReturnType<typeof buildToGoRollup>;
