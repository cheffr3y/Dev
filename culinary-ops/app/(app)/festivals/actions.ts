"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Percents cross this boundary as whole numbers ("35" in the form) and are
// stored as fractions 0–1 (0.35). See lib/festival.ts for the convention.
const wholePct = z.coerce
  .number()
  .min(0)
  .max(100)
  .transform((v) => v / 100);

// --- Festival header --------------------------------------------------------

const festivalSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  date: z.string().min(1, "Date is required"),
  venueId: z.string().trim().optional(),
  expectedAttendance: z.coerce.number().int().min(0).default(0),
  captureRate: wholePct.default(35),
  forecastConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  weatherNotes: z.string().trim().optional(),
  bufferPct: wholePct.default(10),
  status: z.enum(["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  notes: z.string().trim().optional(),
});

function parseFestival(formData: FormData) {
  const d = festivalSchema.parse({
    name: formData.get("name"),
    date: formData.get("date"),
    venueId: formData.get("venueId") || undefined,
    expectedAttendance: formData.get("expectedAttendance") || 0,
    captureRate: formData.get("captureRate") ?? undefined,
    forecastConfidence: formData.get("forecastConfidence") || "MEDIUM",
    weatherNotes: formData.get("weatherNotes") || undefined,
    bufferPct: formData.get("bufferPct") ?? undefined,
    status: formData.get("status") || "PLANNED",
    notes: formData.get("notes") || undefined,
  });
  return {
    name: d.name,
    date: new Date(d.date),
    venueId: d.venueId || null,
    expectedAttendance: d.expectedAttendance,
    captureRate: d.captureRate,
    forecastConfidence: d.forecastConfidence,
    weatherNotes: d.weatherNotes || null,
    bufferPct: d.bufferPct,
    status: d.status,
    notes: d.notes || null,
  };
}

export async function createFestival(formData: FormData) {
  await requireRole("MANAGER");
  const festival = await prisma.festival.create({ data: parseFestival(formData) });
  revalidatePath("/festivals");
  redirect(`/festivals/${festival.id}`);
}

export async function updateFestival(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.festival.update({ where: { id }, data: parseFestival(formData) });
  revalidatePath(`/festivals/${id}`);
}

export async function deleteFestival(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.festival.delete({ where: { id } });
  revalidatePath("/festivals");
  redirect("/festivals");
}

// --- Tents ------------------------------------------------------------------

export async function addTent(formData: FormData) {
  await requireRole("MANAGER");
  const d = z
    .object({ festivalId: z.string().min(1), name: z.string().trim().min(1, "Tent name is required") })
    .parse({ festivalId: formData.get("festivalId"), name: formData.get("name") });
  const last = await prisma.festivalTent.findFirst({
    where: { festivalId: d.festivalId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.festivalTent.create({
    data: { festivalId: d.festivalId, name: d.name, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  revalidatePath(`/festivals/${d.festivalId}`);
}

export async function updateTent(formData: FormData) {
  await requireRole("MANAGER");
  const d = z
    .object({ id: z.string().min(1), festivalId: z.string().min(1), name: z.string().trim().min(1) })
    .parse({ id: formData.get("id"), festivalId: formData.get("festivalId"), name: formData.get("name") });
  await prisma.festivalTent.update({ where: { id: d.id }, data: { name: d.name } });
  revalidatePath(`/festivals/${d.festivalId}`);
}

// Cascades: removing a tent deletes its menu lines. The UI carries the
// confirm copy; this just does the delete.
export async function removeTent(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const festivalId = String(formData.get("festivalId"));
  await prisma.festivalTent.delete({ where: { id } });
  revalidatePath(`/festivals/${festivalId}`);
}

// --- Menu items -------------------------------------------------------------

const addMenuItemSchema = z.object({
  festivalId: z.string().min(1),
  tentId: z.string().min(1),
  name: z.string().trim().min(1, "Item name is required"),
  price: z.coerce.number().min(0).default(0),
  mixPct: wholePct.default(0),
  recipeId: z.string().trim().optional(),
});

export async function addFestivalMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const d = addMenuItemSchema.parse({
    festivalId: formData.get("festivalId"),
    tentId: formData.get("tentId"),
    name: formData.get("name"),
    price: formData.get("price") || 0,
    mixPct: formData.get("mixPct") ?? undefined,
    recipeId: formData.get("recipeId") || undefined,
  });
  const last = await prisma.festivalMenuItem.findFirst({
    where: { tentId: d.tentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.festivalMenuItem.create({
    data: {
      festivalId: d.festivalId,
      tentId: d.tentId,
      name: d.name,
      price: d.price,
      mixPct: d.mixPct,
      recipeId: d.recipeId || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/festivals/${d.festivalId}/menu`);
}

// Any-subset field update for the worksheet's inline single-field forms. Only
// the fields present in the FormData are written; an empty string on the
// nullable overrides (chefOverride / bufferPctOverride) clears them → null.
export async function updateFestivalMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const festivalId = String(formData.get("festivalId"));
  const data: Record<string, unknown> = {};

  const name = formData.get("name");
  if (name != null) data.name = z.string().trim().min(1).parse(name);

  const price = formData.get("price");
  if (price != null) data.price = z.coerce.number().min(0).parse(price || 0);

  const mixPct = formData.get("mixPct");
  if (mixPct != null) data.mixPct = wholePct.parse(mixPct || 0);

  const chefOverride = formData.get("chefOverride");
  if (chefOverride != null) {
    data.chefOverride =
      String(chefOverride).trim() === "" ? null : z.coerce.number().min(0).parse(chefOverride);
  }

  const bufferPctOverride = formData.get("bufferPctOverride");
  if (bufferPctOverride != null) {
    data.bufferPctOverride =
      String(bufferPctOverride).trim() === "" ? null : wholePct.parse(bufferPctOverride);
  }

  const note = formData.get("note");
  if (note != null) data.note = String(note).trim() || null;

  await prisma.festivalMenuItem.update({ where: { id }, data });
  revalidatePath(`/festivals/${festivalId}/menu`);
}

export async function removeFestivalMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const festivalId = String(formData.get("festivalId"));
  await prisma.festivalMenuItem.delete({ where: { id } });
  revalidatePath(`/festivals/${festivalId}/menu`);
}

export async function linkRecipeToMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const d = z
    .object({ id: z.string().min(1), festivalId: z.string().min(1), recipeId: z.string().trim().optional() })
    .parse({ id: formData.get("id"), festivalId: formData.get("festivalId"), recipeId: formData.get("recipeId") || undefined });
  await prisma.festivalMenuItem.update({ where: { id: d.id }, data: { recipeId: d.recipeId || null } });
  revalidatePath(`/festivals/${d.festivalId}/menu`);
}

// --- Accounting assumptions -------------------------------------------------

const nonnegativeMoney = z.coerce.number().min(0).default(0);

export async function updateFestivalAccounting(formData: FormData) {
  await requireRole("MANAGER");
  const d = z
    .object({
      festivalId: z.string().min(1),
      laborHours: nonnegativeMoney,
      laborRate: nonnegativeMoney,
      boothFee: nonnegativeMoney,
      equipmentCost: nonnegativeMoney,
      disposablesCost: nonnegativeMoney,
      transportCost: nonnegativeMoney,
      otherCost: nonnegativeMoney,
      salesFeePct: wholePct,
      targetMarginPct: wholePct,
    })
    .parse({
      festivalId: formData.get("festivalId"),
      laborHours: formData.get("laborHours") || 0,
      laborRate: formData.get("laborRate") || 0,
      boothFee: formData.get("boothFee") || 0,
      equipmentCost: formData.get("equipmentCost") || 0,
      disposablesCost: formData.get("disposablesCost") || 0,
      transportCost: formData.get("transportCost") || 0,
      otherCost: formData.get("otherCost") || 0,
      salesFeePct: formData.get("salesFeePct") || 0,
      targetMarginPct: formData.get("targetMarginPct") || 0,
    });

  await prisma.festival.update({
    where: { id: d.festivalId },
    data: {
      laborHours: d.laborHours,
      laborRate: d.laborRate,
      boothFee: d.boothFee,
      equipmentCost: d.equipmentCost,
      disposablesCost: d.disposablesCost,
      transportCost: d.transportCost,
      otherCost: d.otherCost,
      salesFeePct: d.salesFeePct,
      targetMarginPct: d.targetMarginPct,
    },
  });
  revalidatePath(`/festivals/${d.festivalId}/accounting`);
}

// --- On-hand counts -----------------------------------------------------------

const onHandSchema = z.object({
  festivalId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1),
});

export async function upsertFestivalOnHand(formData: FormData) {
  await requireRole("MANAGER");
  const d = onHandSchema.parse({
    festivalId: formData.get("festivalId"),
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity") || 0,
    unit: formData.get("unit"),
  });
  await prisma.festivalOnHand.upsert({
    where: { festivalId_itemId: { festivalId: d.festivalId, itemId: d.itemId } },
    create: d,
    update: { quantity: d.quantity, unit: d.unit },
  });
  revalidatePath(`/festivals/${d.festivalId}/order-guide`);
}

// --- Item purchasing data (writes the shared Catalog) -------------------------

// Inline editor on order-guide rows missing pack/yield data. This updates the
// Item catalog itself — flagged in the UI — so the data benefits the whole app.
const purchasingSchema = z.object({
  itemId: z.string().min(1),
  festivalId: z.string().min(1),
  packQty: z.coerce.number().positive().optional(),
  packUnit: z.string().trim().optional(),
  yieldFactor: z.coerce.number().positive().max(1).default(1),
});

export async function updateItemPurchasing(formData: FormData) {
  await requireRole("MANAGER");
  const raw = {
    itemId: formData.get("itemId"),
    festivalId: formData.get("festivalId"),
    packQty: formData.get("packQty") || undefined,
    packUnit: formData.get("packUnit") || undefined,
    yieldFactor: formData.get("yieldFactor") || 1,
  };
  const d = purchasingSchema.parse(raw);
  await prisma.item.update({
    where: { id: d.itemId },
    data: {
      packQty: d.packQty ?? null,
      packUnit: d.packUnit || null,
      yieldFactor: d.yieldFactor,
    },
  });
  revalidatePath(`/festivals/${d.festivalId}/order-guide`);
  revalidatePath("/items");
}
