"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { parseDiet } from "@/lib/recipes/diet";

const reviewSchema = z.object({ id: z.string().min(1).max(100), diet: z.string().max(20) });

// Quick review from the Cleanup list: set the diet tag and record that the
// label was checked today. Allergen tags are edited on the ingredient page.
export async function reviewIngredientLabel(formData: FormData) {
  await requireActiveUser("MANAGER");
  const { id, diet } = reviewSchema.parse({ id: formData.get("id"), diet: formData.get("diet") ?? "" });
  await prisma.item.update({ where: { id }, data: { diet: parseDiet(diet), allergenReviewedAt: new Date() } });
  revalidatePath("/cleanup");
  revalidatePath("/", "layout");
}

const categorySchema = z.object({ from: z.string().trim().min(1).max(100), to: z.string().trim().min(1).max(100) });

// Move every ingredient in one category into another ("Spices" → "Spices &
// Seasonings"). Only ingredients that are in `from` right now are moved.
export async function moveIngredientCategory(formData: FormData) {
  await requireActiveUser("MANAGER");
  const { from, to } = categorySchema.parse({ from: formData.get("from"), to: formData.get("to") });
  if (from === to) redirect("/cleanup#duplicates");
  const { count } = await prisma.item.updateMany({ where: { category: from }, data: { category: to } });
  revalidatePath("/", "layout");
  redirect(`/cleanup?${new URLSearchParams({ moved: String(count), from, to })}#duplicates`);
}
