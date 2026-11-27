"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { parseDiet } from "@/lib/recipes/diet";

const schema = z.object({ id: z.string().min(1).max(100), diet: z.string().max(20) });

// Quick review from the Needs attention list: set the diet tag and record that
// the label was checked today. Allergen tags are edited on the ingredient page.
export async function reviewIngredientLabel(formData: FormData) {
  await requireActiveUser("MANAGER");
  const { id, diet } = schema.parse({ id: formData.get("id"), diet: formData.get("diet") ?? "" });
  await prisma.item.update({ where: { id }, data: { diet: parseDiet(diet), allergenReviewedAt: new Date() } });
  revalidatePath("/items/attention");
  revalidatePath("/", "layout");
}
