import { prisma } from "./prisma";
import { menuRecipeInclude } from "./menu-rollout-data";

export async function loadToGoRollup(id: string) {
  return Promise.all([
    prisma.toGoRollup.findUnique({ where: { id }, include: { venue: true, items: { orderBy: { sortOrder: "asc" } } } }),
    prisma.recipe.findMany({ include: menuRecipeInclude, orderBy: { name: "asc" } }),
  ]);
}
