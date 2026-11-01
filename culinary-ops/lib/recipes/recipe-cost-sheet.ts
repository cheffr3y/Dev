import {
  buildCostMap, componentBatchFactor, componentLineCost, costPerYieldUnit,
  costUnitLabel, foodCostPct, lineCost, type RecipeCostNode, type RecipeItemWithCost,
} from "./costing";

export type CostSheetRecipe = Omit<RecipeCostNode, "items" | "components"> & {
  menuPrice?: number | null;
  items: (RecipeItemWithCost & { id: string; item: { name: string } })[];
  components: (RecipeCostNode["components"][number] & { id: string; child: { name: string } })[];
};

export function recipeCostSheet(recipe: CostSheetRecipe, recipes: RecipeCostNode[], scale: number) {
  const catalog = new Map(recipes.map((node) => [node.id, node]));
  catalog.set(recipe.id, recipe);
  const costMap = buildCostMap([...catalog.values()]);
  const ingredients = recipe.items.map((line) => {
    const { cost, converted } = lineCost(line);
    return {
      id: line.id, name: line.item.name, quantity: line.quantity * scale, unit: line.unit,
      unitCost: line.item.unitCost, costUnit: costUnitLabel(line.item.unit),
      cost: cost * scale, converted,
    };
  });
  const components = recipe.components.map((line) => {
    const child = catalog.get(line.childId);
    return {
      id: line.id, name: line.child.name, quantity: line.quantity * scale, unit: line.unit,
      unitCost: child ? costPerYieldUnit(costMap.get(child.id) ?? 0, child.yieldQty) : null,
      costUnit: child ? costUnitLabel(child.yieldUnit) : "unit",
      cost: componentLineCost(line, costMap, catalog) * scale,
      converted: child ? componentBatchFactor(line.quantity, line.unit, child.yieldQty, child.yieldUnit).converted : false,
    };
  });
  const ingredientsCost = ingredients.reduce((sum, line) => sum + line.cost, 0);
  const componentsCost = components.reduce((sum, line) => sum + line.cost, 0);
  const totalCost = ingredientsCost + componentsCost;
  const perUnit = costPerYieldUnit(totalCost, recipe.yieldQty * scale);
  return {
    ingredients, components, ingredientsCost, componentsCost, totalCost, perUnit,
    costUnit: costUnitLabel(recipe.yieldUnit),
    menuPrice: recipe.menuPrice ?? null,
    foodCostPercent: foodCostPct(perUnit, recipe.menuPrice),
  };
}

export type RecipeCostSheet = ReturnType<typeof recipeCostSheet>;
