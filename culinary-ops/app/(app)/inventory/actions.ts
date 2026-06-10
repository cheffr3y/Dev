"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// All authenticated users can take inventory counts.

const addSchema = z.object({
  venueId: z.string().min(1),
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().min(0).default(0),
  par: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1).default("each"),
});

export async function addInventoryItem(formData: FormData) {
  await requireUser();
  const d = addSchema.parse({
    venueId: formData.get("venueId"),
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity") || 0,
    par: formData.get("par") || 0,
    unit: formData.get("unit") || "each",
  });
  await prisma.inventoryItem.upsert({
    where: { venueId_itemId: { venueId: d.venueId, itemId: d.itemId } },
    create: d,
    update: { quantity: d.quantity, par: d.par, unit: d.unit },
  });
  revalidatePath("/inventory");
}

const updateSchema = z.object({
  id: z.string().min(1),
  quantity: z.coerce.number().min(0),
  par: z.coerce.number().min(0),
});

export async function updateInventory(formData: FormData) {
  await requireUser();
  const d = updateSchema.parse({
    id: formData.get("id"),
    quantity: formData.get("quantity"),
    par: formData.get("par"),
  });
  await prisma.inventoryItem.update({
    where: { id: d.id },
    data: { quantity: d.quantity, par: d.par },
  });
  revalidatePath("/inventory");
}

export async function removeInventoryItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.inventoryItem.delete({ where: { id } });
  revalidatePath("/inventory");
}
