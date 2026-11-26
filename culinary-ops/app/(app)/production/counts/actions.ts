"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { planningRange } from "@/lib/production/production-planning";

// Counting and ordering are manager work, checked against the database role.

const startSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  undated: z.boolean(),
  sources: z.array(z.string().min(1).max(200)).min(1, "Select at least one event or job").max(1000),
});

export async function startPurchaseCount(formData: FormData) {
  const user = await requireActiveUser("MANAGER");
  const input = startSchema.parse({
    from: formData.get("from"),
    to: formData.get("to"),
    undated: formData.get("undated") === "1",
    sources: formData.getAll("source").map(String),
  });
  planningRange(input.from, input.to);
  const count = await prisma.purchaseCount.create({
    data: { fromDate: input.from, toDate: input.to, includeUndated: input.undated, sourceIds: [...new Set(input.sources)], createdById: user.id },
    select: { id: true },
  });
  redirect(`/production/counts/${count.id}`);
}

const saveSchema = z.object({
  countId: z.string().min(1).max(100),
  itemId: z.string().min(1).max(100),
  unit: z.string().trim().min(1).max(40),
  onHand: z.number().min(0).max(1_000_000).nullable(),
});

export type SaveOnHandResult = { ok: true } | { ok: false; error: string };

// Blank clears the count; a number saves it. Safe to retry.
export async function saveOnHand(input: { countId: string; itemId: string; unit: string; onHand: number | null }): Promise<SaveOnHandResult> {
  const user = await requireActiveUser("MANAGER");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That amount can't be saved. Use a number of 0 or more." };
  const { countId, itemId, unit, onHand } = parsed.data;
  const exists = await prisma.purchaseCount.findUnique({ where: { id: countId }, select: { id: true } });
  if (!exists) return { ok: false, error: "This count no longer exists. Start a new count from the purchasing list." };
  const where = { countId_itemId_unit: { countId, itemId, unit } };
  if (onHand == null) await prisma.purchaseCountLine.deleteMany({ where: { countId, itemId, unit } });
  else await prisma.purchaseCountLine.upsert({ where, create: { countId, itemId, unit, onHand, updatedById: user.id }, update: { onHand, updatedById: user.id } });
  return { ok: true };
}
