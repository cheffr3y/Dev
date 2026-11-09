import { buildBanquetPlan, type BanquetLine, type BanquetRecipeRow } from "@/lib/banquets/banquet";
import { priceGapNames } from "@/lib/recipes/costing";
import { buildForecast, type ForecastLine } from "./festival";
import { buildFestivalAccounting, type FestivalExpenseInputs } from "./festival-accounting";

type ProposalMenuItem = ForecastLine & {
  recipe: { id: string; name: string; yieldUnit: string } | null;
};

export function buildFestivalProposal(
  festival: FestivalExpenseInputs & { expectedAttendance: number; captureRate: number; bufferPct: number },
  menuItems: ProposalMenuItem[],
  recipes: BanquetRecipeRow[],
) {
  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    menuItems,
  );
  const forecastById = new Map(forecast.rows.map((row) => [row.id, row]));
  const linked = menuItems.flatMap((item) => item.recipe ? [{ item, recipe: item.recipe }] : []);
  const lines: BanquetLine[] = linked.map(({ item, recipe }) => ({
    recipeId: recipe.id,
    recipeName: recipe.name,
    orderedQty: forecastById.get(item.id)!.finalPrepPortions,
    unit: recipe.yieldUnit,
  }));
  const plan = buildBanquetPlan(lines, recipes);
  const costByMenuItemId = new Map(linked.map(({ item }, index) => [item.id, plan.lineCosts[index].cost]));
  const accounting = buildFestivalAccounting(forecast.totals.revenue, plan.totalCost, festival);

  const nameByItemId = new Map<string, string>();
  for (const recipe of recipes) for (const { item } of recipe.items) nameByItemId.set(item.id, item.name);
  const priceGaps = priceGapNames(
    recipes.map((recipe) => ({
      id: recipe.id,
      items: recipe.items.map(({ item }) => ({
        itemId: item.id,
        unitCost: item.unitCost,
        priceUpdatedAt: item.priceUpdatedAt,
      })),
      components: recipe.components,
    })),
    linked.map(({ recipe }) => recipe.id),
    nameByItemId,
  );

  return { forecast, forecastById, plan, costByMenuItemId, accounting, priceGaps, unlinkedCount: menuItems.length - linked.length };
}
