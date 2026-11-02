import { convertQty } from "./units";
import { ALLERGENS, parseAllergens } from "./allergens";
import { money, preciseNum, priceFreshness } from "./costing";
import { allergenLabels } from "./allergens";

export type DependencyRecipe = {
  id: string; name: string; yieldQty: number; yieldUnit: string; allergens: string | null;
  items: { quantity: number; unit: string; item: { id: string; name: string; unit: string; unitCost: number; allergens: string | null; priceUpdatedAt: string | null } }[];
  components: { childId: string; quantity: number; unit: string }[];
};
export type DependencyBranch = {
  key: string; id: string; name: string; kind: "recipe" | "ingredient";
  quantity: number | null; unit: string; batches: number | null; cost: number | null;
  share: number | null; allergens: string[]; inherited: string[]; issues: string[]; children: DependencyBranch[];
};
export type DependencyTotal = { id: string; name: string; quantity: number | null; unit: string; cost: number | null };
export type DependencyPlan = { root: DependencyBranch; ingredients: DependencyTotal[]; subRecipes: DependencyTotal[]; complete: boolean; truncated: boolean; stale: boolean };
export type RecipeConsumer = { key: string; recipeId: string; name: string; href: string; detail: string; quantity: number; unit: string; kind: "menu" | "banquet" };
export type ConsumerBranch = { key: string; name: string; href: string; detail: string; children: ConsumerBranch[] };
const valid = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0;
const multiply = (a: number | null, b: number) => a !== null && valid(a * b) ? a * b : null;
const add = (a: number | null, b: number | null) => a !== null && b !== null && valid(a + b) ? a + b : null;

// Unlike the legacy printed costing fallback, this preview never equates
// incompatible units. Unknown quantities/costs remain unknown throughout rollups.
export function buildDependencyPlan(rootId: string, recipes: DependencyRecipe[], quantity: number, unit: string, now = new Date()): DependencyPlan | null {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const root = byId.get(rootId);
  if (!root) return null;
  const ingredientTotals = new Map<string, DependencyTotal>();
  const recipeTotals = new Map<string, DependencyTotal>();
  let remaining = 500, truncated = false, stale = false;
  const allergens = new Map<string, string[]>();
  const tags = (id: string) => {
    if (!allergens.has(id)) {
      const seen = new Set<string>(), found = new Set<string>(), queue = [id];
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (seen.has(current)) continue;
        seen.add(current);
        const recipe = byId.get(current);
        if (!recipe) continue;
        for (const tag of parseAllergens(recipe.allergens)) found.add(tag);
        for (const line of recipe.items) for (const tag of parseAllergens(line.item.allergens)) found.add(tag);
        for (const component of recipe.components) queue.push(component.childId);
      }
      allergens.set(id, ALLERGENS.filter(tag => found.has(tag.key)).map(tag => tag.key));
    }
    return allergens.get(id)!;
  };
  function accumulate(map: Map<string, DependencyTotal>, key: string, entry: DependencyTotal) {
    const previous = map.get(key);
    map.set(key, previous ? { ...entry, quantity: add(previous.quantity, entry.quantity), cost: add(previous.cost, entry.cost) } : entry);
  }
  function walk(id: string, batches: number | null, path: string, stack: Set<string>): DependencyBranch {
    const recipe = byId.get(id);
    const issues: string[] = [];
    const inherited = new Set(recipe?.items.flatMap(line => parseAllergens(line.item.allergens)) ?? []);
    for (const component of recipe?.components ?? []) for (const tag of tags(component.childId)) inherited.add(tag);
    const node: DependencyBranch = { key: path, id, name: recipe?.name ?? "Missing recipe", kind: "recipe", quantity: recipe ? multiply(batches, recipe.yieldQty) : null,
      unit: recipe?.yieldUnit ?? "", batches, cost: null, share: null, allergens: tags(id), inherited: tags(id).filter(tag => inherited.has(tag)), issues, children: [] };
    if (!recipe) { issues.push("Missing recipe link"); return node; }
    if (stack.has(id)) { node.quantity = null; node.batches = null; issues.push("Recipe cycle — traversal stopped"); return node; }
    if (--remaining < 0 || stack.size >= 32) { node.quantity = null; node.batches = null; truncated = true; issues.push("Preview limit reached — remaining demand is incomplete"); return node; }
    if (!(recipe.yieldQty > 0) || !Number.isFinite(recipe.yieldQty) || !recipe.yieldUnit.trim()) issues.push("Invalid recipe yield");
    if (batches === null) issues.push("Quantity cannot be scaled with these units");
    if (!recipe.items.length && !recipe.components.length) issues.push("Empty recipe build");
    const nextStack = new Set(stack).add(id);
    for (const [index, line] of recipe.items.entries()) {
      if (--remaining < 0) { truncated = true; issues.push("Preview limit reached — remaining demand is incomplete"); break; }
      const lineIssues: string[] = [];
      const amount = valid(line.quantity) && line.unit.trim() ? multiply(batches, line.quantity) : null;
      const converted = amount === null ? null : convertQty(amount, line.unit, line.item.unit);
      if (amount === null) lineIssues.push("Unknown or invalid ingredient quantity");
      else if (converted === null) lineIssues.push(`Unit mismatch: ${line.unit} → ${line.item.unit}`);
      const freshness = priceFreshness(line.item.priceUpdatedAt ? new Date(line.item.priceUpdatedAt) : null, line.item.unitCost, now);
      if (freshness.unpriced || !Number.isFinite(line.item.unitCost)) lineIssues.push("Missing or invalid ingredient price");
      else if (freshness.stale) { stale = true; lineIssues.push("Stale price — estimate"); }
      const cost = valid(converted) && line.item.unitCost > 0 && Number.isFinite(line.item.unitCost) ? multiply(converted, line.item.unitCost) : null;
      const ingredient: DependencyBranch = { key: `${path}/i${index}`, id: line.item.id, name: line.item.name, kind: "ingredient", quantity: amount, unit: line.unit,
        batches: null, cost, share: null, allergens: parseAllergens(line.item.allergens), inherited: [], issues: lineIssues, children: [] };
      node.children.push(ingredient);
      const compatible = !!line.unit.trim() && !!line.item.unit.trim() && convertQty(1, line.unit, line.item.unit) !== null;
      const totalUnit = compatible ? line.item.unit : line.unit;
      accumulate(ingredientTotals, `${line.item.id}:${totalUnit}`, { id: line.item.id, name: line.item.name, unit: totalUnit, quantity: compatible ? converted : amount, cost });
    }
    for (const [index, component] of recipe.components.entries()) {
      if (remaining < 0) break;
      const child = byId.get(component.childId);
      const amount = valid(component.quantity) && component.unit.trim() ? multiply(batches, component.quantity) : null;
      const converted = child && amount !== null && child.yieldUnit.trim() ? convertQty(amount, component.unit, child.yieldUnit) : null;
      const childBatches = child && valid(converted) && child.yieldQty > 0 && Number.isFinite(child.yieldQty) ? converted / child.yieldQty : null;
      const branch = walk(component.childId, valid(childBatches) ? childBatches : null, `${path}/r${index}`, nextStack);
      if (child && amount !== null && converted === null) branch.issues.push(`Unit mismatch: ${component.unit} → ${child.yieldUnit}`);
      node.children.push(branch);
      if (child) accumulate(recipeTotals, child.id, { id: child.id, name: child.name, unit: child.yieldUnit, quantity: branch.quantity, cost: branch.cost });
    }
    node.cost = issues.length || node.children.some(child => child.cost === null) ? null : node.children.reduce<number | null>((sum, child) => add(sum, child.cost), 0);
    // Stale estimates remain visible, while a missing cost never produces a percentage.
    for (const child of node.children) child.share = node.cost !== null && node.cost > 0 && child.cost !== null ? child.cost / node.cost * 100 : null;
    return node;
  }
  const converted = valid(quantity) && quantity > 0 && unit.trim() && root.yieldUnit.trim() ? convertQty(quantity, unit, root.yieldUnit) : null;
  const batches = valid(converted) && root.yieldQty > 0 && Number.isFinite(root.yieldQty) ? converted / root.yieldQty : null;
  const tree = walk(rootId, valid(batches) ? batches : null, rootId, new Set());
  return { root: tree, ingredients: [...ingredientTotals.values()].sort((a, b) => a.name.localeCompare(b.name)),
    subRecipes: [...recipeTotals.values()].sort((a, b) => a.name.localeCompare(b.name)), complete: tree.cost !== null && !truncated, truncated, stale };
}

export function parentRecipeIds(rootId: string, recipes: DependencyRecipe[]): Set<string> {
  const found = new Set([rootId]);
  const parents = new Map<string, string[]>();
  for (const recipe of recipes) for (const component of recipe.components) parents.set(component.childId, [...parents.get(component.childId) ?? [], recipe.id]);
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) for (const parent of parents.get(queue[i]) ?? []) if (!found.has(parent)) { found.add(parent); queue.push(parent); }
  return found;
}

export function buildConsumerTree(rootId: string, recipes: DependencyRecipe[], consumers: RecipeConsumer[]): { branches: ConsumerBranch[]; truncated: boolean } {
  let remaining = 300, truncated = false;
  const plans = new Map<string, DependencyPlan | null>();
  function visit(id: string, stack: Set<string>): ConsumerBranch[] {
    if (stack.has(id)) return [{ key: `${id}:cycle`, name: "Recipe cycle — traversal stopped", href: `/recipes/${encodeURIComponent(id)}`, detail: "Review recipe links", children: [] }];
    if (--remaining < 0 || stack.size >= 32) { truncated = true; return []; }
    const next = new Set(stack).add(id);
    const branches: ConsumerBranch[] = [];
    for (const consumer of consumers.filter(entry => entry.recipeId === id)) {
      if (--remaining < 0) { truncated = true; break; }
      branches.push({ key: consumer.key, name: consumer.name, href: consumer.href, detail: consumer.detail, children: [] });
    }
    for (const recipe of recipes.filter(recipe => recipe.components.some(component => component.childId === id))) {
      if (remaining < 0) break;
      const component = recipe.components.find(component => component.childId === id)!;
      if (!plans.has(recipe.id)) plans.set(recipe.id, buildDependencyPlan(recipe.id, recipes, recipe.yieldQty, recipe.yieldUnit));
      const plan = plans.get(recipe.id);
      const input = plan?.root.children.find(child => child.kind === "recipe" && child.id === id);
      branches.push({ key: recipe.id, name: recipe.name, href: `/recipes/${encodeURIComponent(recipe.id)}`,
        detail: `Parent recipe · uses ${component.quantity} ${component.unit} (${input?.batches == null ? "unknown" : preciseNum(input.batches)}× child batch) · ${input?.share == null ? "share unavailable" : `${preciseNum(input.share)}% of parent cost`} · ${money(plan?.root.cost)} estimated parent cost · Inherited allergens: ${allergenLabels(plan?.root.inherited ?? []) || "No recorded tags"}`,
        children: visit(recipe.id, next) });
    }
    return branches;
  }
  return { branches: visit(rootId, new Set()), truncated };
}
