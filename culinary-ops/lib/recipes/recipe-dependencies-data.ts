import { prisma } from "../db/prisma";
import { buildConsumerTree, parentRecipeIds, type DependencyRecipe, type RecipeConsumer } from "./recipe-dependencies";

// Recipes are already authorized and loaded by the detail page. Only the root's
// input graph is sent to the interactive preview; consumer links are built here.
export async function loadDependencyData(rootId: string, recipes: DependencyRecipe[]) {
  const parentIds = [...parentRecipeIds(rootId, recipes)];
  const [menus, banquets] = await Promise.all([
    prisma.menuRolloutItem.findMany({ where: { recipeId: { in: parentIds } }, select: { id: true, recipeId: true, parBatches: true, rollout: { select: { id: true, name: true, status: true } } }, orderBy: { rollout: { name: "asc" } }, take: 301 }),
    prisma.banquetMenuItem.findMany({ where: { recipeId: { in: parentIds } }, select: { id: true, recipeId: true, orderedQty: true, unit: true, banquet: { select: { id: true, name: true, date: true, status: true } } }, orderBy: { banquet: { date: "desc" } }, take: 301 }),
  ]);
  const consumers: RecipeConsumer[] = [
    ...menus.map(line => ({ key: `menu:${line.id}`, recipeId: line.recipeId, name: line.rollout.name, href: `/menus/${encodeURIComponent(line.rollout.id)}`, kind: "menu" as const,
      detail: `Menu · ${line.rollout.status} · ${line.parBatches} standard batches`, quantity: line.parBatches, unit: "batches" })),
    ...banquets.map(line => ({ key: `banquet:${line.id}`, recipeId: line.recipeId, name: line.banquet.name, href: `/banquets/${encodeURIComponent(line.banquet.id)}`, kind: "banquet" as const,
      detail: `Banquet · ${line.banquet.date.toISOString().slice(0, 10)} · ${line.banquet.status} · ${line.orderedQty} ${line.unit} ordered`, quantity: line.orderedQty, unit: line.unit })),
  ];
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const reachable = new Set<string>();
  const queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const component of byId.get(id)?.components ?? []) queue.push(component.childId);
  }
  const tree = buildConsumerTree(rootId, recipes, consumers);
  return { recipes: recipes.filter(recipe => reachable.has(recipe.id)), consumers: { ...tree, truncated: tree.truncated || menus.length > 300 || banquets.length > 300 } };
}
