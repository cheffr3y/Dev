"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canConvert } from "@/lib/units";

// --- Banquet header -------------------------------------------------------

const banquetSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  venueId: z.string().min(1),
  date: z.string().min(1, "Date is required"),
  timeLabel: z.string().trim().optional(),
  guestCount: z.coerce.number().int().min(0).default(0),
  status: z.enum(["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  location: z.string().trim().optional(),
  areas: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  salesManager: z.string().trim().optional(),
  specialInstructions: z.string().trim().optional(),
  setupNotes: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function parseBanquet(formData: FormData) {
  const d = banquetSchema.parse({
    name: formData.get("name"),
    venueId: formData.get("venueId"),
    date: formData.get("date"),
    timeLabel: formData.get("timeLabel") || undefined,
    guestCount: formData.get("guestCount") || 0,
    status: formData.get("status") || "PLANNED",
    location: formData.get("location") || undefined,
    areas: formData.get("areas") || undefined,
    contactName: formData.get("contactName") || undefined,
    contactEmail: formData.get("contactEmail") || undefined,
    contactPhone: formData.get("contactPhone") || undefined,
    salesManager: formData.get("salesManager") || undefined,
    specialInstructions: formData.get("specialInstructions") || undefined,
    setupNotes: formData.get("setupNotes") || undefined,
    notes: formData.get("notes") || undefined,
  });
  return {
    name: d.name,
    venueId: d.venueId,
    date: new Date(d.date),
    timeLabel: d.timeLabel || null,
    guestCount: d.guestCount,
    status: d.status,
    location: d.location || null,
    areas: d.areas || null,
    contactName: d.contactName || null,
    contactEmail: d.contactEmail || null,
    contactPhone: d.contactPhone || null,
    salesManager: d.salesManager || null,
    specialInstructions: d.specialInstructions || null,
    setupNotes: d.setupNotes || null,
    notes: d.notes || null,
  };
}

export async function createBanquet(formData: FormData) {
  await requireRole("MANAGER");
  const banquet = await prisma.banquet.create({ data: parseBanquet(formData) });
  revalidatePath("/banquets");
  redirect(`/banquets/${banquet.id}`);
}

export async function updateBanquet(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.banquet.update({ where: { id }, data: parseBanquet(formData) });
  revalidatePath(`/banquets/${id}`);
}

export async function deleteBanquet(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.banquet.delete({ where: { id } });
  revalidatePath("/banquets");
  redirect("/banquets");
}

// --- Food lines -----------------------------------------------------------

const lineSchema = z.object({
  banquetId: z.string().min(1),
  recipeId: z.string().min(1, "Pick a recipe"),
  orderedQty: z.coerce.number().positive("Quantity must be greater than 0"),
  unit: z.string().trim().min(1).default("servings"),
  description: z.string().trim().optional(),
});

export async function addBanquetMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const d = lineSchema.parse({
    banquetId: formData.get("banquetId"),
    recipeId: formData.get("recipeId"),
    orderedQty: formData.get("orderedQty"),
    unit: formData.get("unit") || "servings",
    description: formData.get("description") || undefined,
  });

  const recipe = await prisma.recipe.findUnique({ where: { id: d.recipeId }, select: { yieldUnit: true } });
  if (!recipe) throw new Error("Recipe not found.");

  // The ordered unit must convert to the recipe's base (yield) unit — same
  // family (volume↔volume, weight↔weight); free-text units like "servings"
  // match themselves.
  if (!canConvert(d.unit, recipe.yieldUnit)) {
    throw new Error(
      `Can't order ${d.unit} of a recipe measured in ${recipe.yieldUnit}. Pick a matching unit (liquids in volume, dry goods by weight).`,
    );
  }

  await prisma.banquetMenuItem.create({
    data: {
      banquetId: d.banquetId,
      recipeId: d.recipeId,
      orderedQty: d.orderedQty,
      unit: d.unit,
      description: d.description || null,
    },
  });
  revalidatePath(`/banquets/${d.banquetId}`);
}

const editLineSchema = z.object({
  id: z.string().min(1),
  banquetId: z.string().min(1),
  orderedQty: z.coerce.number().positive(),
  description: z.string().trim().optional(),
});

export async function updateBanquetMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const d = editLineSchema.parse({
    id: formData.get("id"),
    banquetId: formData.get("banquetId"),
    orderedQty: formData.get("orderedQty"),
    description: formData.get("description") || undefined,
  });
  await prisma.banquetMenuItem.update({
    where: { id: d.id },
    data: { orderedQty: d.orderedQty, description: d.description || null },
  });
  revalidatePath(`/banquets/${d.banquetId}`);
}

export async function removeBanquetMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const banquetId = String(formData.get("banquetId"));
  await prisma.banquetMenuItem.delete({ where: { id } });
  revalidatePath(`/banquets/${banquetId}`);
}
