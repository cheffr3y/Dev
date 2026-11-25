// Custom Menus — costing for a one-off menu built for a single occasion.
//
// Each dish links to a saved recipe (a dish or a sub-recipe served on its own,
// such as a sauce). Its quantity is either:
//   • per guest — guestCount × portionQty, in portionUnit; or
//   • fixed     — totalQty in totalUnit, which replaces the per-guest amount.
// The quantity must convert to the recipe's yield unit. A quantity that does
// not convert (e.g. "6 oz" of a recipe yielded in quarts) is never guessed:
// the dish is left out of the totals, the shopping list and the recipe
// guide, and is reported for review.
//
// Costs reuse buildBanquetPlan so nested sub-recipes, yield conversions and
// the pull list match the rest of the app.

import { buildBanquetPlan, type BanquetLine, type BanquetRecipeRow } from "../banquets/banquet";
import { componentBatchFactor, priceGapNames } from "../recipes/costing";
import { convertQty, unitLabel } from "../recipes/units";
import type { ShoppingList } from "../purchasing/shopping";

export const CUSTOM_MENU_STATUSES = ["DRAFT", "CONFIRMED", "COMPLETE", "ARCHIVED"] as const;
export type CustomMenuStatus = (typeof CUSTOM_MENU_STATUSES)[number];

export const CUSTOM_MENU_SECTIONS = ["Passed", "Starters", "Mains", "Sides", "Sauces & Condiments", "Bread", "Dessert", "Beverages"];

export type CustomMenuHeader = {
  guestCount: number;
  pricePerGuest: number | null;
  targetFcp: number;
};

export type CustomMenuLine = {
  id: string;
  recipeId: string;
  section: string;
  menuTitle: string | null;
  menuDescription: string | null;
  portionQty: number | null;
  portionUnit: string | null;
  totalQty: number | null;
  totalUnit: string | null;
  sortOrder: number;
};

export type CustomMenuRecipe = BanquetRecipeRow & {
  name: string;
  items: Array<BanquetRecipeRow["items"][number]>;
};

export type QuantityMode = "fixed" | "per-guest";
export type LineIssue = "no-quantity" | "no-guests" | "unit-mismatch" | "no-yield" | "missing-recipe";

export type CustomMenuRow = CustomMenuLine & {
  title: string;
  recipeName: string;
  yieldQty: number;
  yieldUnit: string;
  mode: QuantityMode;
  qty: number; // total amount to produce, in `unit`
  unit: string;
  batches: number; // full recipe batches to make
  cost: number | null; // null when the amount can't be costed
  costPerGuest: number | null;
  issue: LineIssue | null;
};

export type CustomMenuSection = { name: string; rows: CustomMenuRow[] };

export type CustomMenuPlan = {
  rows: CustomMenuRow[];
  sections: CustomMenuSection[];
  totalCost: number;
  costPerGuest: number | null;
  revenue: number | null;
  fcp: number | null; // food cost % of revenue
  overTarget: boolean;
  costedRecipeIds: string[]; // dishes included in totals/guides
  shoppingList: ShoppingList;
  priceGaps: { unpriced: string[]; stale: string[] };
  issueCount: number;
};

export const ISSUE_TEXT: Record<LineIssue, string> = {
  "no-quantity": "Enter a portion per guest or a fixed total.",
  "no-guests": "Set the guest count, or give this dish a fixed total.",
  "unit-mismatch": "This amount doesn't convert to the recipe's yield unit. Use a matching unit.",
  "no-yield": "The recipe has no usable yield. Fix the recipe before costing.",
  "missing-recipe": "The linked recipe no longer exists.",
};

// The amount a line asks for, before checking it against the recipe.
export function lineQuantity(line: Pick<CustomMenuLine, "portionQty" | "portionUnit" | "totalQty" | "totalUnit">, guestCount: number, fallbackUnit: string) {
  if (line.totalQty != null && line.totalQty > 0) {
    return { mode: "fixed" as const, qty: line.totalQty, unit: line.totalUnit || fallbackUnit };
  }
  const portion = line.portionQty ?? 0;
  return { mode: "per-guest" as const, qty: Math.max(0, guestCount) * portion, unit: line.portionUnit || fallbackUnit };
}

function sortLines<T extends { sortOrder: number; id: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function buildCustomMenuPlan(
  menu: CustomMenuHeader,
  lines: CustomMenuLine[],
  recipes: CustomMenuRecipe[],
  now: Date = new Date(),
): CustomMenuPlan {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const guests = Math.max(0, menu.guestCount);

  const costable: Array<{ index: number; line: BanquetLine }> = [];
  const rows: CustomMenuRow[] = sortLines(lines).map((line, index) => {
    const recipe = byId.get(line.recipeId);
    const yieldUnit = recipe?.yieldUnit ?? "";
    const yieldQty = recipe?.yieldQty ?? 0;
    const { mode, qty, unit } = lineQuantity(line, guests, yieldUnit);
    let issue: LineIssue | null = null;
    if (!recipe) issue = "missing-recipe";
    else if (yieldQty <= 0) issue = "no-yield";
    else if (mode === "per-guest" && (line.portionQty ?? 0) <= 0) issue = "no-quantity";
    else if (mode === "per-guest" && guests <= 0) issue = "no-guests";
    else if (convertQty(qty, unit, yieldUnit) == null) issue = "unit-mismatch";

    const batches = issue ? 0 : componentBatchFactor(qty, unit, yieldQty, yieldUnit).batches;
    if (!issue && recipe) costable.push({ index, line: { recipeId: recipe.id, recipeName: recipe.name, orderedQty: qty, unit } });
    return {
      ...line,
      title: line.menuTitle || recipe?.name || "Missing recipe",
      recipeName: recipe?.name ?? "Missing recipe",
      yieldQty,
      yieldUnit,
      mode,
      qty,
      unit,
      batches,
      cost: null,
      costPerGuest: null,
      issue,
    };
  });

  const plan = buildBanquetPlan(costable.map((c) => c.line), recipes);
  costable.forEach((c, i) => {
    const cost = plan.lineCosts[i].cost;
    rows[c.index].cost = cost;
    rows[c.index].costPerGuest = guests > 0 ? cost / guests : null;
  });

  const sections: CustomMenuSection[] = [];
  for (const row of rows) {
    const name = row.section.trim() || "Main";
    let section = sections.find((s) => s.name === name);
    if (!section) sections.push((section = { name, rows: [] }));
    section.rows.push(row);
  }

  const totalCost = plan.totalCost;
  const revenue = menu.pricePerGuest != null && menu.pricePerGuest > 0 && guests > 0 ? menu.pricePerGuest * guests : null;
  const fcp = revenue ? (totalCost / revenue) * 100 : null;
  const costedRecipeIds = [...new Set(costable.map((c) => c.line.recipeId))];

  const nameByItemId = new Map<string, string>();
  for (const recipe of recipes) for (const { item } of recipe.items) nameByItemId.set(item.id, item.name);
  const priceGaps = priceGapNames(
    recipes.map((recipe) => ({
      id: recipe.id,
      items: recipe.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })),
      components: recipe.components,
    })),
    costedRecipeIds,
    nameByItemId,
    now,
  );

  return {
    rows,
    sections,
    totalCost,
    costPerGuest: guests > 0 ? totalCost / guests : null,
    revenue,
    fcp,
    overTarget: fcp != null && fcp > menu.targetFcp,
    costedRecipeIds,
    shoppingList: plan.shoppingList,
    priceGaps,
    issueCount: rows.filter((row) => row.issue).length,
  };
}

// "6 oz per guest × 120 = 720 oz" or "Fixed total: 2 gal".
export function describeQuantity(row: Pick<CustomMenuRow, "mode" | "portionQty" | "qty" | "unit">, guestCount: number, fmt: (n: number) => string): string {
  if (row.mode === "fixed") return `Fixed total: ${fmt(row.qty)} ${unitLabel(row.unit)}`;
  if (!row.portionQty) return "No portion set";
  return `${fmt(row.portionQty)} ${unitLabel(row.unit)} per guest × ${fmt(guestCount)} = ${fmt(row.qty)} ${unitLabel(row.unit)}`;
}

// Date-only values are stored at UTC midnight; render them in UTC so the
// calendar day never shifts with the server or viewer time zone.
export function formatMenuDate(date: Date | null, style: "long" | "short" = "long"): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-US", style === "long"
    ? { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
