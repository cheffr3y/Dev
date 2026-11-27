// Pure checks behind the Cleanup page. Each one finds catalog or recipe data
// that makes costs, pull lists or printed cards wrong. They only suggest:
// nothing here changes data or decides two things are the same.

import { recipePurchaseQuantity, type IngredientMeasure } from "../ingredients/measurements";
import { unitLabel } from "../recipes/units";

// "Spices" / "Spices & Seasonings", "Dry goods" / "Dry Goods": the words of
// one category name are all inside the other's. Returns groups of 2+ names.
function categoryWords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(word => word && word !== "and")
    .map(word => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
}

export function similarCategoryGroups(categories: string[]): string[][] {
  const names = [...new Set(categories.map(name => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const words = new Map(names.map(name => [name, new Set(categoryWords(name))]));
  const parent = new Map(names.map(name => [name, name]));
  const find = (name: string): string => parent.get(name) === name ? name : find(parent.get(name)!);
  for (const a of names) for (const b of names) {
    if (a >= b) continue;
    const wa = words.get(a)!, wb = words.get(b)!;
    if (!wa.size || !wb.size) continue;
    const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
    if ([...small].every(word => large.has(word))) parent.set(find(b), find(a));
  }
  const groups = new Map<string, string[]>();
  for (const name of names) groups.set(find(name), [...(groups.get(find(name)) ?? []), name]);
  return [...groups.values()].filter(group => group.length > 1);
}

// A method step that starts with a lowercase letter ("lace brisket in…") is
// usually an imported step that lost its first letter. A hint only.
export function stepLooksClipped(step: string): boolean {
  return /^[a-z]/.test(step.trim());
}

// Notes or questions typed into an ingredient's name, e.g.
// "Mustard Powder[please add as cross-reference]".
export function nameHasNotes(name: string): boolean {
  return /[[\]{}]|\?|\b(please|tbd|todo|fixme|check)\b/i.test(name);
}

// Recipe lines whose unit can't be turned into the ingredient's purchase unit.
// Those lines cost nothing and split on pull lists ("1.28 qt + 1.14 lb").
// Grouped by ingredient, with the units used that don't convert.
export type LineForUnits = { recipeId: string; recipeName: string; quantity: number; unit: string; item: IngredientMeasure & { id: string; name: string; unit: string } };
export type UnitProblem = { itemId: string; itemName: string; purchaseUnit: string; units: string[]; recipes: { id: string; name: string }[] };

export function unitProblems(lines: LineForUnits[]): UnitProblem[] {
  const byItem = new Map<string, UnitProblem>();
  for (const line of lines) {
    if (recipePurchaseQuantity(line.quantity || 1, line.unit, line.item) != null) continue;
    const problem = byItem.get(line.item.id) ?? { itemId: line.item.id, itemName: line.item.name, purchaseUnit: unitLabel(line.item.unit), units: [], recipes: [] };
    const label = unitLabel(line.unit) || "(blank)";
    if (!problem.units.includes(label)) problem.units.push(label);
    if (!problem.recipes.some(recipe => recipe.id === line.recipeId)) problem.recipes.push({ id: line.recipeId, name: line.recipeName });
    byItem.set(line.item.id, problem);
  }
  return [...byItem.values()].sort((a, b) => b.recipes.length - a.recipes.length || a.itemName.localeCompare(b.itemName));
}
