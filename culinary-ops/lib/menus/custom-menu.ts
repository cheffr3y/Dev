// Custom Menus — costing for a one-off menu built for a single occasion.
//
// Each line links to a saved recipe (a dish or a sub-recipe served on its own,
// such as a sauce) or to a purchased raw ingredient (buns, chips, pickles).
// Its quantity is either:
//   • per guest — guestCount × portionQty, in portionUnit; or
//   • fixed     — totalQty in totalUnit, which replaces the per-guest amount.
// The quantity must convert to the recipe's yield unit (or, for a raw
// ingredient, to its purchase unit using the same pack/each/density rules as
// recipe costing). A quantity that does not convert is never guessed: the line
// is left out of the totals, the shopping list and the recipe guide, and is
// reported for review.
//
// Costs reuse buildBanquetPlan so nested sub-recipes, yield conversions and
// the pull list match the rest of the app. A raw ingredient line is costed as
// a one-ingredient virtual recipe yielding one of the requested unit.

import { buildBanquetPlan, type BanquetLine, type BanquetRecipeRow } from "../banquets/banquet";
import { componentBatchFactor, priceGapNames } from "../recipes/costing";
import { convertQty, unitLabel } from "../recipes/units";
import { ALLERGENS, effectiveAllergens, parseAllergens, type AllergenNode } from "../recipes/allergens";
import { effectiveDiet, parseDiet, type DietNode, type EffectiveDiet } from "../recipes/diet";
import { recipePurchaseQuantity, type IngredientMeasure } from "../ingredients/measurements";
import type { ShoppingList } from "../purchasing/shopping";

export const CUSTOM_MENU_STATUSES = ["DRAFT", "CONFIRMED", "COMPLETE", "ARCHIVED"] as const;
export type CustomMenuStatus = (typeof CUSTOM_MENU_STATUSES)[number];

export const CUSTOM_MENU_SECTIONS = ["Passed", "Starters", "Mains", "Sides", "Sauces & Condiments", "Bread", "Dessert", "Beverages"];

export type CustomMenuHeader = {
  guestCount: number;
  pricePerGuest: number | null;
  targetFcp: number;
};

export type CustomMenuRawItem = IngredientMeasure & {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  priceUpdatedAt: Date | null;
  diet?: string | null;
  allergens: string | null;
};

export type CustomMenuLine = {
  id: string;
  recipeId: string | null;
  itemId?: string | null;
  item?: CustomMenuRawItem | null;
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
export type LineIssue = "no-quantity" | "no-guests" | "unit-mismatch" | "no-yield" | "missing-recipe" | "missing-item" | "no-price-unit";

export type CustomMenuRow = CustomMenuLine & {
  kind: "recipe" | "item";
  title: string;
  recipeName: string; // recipe name, or ingredient name for a raw line
  itemAllergens: string[] | null; // raw lines only; recipe lines inherit through the recipe tree
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
  "missing-item": "The linked ingredient no longer exists.",
  "no-price-unit": "This amount doesn't convert to the ingredient's purchase unit. Use a matching unit or review its measurements.",
};

const RAW_PREFIX = "raw-item:";

// Units a raw ingredient can be portioned in, matching how recipe costing
// converts it (reviewed measurements unlock each/pack/density bridges).
export function rawItemUnits(item: IngredientMeasure & { unit: string }, candidates: string[]): string[] {
  return [...new Set([item.unit, item.eachLabel || "", ...candidates])].filter((unit) => unit && recipePurchaseQuantity(1, unit, item) != null);
}

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
  const virtualRecipes: CustomMenuRecipe[] = [];
  const rows: CustomMenuRow[] = sortLines(lines).map((line, index) => {
    if (line.recipeId == null) {
      // Raw ingredient: cost it as a virtual recipe that yields 1 of the unit.
      const item = line.item ?? null;
      const { mode, qty, unit } = lineQuantity(line, guests, item?.unit ?? "");
      let issue: LineIssue | null = null;
      if (!item) issue = "missing-item";
      else if (mode === "per-guest" && (line.portionQty ?? 0) <= 0) issue = "no-quantity";
      else if (mode === "per-guest" && guests <= 0) issue = "no-guests";
      else if (recipePurchaseQuantity(1, unit, item) == null) issue = "no-price-unit";
      if (!issue && item) {
        const id = `${RAW_PREFIX}${line.id}`;
        virtualRecipes.push({ id, name: item.name, yieldQty: 1, yieldUnit: unit, items: [{ quantity: 1, unit, item }], components: [] });
        costable.push({ index, line: { recipeId: id, recipeName: item.name, orderedQty: qty, unit } });
      }
      const keys = item ? new Set(parseAllergens(item.allergens)) : null;
      return {
        ...line, kind: "item" as const,
        title: line.menuTitle || item?.name || "Missing ingredient",
        recipeName: item?.name ?? "Missing ingredient",
        itemAllergens: keys ? ALLERGENS.filter((a) => keys.has(a.key)).map((a) => a.key) : null,
        yieldQty: 1, yieldUnit: unit, mode, qty, unit,
        batches: issue ? 0 : qty, cost: null, costPerGuest: null, issue,
      };
    }
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
      kind: "recipe" as const,
      title: line.menuTitle || recipe?.name || "Missing recipe",
      recipeName: recipe?.name ?? "Missing recipe",
      itemAllergens: null,
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

  const allRecipes = virtualRecipes.length ? [...recipes, ...virtualRecipes] : recipes;
  const plan = buildBanquetPlan(costable.map((c) => c.line), allRecipes);
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
  const costedIds = [...new Set(costable.map((c) => c.line.recipeId))];
  const costedRecipeIds = costedIds.filter((id) => !id.startsWith(RAW_PREFIX));

  const nameByItemId = new Map<string, string>();
  for (const recipe of allRecipes) for (const { item } of recipe.items) nameByItemId.set(item.id, item.name);
  const priceGaps = priceGapNames(
    allRecipes.map((recipe) => ({
      id: recipe.id,
      items: recipe.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })),
      components: recipe.components,
    })),
    costedIds,
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

// Recorded allergen keys for a line: a raw ingredient's own tags, or a
// recipe's tags inherited through its ingredients and sub-recipes. Null when
// the line has no linked source to read.
export function rowAllergenKeys(row: Pick<CustomMenuRow, "kind" | "recipeId" | "itemAllergens">, byId: Map<string, AllergenNode>): string[] | null {
  if (row.kind === "item") return row.itemAllergens;
  return row.recipeId && byId.has(row.recipeId) ? effectiveAllergens(row.recipeId, byId) : null;
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

// Every dish gets a line: a blank would read as "allergen-free" to a guest.
// No tags recorded is not the same as none present, so it says so.
export function allergenText(keys: string[] | null) {
  return keys?.length ? `Contains: ${keys.map((key) => ALLERGENS.find((a) => a.key === key)?.label ?? key).join(", ")}` : "Allergens not recorded — ask the kitchen";
}

// Vegan / vegetarian for a menu line: a raw item reads its own tag; a recipe
// rolls up through its ingredients and sub-recipes (or the chef's override).
export function rowDiet(row: Pick<CustomMenuRow, "kind" | "recipeId" | "item" | "recipeName">, byId: Map<string, DietNode>): EffectiveDiet {
  if (row.kind === "item") {
    const diet = parseDiet(row.item?.diet);
    return { diet, overridden: false, untagged: diet ? [] : [row.recipeName] };
  }
  return row.recipeId && byId.has(row.recipeId) ? effectiveDiet(row.recipeId, byId) : { diet: null, overridden: false, untagged: [] };
}
