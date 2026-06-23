"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireActiveUser } from "@/lib/session";
import { buildCostMap, type RecipeCostNode } from "@/lib/costing";
import { canConvert } from "@/lib/units";
import { formatLot, nextLotSeq, lineCostSnapshot, BACK_ENTRY_STATUSES } from "@/lib/prep";

// --- Order header ---------------------------------------------------------

const orderSchema = z.object({
  forDate: z.string().min(1, "Production date is required"),
  destinationVenueId: z.string().min(1, "Pick a destination venue"),
  notes: z.string().trim().optional(),
});

export async function createPrepOrder(formData: FormData) {
  // Confirm the session's account still exists before using its id as the
  // submittedBy foreign key — a stale JWT (e.g. after a DB reseed) would
  // otherwise fail with P2003 on PrepOrder_submittedByUserId_fkey.
  const user = await requireActiveUser("MANAGER");
  const d = orderSchema.parse({
    forDate: formData.get("forDate"),
    destinationVenueId: formData.get("destinationVenueId"),
    notes: formData.get("notes") || undefined,
  });
  const order = await prisma.prepOrder.create({
    data: {
      submittedByUserId: user.id,
      forDate: new Date(d.forDate),
      destinationVenueId: d.destinationVenueId,
      notes: d.notes || null,
    },
  });
  revalidatePath("/prep-orders");
  redirect(`/prep-orders/${order.id}`);
}

export async function updatePrepOrder(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const d = orderSchema.parse({
    forDate: formData.get("forDate"),
    destinationVenueId: formData.get("destinationVenueId"),
    notes: formData.get("notes") || undefined,
  });
  // The whole order ships to one venue, so changing it re-points every line.
  await prisma.$transaction([
    prisma.prepOrder.update({
      where: { id },
      data: { forDate: new Date(d.forDate), destinationVenueId: d.destinationVenueId, notes: d.notes || null },
    }),
    prisma.prepOrderLine.updateMany({
      where: { prepOrderId: id },
      data: { destinationVenueId: d.destinationVenueId },
    }),
  ]);
  revalidatePath(`/prep-orders/${id}`);
}

export async function deletePrepOrder(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.prepOrder.delete({ where: { id } });
  revalidatePath("/prep-orders");
  redirect("/prep-orders");
}

// --- Order lines ----------------------------------------------------------

const lineSchema = z.object({
  prepOrderId: z.string().min(1),
  recipeId: z.string().min(1, "Pick a recipe"),
  requestedQty: z.coerce.number().positive("Quantity must be greater than 0"),
  requestedUnit: z.string().trim().min(1).default("each"),
});

export async function addPrepLine(formData: FormData) {
  await requireRole("MANAGER");
  const d = lineSchema.parse({
    prepOrderId: formData.get("prepOrderId"),
    recipeId: formData.get("recipeId"),
    requestedQty: formData.get("requestedQty"),
    requestedUnit: formData.get("requestedUnit") || "each",
  });

  // Venue is set once on the order; every line inherits it.
  const order = await prisma.prepOrder.findUnique({
    where: { id: d.prepOrderId },
    select: { destinationVenueId: true },
  });
  if (!order) throw new Error("Prep order not found.");
  if (!order.destinationVenueId) {
    throw new Error("Set a destination venue for this order before adding recipes.");
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: d.recipeId },
    select: { yieldUnit: true, _count: { select: { changes: true } } },
  });
  if (!recipe) throw new Error("Recipe not found.");

  // The requested unit must be convertible from the recipe's base (yield) unit
  // — i.e. same measurement family (volume↔volume, weight↔weight).
  if (!canConvert(d.requestedUnit, recipe.yieldUnit)) {
    throw new Error(
      `Can't order ${d.requestedUnit} of a recipe measured in ${recipe.yieldUnit}. Pick a matching unit (liquids in volume, dry goods by weight).`,
    );
  }

  await prisma.prepOrderLine.create({
    data: {
      prepOrderId: d.prepOrderId,
      recipeId: d.recipeId,
      // Snapshot the recipe version (changelog depth, min 1) as printed.
      recipeVersion: Math.max(1, recipe._count.changes),
      destinationVenueId: order.destinationVenueId,
      requestedQty: d.requestedQty,
      requestedUnit: d.requestedUnit,
    },
  });
  revalidatePath(`/prep-orders/${d.prepOrderId}`);
}

const editLineSchema = z.object({
  id: z.string().min(1),
  prepOrderId: z.string().min(1),
  requestedQty: z.coerce.number().positive(),
  requestedUnit: z.string().trim().min(1),
});

export async function updatePrepLine(formData: FormData) {
  await requireRole("MANAGER");
  const d = editLineSchema.parse({
    id: formData.get("id"),
    prepOrderId: formData.get("prepOrderId"),
    requestedQty: formData.get("requestedQty"),
    requestedUnit: formData.get("requestedUnit"),
  });
  const line = await prisma.prepOrderLine.findUnique({
    where: { id: d.id },
    include: { recipe: { select: { yieldUnit: true } } },
  });
  // Only requested (un-printed) lines are editable — lots are frozen at print.
  if (!line || line.status !== "REQUESTED") {
    throw new Error("Only un-printed lines can be edited.");
  }
  // Keep the unit locked to the recipe's base measurement family.
  if (!canConvert(d.requestedUnit, line.recipe.yieldUnit)) {
    throw new Error(
      `Can't order ${d.requestedUnit} of a recipe measured in ${line.recipe.yieldUnit}. Pick a matching unit (liquids in volume, dry goods by weight).`,
    );
  }
  await prisma.prepOrderLine.update({
    where: { id: d.id },
    data: {
      requestedQty: d.requestedQty,
      requestedUnit: d.requestedUnit,
    },
  });
  revalidatePath(`/prep-orders/${d.prepOrderId}`);
}

export async function removePrepLine(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const prepOrderId = String(formData.get("prepOrderId"));
  const line = await prisma.prepOrderLine.findUnique({ where: { id } });
  if (line && line.status !== "REQUESTED") {
    throw new Error("Only un-printed lines can be removed.");
  }
  await prisma.prepOrderLine.delete({ where: { id } });
  revalidatePath(`/prep-orders/${prepOrderId}`);
}

// --- Print: assign lots, REQUESTED → PRINTED ------------------------------
//
// Lots are generated per recipe (one batch = one lot). Shared batches across
// venues are the same recipe, so their split lines share a lot. Reprints never
// regenerate — only REQUESTED lines without a lot are touched here.

export async function generatePacket(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));

  const order = await prisma.prepOrder.findUnique({
    where: { id },
    include: { lines: { include: { recipe: { select: { prodCode: true } } } } },
  });
  if (!order) throw new Error("Prep order not found.");

  const toPrint = order.lines.filter((l) => l.status === "REQUESTED" && !l.lot);

  // Group un-printed lines by recipe — each group is one batch / one lot.
  const byRecipe = new Map<string, typeof toPrint>();
  for (const line of toPrint) {
    const arr = byRecipe.get(line.recipeId) ?? [];
    arr.push(line);
    byRecipe.set(line.recipeId, arr);
  }

  for (const [recipeId, lines] of byRecipe) {
    const prodCode = lines[0].recipe.prodCode;
    // Look across all lines (any order) for lots already used this date+recipe.
    const existing = await prisma.prepOrderLine.findMany({
      where: { recipeId, lot: { not: null } },
      select: { lot: true },
    });
    const seq = nextLotSeq(
      existing.map((e) => e.lot!).filter(Boolean),
      order.forDate,
      prodCode,
    );
    const lot = formatLot(order.forDate, prodCode, seq);
    await prisma.prepOrderLine.updateMany({
      where: { id: { in: lines.map((l) => l.id) } },
      data: { status: "PRINTED", lot, lotPrintedAt: new Date() },
    });
  }

  revalidatePath(`/prep-orders/${id}`);
  redirect(`/prep-orders/${id}/packet`);
}

// --- Back-entry: capture actuals, freeze cost -----------------------------

export async function saveBackEntry(formData: FormData) {
  // enteredByUserId (and the madeBy default) come from the session id; guard
  // against a stale JWT so back-entry can't fail on a user foreign key.
  const user = await requireActiveUser();
  const prepOrderId = String(formData.get("prepOrderId"));

  const order = await prisma.prepOrder.findUnique({
    where: { id: prepOrderId },
    include: { lines: true },
  });
  if (!order) throw new Error("Prep order not found.");

  // Cost map across all recipes (ingredients + sub-recipes) at this moment.
  const recipeNodes = await prisma.recipe.findMany({
    select: {
      id: true,
      yieldQty: true,
      yieldUnit: true,
      items: { select: { quantity: true, unit: true, item: { select: { unitCost: true, unit: true } } } },
      components: { select: { childId: true, quantity: true, unit: true } },
    },
  });
  const costMap = buildCostMap(recipeNodes as RecipeCostNode[]);
  const yieldById = new Map(recipeNodes.map((r) => [r.id, { qty: r.yieldQty, unit: r.yieldUnit }]));

  const statusSet = new Set<string>(BACK_ENTRY_STATUSES);
  const now = new Date();

  for (const line of order.lines) {
    // Only resolve lines that have been printed (or already resolved/re-edited).
    if (line.status === "REQUESTED") continue;

    const status = String(formData.get(`status_${line.id}`) ?? "");
    if (!statusSet.has(status)) continue; // row left untouched

    const notes = (String(formData.get(`notes_${line.id}`) ?? "").trim()) || null;
    const madeByUserId = (String(formData.get(`madeBy_${line.id}`) ?? "")) || null;

    if (status === "NOT_MADE") {
      await prisma.prepOrderLine.update({
        where: { id: line.id },
        data: {
          status: "NOT_MADE",
          actualQty: null,
          actualUnit: null,
          madeByUserId,
          madeAt: order.forDate,
          enteredByUserId: user.id,
          enteredAt: now,
          unitCostSnapshot: null,
          allocatedCost: null,
          notes,
        },
      });
      continue;
    }

    const actualQty = Number(formData.get(`actualQty_${line.id}`));
    const actualUnit = String(formData.get(`actualUnit_${line.id}`) || line.requestedUnit);
    if (!Number.isFinite(actualQty) || actualQty <= 0) {
      throw new Error("Actual quantity must be greater than 0 for made / short lines.");
    }

    const yld = yieldById.get(line.recipeId);
    const snap = lineCostSnapshot({
      recipeTotalCost: costMap.get(line.recipeId) ?? 0,
      yieldQty: yld?.qty ?? 1,
      yieldUnit: yld?.unit ?? actualUnit,
      qty: actualQty,
      unit: actualUnit,
    });

    await prisma.prepOrderLine.update({
      where: { id: line.id },
      data: {
        status: status as "MADE" | "SHORT",
        actualQty,
        actualUnit,
        madeByUserId,
        madeAt: order.forDate,
        enteredByUserId: user.id,
        enteredAt: now,
        unitCostSnapshot: snap.unitCostSnapshot,
        allocatedCost: snap.allocatedCost,
        notes,
      },
    });
  }

  revalidatePath(`/prep-orders/${prepOrderId}`);
  redirect(`/prep-orders/${prepOrderId}`);
}
