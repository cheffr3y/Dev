"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const guideSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  venueId: z.string().min(1),
  vendorId: z.string().trim().optional(),
});

export async function createOrderGuide(formData: FormData) {
  await requireRole("MANAGER");
  const d = guideSchema.parse({
    name: formData.get("name"),
    venueId: formData.get("venueId"),
    vendorId: formData.get("vendorId") || undefined,
  });
  const guide = await prisma.orderGuide.create({
    data: { name: d.name, venueId: d.venueId, vendorId: d.vendorId || null },
  });
  revalidatePath("/order-guides");
  redirect(`/order-guides/${guide.id}`);
}

export async function deleteOrderGuide(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.orderGuide.delete({ where: { id } });
  revalidatePath("/order-guides");
  redirect("/order-guides");
}

const lineSchema = z.object({
  orderGuideId: z.string().min(1),
  itemId: z.string().min(1, "Pick an item"),
  par: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1).default("each"),
});

export async function addOrderGuideLine(formData: FormData) {
  await requireRole("MANAGER");
  const d = lineSchema.parse({
    orderGuideId: formData.get("orderGuideId"),
    itemId: formData.get("itemId"),
    par: formData.get("par") || 0,
    unit: formData.get("unit") || "each",
  });
  await prisma.orderGuideLine.upsert({
    where: { orderGuideId_itemId: { orderGuideId: d.orderGuideId, itemId: d.itemId } },
    create: d,
    update: { par: d.par, unit: d.unit },
  });
  revalidatePath(`/order-guides/${d.orderGuideId}`);
}

export async function updateOrderGuideLine(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const orderGuideId = String(formData.get("orderGuideId"));
  const par = z.coerce.number().min(0).parse(formData.get("par"));
  await prisma.orderGuideLine.update({ where: { id }, data: { par } });
  revalidatePath(`/order-guides/${orderGuideId}`);
}

export async function removeOrderGuideLine(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const orderGuideId = String(formData.get("orderGuideId"));
  await prisma.orderGuideLine.delete({ where: { id } });
  revalidatePath(`/order-guides/${orderGuideId}`);
}
