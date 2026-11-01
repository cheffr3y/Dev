import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const menuRecipeInclude = {
  items: { include: { item: { include: { vendor: true } } }, orderBy: [{ sortOrder: "asc" }, { item: { name: "asc" } }] },
  components: { include: { child: true }, orderBy: { child: { name: "asc" } } },
} satisfies Prisma.RecipeInclude;

export async function loadMenuRollout(id: string) {
  return Promise.all([
    prisma.menuRollout.findUnique({ where: { id }, include: { venue: true, items: { orderBy: { sortOrder: "asc" } } } }),
    prisma.recipe.findMany({ include: menuRecipeInclude, orderBy: { name: "asc" } }),
  ]);
}
