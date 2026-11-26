// Vegan / vegetarian roll-up. Ingredients carry a dietary status; recipes work
// theirs out from every ingredient and sub-recipe, like allergens. A chef can
// override a recipe (with a reason). Untagged ingredients mean "unknown" — the
// app never claims vegan or vegetarian on a guess.

export const DIETS = [
  { key: "vegan", label: "Vegan", hint: "No animal products" },
  { key: "vegetarian", label: "Vegetarian", hint: "No meat or fish; may contain dairy, eggs, honey" },
  { key: "neither", label: "Neither", hint: "Meat, fish, gelatin or other animal flesh" },
] as const;

export type Diet = (typeof DIETS)[number]["key"];

export function parseDiet(raw: string | null | undefined): Diet | null {
  const value = raw?.trim().toLowerCase();
  return DIETS.some((diet) => diet.key === value) ? (value as Diet) : null;
}

export function dietLabel(diet: Diet | null): string {
  return DIETS.find((d) => d.key === diet)?.label ?? "Not tagged";
}

// Combine two statuses: anything not vegetarian makes the whole dish not
// vegetarian; otherwise one unknown makes the dish unknown.
const RANK: Record<Diet, number> = { vegan: 0, vegetarian: 1, neither: 2 };

export type DietNode = {
  dietOverride?: string | null;
  items?: Array<{ name?: string; diet?: string | null; item?: { name?: string; diet?: string | null } }>;
  components: { childId: string }[];
};

export type EffectiveDiet = {
  diet: Diet | null;
  overridden: boolean;
  // Ingredients (anywhere in the tree) with no dietary tag, by name.
  untagged: string[];
};

export function effectiveDiet(rootId: string, byId: Map<string, DietNode>): EffectiveDiet {
  const cache = new Map<string, EffectiveDiet>();
  const walk = (id: string, stack: Set<string>): EffectiveDiet => {
    const cached = cache.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node || stack.has(id)) return { diet: null, overridden: false, untagged: [] };
    stack.add(id);
    const untagged = new Set<string>();
    let worst = "vegan" as Diet;
    let unknown = false, any = false;
    const take = (diet: Diet | null) => {
      any = true;
      if (diet == null) unknown = true;
      else if (RANK[diet] > RANK[worst]) worst = diet;
    };
    for (const line of node.items ?? []) {
      const source = line.item ?? line;
      const diet = parseDiet(source.diet);
      if (diet == null && source.name) untagged.add(source.name);
      take(diet);
    }
    for (const c of node.components) {
      const child = walk(c.childId, stack);
      for (const name of child.untagged) untagged.add(name);
      take(child.diet);
    }
    stack.delete(id);
    const rolled: Diet | null = !any ? null : worst === "neither" ? "neither" : unknown ? null : worst;
    const override = parseDiet(node.dietOverride);
    const result = { diet: override ?? rolled, overridden: override != null, untagged: [...untagged].sort((a, b) => a.localeCompare(b)) };
    cache.set(id, result);
    return result;
  };
  return walk(rootId, new Set());
}

// The spelled-out line for a client menu: only a positive claim prints.
export function dietMenuText(diet: Diet | null): string {
  return diet === "vegan" ? "Vegan" : diet === "vegetarian" ? "Vegetarian" : "";
}
