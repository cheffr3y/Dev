import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { banquetRecipeSelect } from "../banquets/banquet";
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

export async function loadCustomMenu(id: string) {
  const menu = await prisma.customMenu.findUnique({
    where: { id },
    include: { venue: true, items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!menu) return { menu: null, recipes: [] };
  // Nested sub-recipes can live anywhere in the catalog, so load the whole
  // tree (the same approach as festival and menu packets).
  const recipes = await prisma.recipe.findMany({ select: customMenuRecipeSelect, orderBy: { name: "asc" } });
  return { menu, recipes };
}
