export type GroupableLine = {
  subRecipe?: boolean;
  category?: string | null;
  groupName?: string | null;
  sortOrder?: number;
};

const STAGES = [
  { label: "House Sub-Recipes", categories: [] },
  { label: "Produce & Botanicals", categories: ["Produce"] },
  { label: "Proteins & Seafood", categories: ["Protein", "Poultry", "Seafood"] },
  { label: "Dairy & Emulsion", categories: ["Dairy"] },
  { label: "Pantry, Acids & Lipids", categories: ["Oils & Vinegars", "Condiments & Sauces", "Canned & Jarred", "Grains & Pasta", "Dry Goods", "Bakery", "Baking"] },
  { label: "Seasonings & Aromatics", categories: ["Spices & Seasonings", "Other"] },
];

// Stable ties preserve the catalog/snapshot order. A custom group is ordered
// by its earliest row; unnamed ingredients remain an explicit group.
export function groupMiseLines<T extends GroupableLine>(lines: T[]) {
  const custom = lines.some(line => !line.subRecipe && line.groupName?.trim());
  const sorted = [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const grouped = new Map<string, T[]>();
  for (const line of sorted) {
    const stage = line.subRecipe ? 0 : STAGES.findIndex(s => s.categories.includes(line.category ?? "Other"));
    const key = line.subRecipe ? "House Sub-Recipes" : custom ? line.groupName?.trim() || "Ungrouped" : STAGES[stage > 0 ? stage : 5].label;
    const rows = grouped.get(key) ?? [];
    rows.push(line);
    grouped.set(key, rows);
  }
  const groups = [...grouped].map(([label, lines]) => ({ label, lines }));
  if (!custom) groups.sort((a, b) => STAGES.findIndex(s => s.label === a.label) - STAGES.findIndex(s => s.label === b.label));
  return groups;
}
