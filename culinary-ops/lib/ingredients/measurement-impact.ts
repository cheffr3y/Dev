export type UsageGraph = { id: string; name: string; items: { itemId: string }[]; components: { childId: string }[] };
export function affectedRecipes<T extends UsageGraph>(recipes: T[], itemIds: string[]) {
  const items = new Set(itemIds);
  const affected = new Set(recipes.filter(recipe => recipe.items.some(line => items.has(line.itemId))).map(recipe => recipe.id));
  const parents = new Map<string, string[]>();
  for (const recipe of recipes) for (const component of recipe.components) parents.set(component.childId, [...parents.get(component.childId) ?? [], recipe.id]);
  const queue = [...affected];
  for (let i = 0; i < queue.length; i++) for (const parent of parents.get(queue[i]) ?? []) if (!affected.has(parent)) { affected.add(parent); queue.push(parent); }
  return recipes.filter(recipe => affected.has(recipe.id));
}
