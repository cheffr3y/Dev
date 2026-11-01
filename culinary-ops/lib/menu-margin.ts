import { componentBatchFactor, lineCost } from "./costing";
import type { MenuRolloutPlan, RolloutRecipe } from "./menu-rollout";

export function buildMenuMarginMatrix(plan: MenuRolloutPlan, recipes: RolloutRecipe[], target: number) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  function valid(id: string, stack = new Set<string>()): boolean {
    const recipe = byId.get(id);
    if (!recipe || stack.has(id) || !Number.isFinite(recipe.yieldQty) || recipe.yieldQty <= 0 || !recipe.items.length && !recipe.components.length) return false;
    return recipe.items.every(item => Number.isFinite(item.quantity) && item.quantity >= 0 && lineCost(item).converted)
      && recipe.components.every(component => {
        const child = byId.get(component.childId);
        return child && Number.isFinite(component.quantity) && component.quantity >= 0
          && componentBatchFactor(component.quantity, component.unit, child.yieldQty, child.yieldUnit).converted
          && valid(child.id, new Set(stack).add(id));
      });
  }
  const rows = plan.rows.map(row => {
    const reliable = row.fcp != null && Number.isFinite(row.fcp) && row.effectiveMenuPrice! > 0 && !row.priceGaps.unpriced.size && valid(row.recipeId);
    return { id: row.id, section: row.section, fcp: reliable ? row.fcp : null, margin: reliable ? row.grossMargin : null,
      stale: !!row.priceGaps.stale.size, overTarget: reliable && row.fcp! > target };
  });
  const average = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => value != null && Number.isFinite(value));
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  };
  return { rows, averageFcp: average(rows.map(row => row.fcp)), averageMargin: average(rows.map(row => row.margin)),
    needsReview: rows.filter(row => row.fcp == null).length,
    categories: plan.sections.map(section => {
      const selected = rows.filter(row => row.section === section.name);
      return { name: section.name, count: selected.length, reviewedCount: selected.filter(row => row.fcp != null).length,
        averageFcp: average(selected.map(row => row.fcp)), averageMargin: average(selected.map(row => row.margin)),
        overTarget: selected.filter(row => row.overTarget).length };
    }) };
}
