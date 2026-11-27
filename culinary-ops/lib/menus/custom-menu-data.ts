import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { banquetRecipeSelect } from "../banquets/banquet";
import { measurementSelect } from "../ingredients/measurements";
import { recipeTreeSelect } from "@/components/RecipeBuild";

// One recipe query that serves costing (banquet plan), allergen inheritance and
// the full scaled-recipe cards, so a packet never mixes two catalog snapshots.
export const customMenuRecipeSelect = {
  ...recipeTreeSelect,
  items: {
    ...recipeTreeSelect.items,
    select: {
      ...recipeTreeSelect.items.select,
      item: {
        select: { ...banquetRecipeSelect.items.select.item.select, ...recipeTreeSelect.items.select.item.select },
      },
    },
  },
} satisfies Prisma.RecipeSelect;

// A raw ingredient line carries everything costing, allergens and the pull
// list need.
export const customMenuRawItemSelect = {
  id: true, name: true, category: true, unit: true, unitCost: true, priceUpdatedAt: true, allergenReviewedAt: true, allergens: true, diet: true, ...measurementSelect,
} satisfies Prisma.ItemSelect;

export const customMenuLineInclude = { item: { select: customMenuRawItemSelect } } satisfies Prisma.CustomMenuItemInclude;

// Ingredients offered in the raw-ingredient picker.
export function loadCustomMenuIngredients() {
  return prisma.item.findMany({ select: { ...customMenuRawItemSelect, sku: true, gcode: true }, orderBy: { name: "asc" } });
}

export async function loadCustomMenu(id: string) {
  const menu = await prisma.customMenu.findUnique({
    where: { id },
    include: { venue: true, items: { include: customMenuLineInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!menu) return { menu: null, recipes: [] };
  // Nested sub-recipes can live anywhere in the catalog, so load the whole
  // tree (the same approach as festival and menu packets).
  const recipes = await prisma.recipe.findMany({ select: customMenuRecipeSelect, orderBy: { name: "asc" } });
  return { menu, recipes };
}
