"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const recipeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.string().trim().min(1).default("Other"),
  station: z.string().trim().optional(),
  yieldQty: z.coerce.number().positive().default(1),
  yieldUnit: z.string().trim().min(1).default("servings"),
  menuPrice: z.coerce.number().min(0).optional(),
  instructions: z.string().trim().optional(),
});

function parseRecipe(formData: FormData) {
  const d = recipeSchema.parse({
    name: formData.get("name"),
    category: formData.get("category") || "Other",
    station: formData.get("station") || undefined,
    yieldQty: formData.get("yieldQty") || 1,
    yieldUnit: formData.get("yieldUnit") || "servings",
    menuPrice: formData.get("menuPrice") || undefined,
    instructions: formData.get("instructions") || undefined,
  });
  return {
    name: d.name,
    category: d.category,
    station: d.station || null,
    yieldQty: d.yieldQty,
    yieldUnit: d.yieldUnit,
    menuPrice: d.menuPrice ?? null,
    instructions: d.instructions || null,
  };
}

export async function createRecipe(formData: FormData) {
  await requireRole("MANAGER");
  const recipe = await prisma.recipe.create({ data: parseRecipe(formData) });
  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`);
}

export async function updateRecipe(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.recipe.update({ where: { id }, data: parseRecipe(formData) });
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.recipe.delete({ where: { id } });
  revalidatePath("/recipes");
  redirect("/recipes");
}

const lineSchema = z.object({
  recipeId: z.string().min(1),
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1).default("each"),
});

export async function addRecipeItem(formData: FormData) {
  await requireRole("MANAGER");
  const d = lineSchema.parse({
    recipeId: formData.get("recipeId"),
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity") || 0,
    unit: formData.get("unit") || "each",
  });
  await prisma.recipeItem.upsert({
    where: { recipeId_itemId: { recipeId: d.recipeId, itemId: d.itemId } },
    create: d,
    update: { quantity: d.quantity, unit: d.unit },
  });
  revalidatePath(`/recipes/${d.recipeId}`);
}

export async function removeRecipeItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const recipeId = String(formData.get("recipeId"));
  await prisma.recipeItem.delete({ where: { id } });
  revalidatePath(`/recipes/${recipeId}`);
}
