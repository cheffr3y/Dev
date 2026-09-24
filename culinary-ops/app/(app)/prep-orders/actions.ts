"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveUser } from "@/lib/session";
import { businessDate } from "@/lib/prep-dates";
import { lockDay, serializable } from "@/lib/prep-workflow";
import { freezePacket } from "@/lib/prep-packets";
import { canConvert } from "@/lib/units";

async function editable(
  tx: Parameters<Parameters<typeof serializable>[0]>[0],
  id: string,
) {
  const order = await tx.prepOrder.findUniqueOrThrow({
    where: { id },
    include: { lines: true },
  });
  await lockDay(tx, order.forDate);
  if (
    order.lines.some((l) => l.status !== "REQUESTED") ||
    (await tx.prepPacketSnapshot.findUnique({ where: { scope: id } }))
  )
    throw new Error("Printed or completed requests are read-only.");
  return order;
}
export async function createPrepOrder(f: FormData) {
  const user = await requireActiveUser("MANAGER"),
    date = businessDate(String(f.get("forDate")));
  const venueId = z.string().min(1).parse(f.get("destinationVenueId"));
  const order = await serializable(async (tx) => {
    await lockDay(tx, date);
    return tx.prepOrder.create({
      data: {
        forDate: date,
        destinationVenueId: venueId,
        submittedByUserId: user.id,
        notes: String(f.get("notes") || "") || null,
      },
    });
  });
  revalidatePath("/prep-orders", "layout");
  redirect(`/prep-orders/${order.id}`);
}
export async function updatePrepOrder(f: FormData) {
  await requireActiveUser("MANAGER");
  const id = String(f.get("id")),
    date = businessDate(String(f.get("forDate"))),
    venueId = z.string().min(1).parse(f.get("destinationVenueId"));
  await serializable(async (tx) => {
    await editable(tx, id);
    await lockDay(tx, date);
    await tx.prepOrder.update({
      where: { id },
      data: {
        forDate: date,
        destinationVenueId: venueId,
        notes: String(f.get("notes") || "") || null,
      },
    });
    await tx.prepOrderLine.updateMany({
      where: { prepOrderId: id },
      data: { destinationVenueId: venueId },
    });
  });
  revalidatePath("/prep-orders", "layout");
}
export async function deletePrepOrder(f: FormData) {
  await requireActiveUser("MANAGER");
  const id = String(f.get("id"));
  await serializable(async (tx) => {
    await editable(tx, id);
    await tx.prepOrder.delete({ where: { id } });
  });
  revalidatePath("/prep-orders", "layout");
  redirect("/prep-orders/requests");
}
export async function addPrepLine(f: FormData) {
  await requireActiveUser("MANAGER");
  const id = String(f.get("prepOrderId"));
  const d = z
    .object({
      recipeId: z.string().min(1),
      requestedQty: z.coerce.number().finite().positive(),
      requestedUnit: z.string().min(1),
    })
    .parse(Object.fromEntries(f));
  await serializable(async (tx) => {
    const order = await editable(tx, id);
    if (!order.destinationVenueId)
      throw new Error("Choose a destination venue.");
    const recipe = await tx.recipe.findUniqueOrThrow({
      where: { id: d.recipeId },
    });
    if (!canConvert(d.requestedUnit, recipe.yieldUnit))
      throw new Error("Incompatible recipe units.");
    await tx.prepOrderLine.create({
      data: {
        ...d,
        prepOrderId: id,
        destinationVenueId: order.destinationVenueId,
        recipeVersion: recipe.version,
      },
    });
  });
  revalidatePath("/prep-orders", "layout");
}
export async function updatePrepLine(f: FormData) {
  await requireActiveUser("MANAGER");
  const id = String(f.get("id"));
  const quantity = z.coerce
      .number()
      .finite()
      .positive()
      .parse(f.get("requestedQty")),
    unit = z.string().min(1).parse(f.get("requestedUnit"));
  await serializable(async (tx) => {
    const line = await tx.prepOrderLine.findUniqueOrThrow({
      where: { id },
      include: { recipe: true },
    });
    await editable(tx, line.prepOrderId);
    if (!canConvert(unit, line.recipe.yieldUnit))
      throw new Error("Incompatible recipe units.");
    await tx.prepOrderLine.update({
      where: { id },
      data: { requestedQty: quantity, requestedUnit: unit },
    });
  });
  revalidatePath("/prep-orders", "layout");
}
export async function removePrepLine(f: FormData) {
  await requireActiveUser("MANAGER");
  const id = String(f.get("id"));
  await serializable(async (tx) => {
    const line = await tx.prepOrderLine.findUniqueOrThrow({ where: { id } });
    await editable(tx, line.prepOrderId);
    await tx.prepOrderLine.delete({ where: { id } });
  });
  revalidatePath("/prep-orders", "layout");
}
export async function generatePacket(f: FormData) {
  const user = await requireActiveUser("MANAGER");
  const result = await freezePacket(
    user.id,
    String(f.get("operationKey") || randomUUID()),
    { orderId: String(f.get("id")) },
  );
  revalidatePath("/prep-orders", "layout");
  redirect(`/prep-orders/${result.scope}/packet`);
}
export async function generateDailyPacket(f: FormData) {
  const user = await requireActiveUser("MANAGER");
  const result = await freezePacket(user.id, String(f.get("operationKey")), {
    date: String(f.get("date")),
  });
  revalidatePath("/prep-orders", "layout");
  redirect(`/prep-orders/${result.scope}/packet`);
}
