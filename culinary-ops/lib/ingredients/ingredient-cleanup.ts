import { canConvert, convertQty, unitFamily } from "../recipes/units";

const SINGULAR: Record<string, string> = { tomatoes: "tomato", potatoes: "potato", leaves: "leaf", berries: "berry", onions: "onion", peppers: "pepper", eggs: "egg", lemons: "lemon", limes: "lime", carrots: "carrot", mushrooms: "mushroom" };

// Suggestions only: retain preparation/product words, reorder tokens to match
// "Tomato, Roma" with "Roma Tomato", and never infer product equivalence.
export function ingredientNameKey(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).map(word => SINGULAR[word] ?? word).sort().join(" ");
}

export function duplicateIngredientGroups<T extends { id: string; name: string }>(items: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = ingredientNameKey(item.name);
    if (key) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

export type IngredientLine = { id: string; recipeId: string; quantity: number; unit: string; note: string | null; recipe: { name: string; version: number } };
export type ReplacementLine = { source: IngredientLine; target: IngredientLine | null; quantity: number; unit: string; note: string | null; error: string | null };

export function packageBasisConflict(source: { unit: string; packQty: number | null; packUnit: string | null; packSize: string | null }, target: typeof source): boolean {
  return unitFamily(source.unit) == null && (source.packQty !== target.packQty || source.packUnit !== target.packUnit || source.packSize !== target.packSize);
}

export function planIngredientReplacement(sourceUnit: string, targetUnit: string, sourceLines: IngredientLine[], targetLines: IngredientLine[]): ReplacementLine[] {
  const targets = new Map(targetLines.map(line => [line.recipeId, line]));
  return sourceLines.map(source => {
    const target = targets.get(source.recipeId) ?? null;
    const converted = target ? convertQty(source.quantity, source.unit, target.unit) : source.quantity;
    const error = !canConvert(sourceUnit, targetUnit)
      ? "Purchase units are not convertible. Review the measurement basis before replacing."
      : converted == null ? `Cannot combine ${source.unit} with ${target?.unit}; edit this recipe line first.` : null;
    const notes = [...new Set([target?.note, source.note].map(note => note?.trim()).filter(Boolean))];
    return { source, target, quantity: target ? target.quantity + (converted ?? 0) : source.quantity,
      unit: target?.unit ?? source.unit, note: notes.join("\n") || null, error };
  });
}
