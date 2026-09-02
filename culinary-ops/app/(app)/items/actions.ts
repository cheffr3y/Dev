"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.string().trim().min(1).default("Other"),
  unit: z.string().trim().min(1).default("each"),
  packSize: z.string().trim().optional(),
  unitCost: z.coerce.number().min(0).default(0),
  sku: z.string().trim().optional(),
  gcode: z.string().trim().optional(),
  vendorId: z.string().trim().optional(),
});

function parse(formData: FormData) {
  const data = itemSchema.parse({
    name: formData.get("name"),
    category: formData.get("category") || "Other",
    unit: formData.get("unit") || "each",
    packSize: formData.get("packSize") || undefined,
    unitCost: formData.get("unitCost") || 0,
    sku: formData.get("sku") || undefined,
    gcode: formData.get("gcode") || undefined,
    vendorId: formData.get("vendorId") || undefined,
  });
  return {
    ...data,
    vendorId: data.vendorId || null,
    packSize: data.packSize || null,
    sku: data.sku || null,
    gcode: data.gcode || null,
  };
}

export async function createItem(formData: FormData) {
  await requireRole("MANAGER");
  const data = parse(formData);
  // Only treat it as "priced" when a real cost was entered.
  await prisma.item.create({
    data: { ...data, priceUpdatedAt: data.unitCost > 0 ? new Date() : null },
  });
  revalidatePath("/items");
}

export async function updateItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const data = parse(formData);
  // Stamp priceUpdatedAt only when the cost actually moved, so freshness
  // reflects the last re-quote — not an unrelated edit to name/vendor/etc.
  const existing = await prisma.item.findUnique({ where: { id }, select: { unitCost: true } });
  const priceChanged = existing != null && existing.unitCost !== data.unitCost;
  await prisma.item.update({
    where: { id },
    data: priceChanged ? { ...data, priceUpdatedAt: new Date() } : data,
  });
  revalidatePath("/items");
}

export async function deleteItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  // Block deletion if the item is referenced by a recipe.
  const used = await prisma.recipeItem.count({ where: { itemId: id } });
  if (used > 0) {
    throw new Error("Item is used in recipes — remove it from those first.");
  }
  await prisma.item.delete({ where: { id } });
  revalidatePath("/items");
}
