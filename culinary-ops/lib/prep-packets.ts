import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import {
  json,
  lockDay,
  operation,
  loadCostRecipes,
  type Tx,
} from "./prep-workflow";
import { businessDate } from "./prep-dates";
import { recipeTreeSelect } from "../components/RecipeBuild";
import { formatLot, nextLotSeq } from "./prep";

async function packetContents(
  tx: Tx,
  scope: string,
  date: Date,
  orderId?: string,
) {
  const lines = await tx.prepOrderLine.findMany({
    where: orderId
      ? { prepOrderId: orderId }
      : {
          prepOrder: { forDate: date },
          status: { in: ["REQUESTED", "PRINTED", "IN_PROGRESS"] },
        },
    include: {
      recipe: {
        select: {
          id: true,
          name: true,
          prodCode: true,
          yieldQty: true,
          yieldUnit: true,
          holdLifeDays: true,
          version: true,
        },
      },
      destinationVenue: { select: { name: true, code: true } },
    },
    orderBy: [{ recipeId: "asc" }, { id: "asc" }],
    take: 1001,
  });
  if (lines.length > 1000)
    throw new Error("Packet exceeds 1000 lines. Print separate requests.");
  const graphIds = new Set<string>();
  for (const recipeId of new Set(lines.map((l) => l.recipeId)))
    for (const r of await loadCostRecipes(tx, recipeId)) graphIds.add(r.id);
  if (graphIds.size > 500)
    throw new Error("Packet exceeds 500 recipes. Print separate requests.");
  for (const recipeId of new Set(lines.map((l) => l.recipeId))) {
    const group = lines.filter((l) => l.recipeId === recipeId && !l.lot);
    if (!group.length) continue;
    const existing = await tx.prepOrderLine.findMany({
      where: { recipeId, prepOrder: { forDate: date }, lot: { not: null } },
      select: { lot: true },
      take: 1001,
    });
    const lot = formatLot(
      date,
      group[0].recipe.prodCode,
      nextLotSeq(
        existing.map((l) => l.lot!),
        date,
        group[0].recipe.prodCode,
      ),
    );
    for (const line of group) {
      line.lot = lot;
      line.recipeVersion = line.recipe.version;
      line.status = "PRINTED";
    }
    await tx.prepOrderLine.updateMany({
      where: { id: { in: group.map((l) => l.id) } },
      data: {
        lot,
        lotPrintedAt: new Date(),
        status: "PRINTED",
        recipeVersion: group[0].recipe.version,
      },
    });
  }
  const allRecipes = await tx.recipe.findMany({
    where: { id: { in: [...graphIds] } },
    select: recipeTreeSelect,
    take: 501,
  });
  const shoppingRecipes = await tx.recipe.findMany({
    where: { id: { in: [...graphIds] } },
    select: {
      id: true,
      yieldQty: true,
      yieldUnit: true,
      items: {
        select: {
          quantity: true,
          unit: true,
          item: { select: { id: true, name: true, category: true } },
        },
      },
      components: { select: { childId: true, quantity: true, unit: true } },
    },
    take: 501,
  });
  return {
    order: { id: scope, forDate: date, lines },
    allRecipes,
    shoppingRecipes,
  };
}
export async function freezePacket(
  authorId: string,
  key: string,
  input: { orderId?: string; date?: string },
) {
  return operation(authorId, key, "PACKET", input, async (tx) => {
    const requestSet = input.orderId
      ? []
      : await tx.prepOrderLine.findMany({
          where: { prepOrder: { forDate: businessDate(input.date!) } },
          select: { id: true, requestedQty: true, requestedUnit: true },
          orderBy: { id: "asc" },
          take: 1001,
        });
    if (requestSet.length > 1000)
      throw new Error("Packet exceeds 1000 request lines.");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(requestSet))
      .digest("hex")
      .slice(0, 16);
    const scope = input.orderId ?? `day-${input.date}-${fingerprint}`;
    const existing = await tx.prepPacketSnapshot.findUnique({
      where: { scope },
    });
    if (existing) return { scope };
    const order = input.orderId
      ? await tx.prepOrder.findUniqueOrThrow({
          where: { id: input.orderId },
          include: { lines: { select: { status: true } } },
        })
      : null;
    if (
      order?.lines.some((l) => ["MADE", "SHORT", "NOT_MADE"].includes(l.status))
    )
      throw new Error(
        "Historical packet contents were not captured; today's recipe cannot replace them.",
      );
    const date = order?.forDate ?? businessDate(input.date!);
    await lockDay(tx, date);
    const contents = await packetContents(tx, scope, date, input.orderId);
    await tx.prepPacketSnapshot.create({
      data: { scope, authorId, contents: json(contents) },
    });
    return { scope };
  });
}
type PacketContents = Awaited<ReturnType<typeof packetContents>>;
export async function loadFrozenPacket(
  scope: string,
): Promise<PacketContents | null> {
  const row = await prisma.prepPacketSnapshot.findUnique({ where: { scope } });
  if (!row) return null;
  const data = row.contents as unknown as PacketContents;
  data.order.forDate = new Date(data.order.forDate);
  return data;
}
