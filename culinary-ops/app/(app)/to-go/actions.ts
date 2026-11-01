"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { toGoHeaderSchema, toGoLineSchema } from "@/lib/menus/to-go-validation";
import { THANKSGIVING_STARTER } from "@/lib/menus/to-go-starter";
import { hmrCopyData } from "@/lib/menus/hmr-copy";

export type ToGoFormState = { error: string; saved: boolean };
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" · ");
  return "Could not save this HMR rollout. Check that the rollout and selected recipe still exist, then try again.";
}
function refresh(id: string) {
  revalidatePath("/to-go");
  revalidatePath(`/to-go/${id}`);
  revalidatePath(`/to-go/${id}/packet`);
}
export async function saveToGoRollup(_previous: ToGoFormState, form: FormData): Promise<ToGoFormState> {
  await requireActiveUser("MANAGER");
  const id = String(form.get("id") || "");
  let savedId: string;
  try {
    const data = toGoHeaderSchema.parse(Object.fromEntries(form));
    if (id) savedId = (await prisma.toGoRollup.update({ where: { id }, data })).id;
    else {
      const starter = z.enum(["blank", "thanksgiving"]).parse(form.get("starter") || "blank");
      savedId = (await prisma.toGoRollup.create({ data: { ...data,
        items: { create: starter === "thanksgiving" ? THANKSGIVING_STARTER.map((line, sortOrder) => ({ ...line, sortOrder })) : [] },
      } })).id;
    }
    refresh(savedId);
  } catch (error) { return { error: message(error), saved: false }; }
  if (!id) redirect(`/to-go/${savedId}`);
  return { error: "", saved: true };
}
export async function saveToGoItem(_previous: ToGoFormState, form: FormData): Promise<ToGoFormState> {
  await requireActiveUser("MANAGER");
  try {
    const rollupId = z.string().min(1).parse(form.get("rollupId"));
    const id = String(form.get("id") || "");
    const data = toGoLineSchema.parse({ ...Object.fromEntries(form), section: form.get("section") || "Meals" });
    if (data.recipeQtyPerUnit == null) data.recipeAmountUnit = null;
    await prisma.$transaction(async tx => {
      if (id) {
        const existing = await tx.toGoRollupItem.findFirst({ where: { id, rollupId } });
        if (!existing) throw new Error("Item no longer belongs to this rollup.");
        await tx.toGoRollupItem.update({ where: { id }, data });
      } else await tx.toGoRollupItem.create({ data: { ...data, rollupId } });
      await tx.toGoRollup.update({ where: { id: rollupId }, data: { updatedAt: new Date() } });
    });
    refresh(rollupId);
    return { error: "", saved: true };
  } catch (error) { return { error: message(error), saved: false }; }
}
export async function copyHmrRollout(_previous: ToGoFormState, form: FormData): Promise<ToGoFormState> {
  await requireActiveUser("MANAGER");
  let savedId: string;
  try {
    const input = z.object({ sourceId: z.string().min(1), name: z.string().trim().min(1).max(200) }).parse(Object.fromEntries(form));
    const copy = await prisma.$transaction(async tx => {
      const source = await tx.toGoRollup.findUniqueOrThrow({ where: { id: input.sourceId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
      return tx.toGoRollup.create({ data: hmrCopyData(source, input.name) });
    }, { isolationLevel: "RepeatableRead" });
    savedId = copy.id;
    refresh(savedId);
  } catch (error) { return { error: message(error), saved: false }; }
  redirect(`/to-go/${savedId}`);
}
export async function removeToGoItem(form: FormData) {
  await requireActiveUser("MANAGER");
  const rollupId = z.string().min(1).parse(form.get("rollupId"));
  const id = z.string().min(1).parse(form.get("id"));
  await prisma.$transaction([
    prisma.toGoRollupItem.deleteMany({ where: { id, rollupId } }),
    prisma.toGoRollup.update({ where: { id: rollupId }, data: { updatedAt: new Date() } }),
  ]);
  refresh(rollupId);
}
