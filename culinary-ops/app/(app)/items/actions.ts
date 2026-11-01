"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, requireActiveUser } from "@/lib/auth/session";
import { parseIngredientForm } from "@/lib/ingredients/ingredient-fields";
import { replaceIngredientRecipes } from "@/lib/ingredients/ingredient-replacement";

export async function createItem(formData: FormData) {
  await requireRole("MANAGER");
  const data = parseIngredientForm(formData);
  // Only treat it as "priced" when a real cost was entered.
  await prisma.item.create({
    data: { ...data, priceUpdatedAt: data.unitCost > 0 ? new Date() : null },
  });
  revalidatePath("/", "layout");
}

export async function updateItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const data = parseIngredientForm(formData);
  // Stamp priceUpdatedAt only when the cost actually moved, so freshness
  // reflects the last re-quote — not an unrelated edit to name/vendor/etc.
  const existing = await prisma.item.findUnique({ where: { id }, select: { unitCost: true, unit: true } });
  const priceChanged = existing != null && (existing.unitCost !== data.unitCost || existing.unit !== data.unit);
  await prisma.item.update({
    where: { id },
    data: priceChanged ? { ...data, priceUpdatedAt: new Date() } : data,
  });
  revalidatePath("/", "layout");
}

export async function deleteItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  // Inventory/festival relations cascade on deletion, so verify every usage
  // within the same serializable transaction before removing an unused item.
  await prisma.$transaction(async tx => {
    const existing = await tx.item.findUniqueOrThrow({ where: { id }, include: { _count: { select: { recipeItems: true, inventoryItems: true, orderGuideLines: true, festivalOnHand: true, quotes: true } } } });
    if (Object.values(existing._count).some(count => count > 0)) throw new Error("Ingredient is still used. Review its usage and replace recipe references before deleting.");
    await tx.item.delete({ where: { id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/", "layout");
}

export async function applyIngredientReplacement(formData: FormData) {
  const user = await requireActiveUser("MANAGER");
  const sourceId = String(formData.get("source") ?? "");
  const targetId = String(formData.get("target") ?? "");
  let failure: string | null = null;
  try {
    await replaceIngredientRecipes(prisma, { sourceId, targetId, authorId: user.id,
      fingerprint: String(formData.get("fingerprint") ?? ""), removeSource: formData.get("removeSource") === "on" });
  } catch (error) { failure = error instanceof Error ? error.message : "Replacement failed. Review the comparison again."; }
  if (failure) redirect(`/items/merge?${new URLSearchParams({ source: sourceId, target: targetId, error: failure })}`);
  revalidatePath("/", "layout");
  redirect("/items/cleanup?done=1");
}
