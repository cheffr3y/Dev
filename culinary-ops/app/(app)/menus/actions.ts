"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/session";
import { ROLLOUT_STATUSES } from "@/lib/menu-rollout";

const optionalText = z.string().trim().max(5000).transform(value => value || null);
const headerSchema = z.object({
  name: z.string().trim().min(1).max(200), subtitle: optionalText,
  venueId: optionalText, targetFcp: z.coerce.number().positive().max(100),
  expectedCovers: z.coerce.number().int().min(0), notes: optionalText,
  status: z.enum(ROLLOUT_STATUSES),
});
const lineSchema = z.object({
  recipeId: z.string().min(1), section: z.string().trim().min(1).max(100),
  menuTitle: optionalText, menuDescription: optionalText,
  menuPrice: z.preprocess(value => value === "" ? null : value, z.coerce.number().min(0).nullable()),
  parBatches: z.coerce.number().min(0).max(100000), sortOrder: z.coerce.number().int().min(0),
});
export type MenuFormState = { error: string; saved: boolean };
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" · ");
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return "This recipe is already on the rollout. Edit its existing line.";
  return error instanceof Error ? error.message : "Could not save the menu rollout.";
}
function refresh(id: string) {
  revalidatePath("/");
  revalidatePath("/menus");
  revalidatePath(`/menus/${id}`);
  revalidatePath(`/menus/${id}/packet`);
}
export async function saveRollout(_previous: MenuFormState, form: FormData): Promise<MenuFormState> {
  await requireActiveUser("MANAGER");
  const id = String(form.get("id") || "");
  let savedId: string;
  try {
    const data = headerSchema.parse({ ...Object.fromEntries(form), status: form.get("status") || "DRAFT", notes: form.get("notes") || "", subtitle: form.get("subtitle") || "", venueId: form.get("venueId") || "" });
    const rollout = id ? await prisma.menuRollout.update({ where: { id }, data }) : await prisma.menuRollout.create({ data });
    savedId = rollout.id;
    refresh(savedId);
  } catch (error) { return { error: message(error), saved: false }; }
  if (!id) redirect(`/menus/${savedId}`);
  return { error: "", saved: true };
}
export async function saveRolloutItem(_previous: MenuFormState, form: FormData): Promise<MenuFormState> {
  await requireActiveUser("MANAGER");
  try {
    const rolloutId = z.string().min(1).parse(form.get("rolloutId"));
    const id = String(form.get("id") || "");
    const data = lineSchema.parse(Object.fromEntries(form));
    await prisma.$transaction(async tx => {
      // Bind the item to its actual rollout, rather than trusting a submitted id.
      if (id) {
        const existing = await tx.menuRolloutItem.findFirst({ where: { id, rolloutId } });
        if (!existing) throw new Error("This dish no longer belongs to the rollout. Refresh the page.");
        await tx.menuRolloutItem.update({ where: { id }, data });
      } else {
        await tx.menuRolloutItem.create({ data: { ...data, rolloutId } });
      }
      await tx.menuRollout.update({ where: { id: rolloutId }, data: { updatedAt: new Date() } });
    });
    refresh(rolloutId);
    return { error: "", saved: true };
  } catch (error) { return { error: message(error), saved: false }; }
}
export async function removeRolloutItem(form: FormData) {
  await requireActiveUser("MANAGER");
  const rolloutId = z.string().min(1).parse(form.get("rolloutId"));
  const id = z.string().min(1).parse(form.get("id"));
  await prisma.$transaction([
    prisma.menuRolloutItem.deleteMany({ where: { id, rolloutId } }),
    prisma.menuRollout.update({ where: { id: rolloutId }, data: { updatedAt: new Date() } }),
  ]);
  refresh(rolloutId);
}
