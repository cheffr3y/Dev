"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { aggregateSetup, readSetup, resolveSetup, retainPacking, setupSchema } from "@/lib/banquets/banquet-setup";
import { lockBaselineForUser } from "@/lib/banquets/banquet-baseline-data";

const targetSchema = z.object({ id: z.string().min(1), revision: z.number().int().min(0) });
const stale = "This setup changed in another session. Reload the page before making more changes.";
function refresh(id: string) {
  revalidatePath(`/banquets/${id}`);
  revalidatePath(`/banquets/${id}/setup`);
  revalidatePath(`/banquets/${id}/packet`);
  revalidatePath("/banquets/week/[date]/packet", "page");
}
export async function lockBanquetBaseline(id: string, expected: string) {
  const user = await requireActiveUser("MANAGER");
  z.string().min(1).max(150).parse(id);
  z.string().max(500000).parse(expected);
  const result = await lockBaselineForUser(user.id, id, expected);
  refresh(id);
  return result;
}
export async function saveBanquetSetup(id: string, revision: number, input: unknown) {
  await requireActiveUser("MANAGER");
  const target = targetSchema.parse({ id, revision });
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the setup entries." };
  const banquet = await prisma.banquet.findUnique({
    where: { id: target.id }, include: { menuItems: { include: { recipe: { select: { name: true } } } } },
  });
  if (!banquet || banquet.setupRevision !== revision) return { error: stale };
  const menu = banquet.menuItems.map(m => ({ id: m.id, name: m.recipe.name, orderedQty: m.orderedQty, unit: m.unit }));
  if (parsed.data.stations.some(s => s.items.some(i => i.menuItemId && !menu.some(m => m.id === i.menuItemId)))) {
    return { error: "A linked food line is no longer on this banquet. Select a current line or make it a manual item." };
  }
  const plan = retainPacking(resolveSetup(parsed.data, menu), readSetup(banquet.setupPlan));
  const updated = await prisma.banquet.updateMany({
    where: { id, setupRevision: revision },
    data: { setupPlan: plan, setupRevision: { increment: 1 } },
  });
  if (!updated.count) return { error: stale };
  refresh(id);
  return { plan, revision: revision + 1 };
}
export async function setBanquetPullPacked(id: string, revision: number, key: string, checked: boolean) {
  await requireActiveUser();
  targetSchema.parse({ id, revision });
  z.string().min(1).max(250).parse(key);
  z.boolean().parse(checked);
  const banquet = await prisma.banquet.findUnique({ where: { id } });
  if (!banquet || banquet.setupRevision !== revision) return { error: stale };
  const plan = readSetup(banquet.setupPlan);
  const pull = aggregateSetup(plan).find(p => p.key === key);
  if (!pull) return { error: "That pull item is no longer in the saved setup." };
  if (checked) plan.packed[key] = pull.signature;
  else delete plan.packed[key];
  const updated = await prisma.banquet.updateMany({
    where: { id, setupRevision: revision },
    data: { setupPlan: plan, setupRevision: { increment: 1 } },
  });
  if (!updated.count) return { error: stale };
  refresh(id);
  return { plan, revision: revision + 1 };
}
