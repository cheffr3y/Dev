import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { businessDate } from "./prep-dates";
import { convertQty } from "./units";
import {
  captureCost,
  snapshot,
  readCost,
  completeCost,
  returnCredit,
  type CapturedRecipe,
  type CostSnapshot,
  type Charge,
} from "./prep-costing";

export type Tx = Prisma.TransactionClient;
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
const nonnegative = z.number().finite().min(0).max(1e8);
const dateSchema = z.string().refine((s) => {
  try {
    businessDate(s);
    return true;
  } catch {
    return false;
  }
}, "Invalid business date");
const supplySchema = z.object({
  itemId: z.string().min(1),
  quantity: nonnegative.positive(),
  unit: z.string().trim().min(1),
  venueId: z.string().min(1),
  note: z.string().trim().min(1),
  shared: z.boolean().default(false),
});
const labor = {
  productionOverride: nonnegative.nullish(),
  dishwasherMinutes: nonnegative.nullable(),
  productionRate: nonnegative.optional(),
  dishwasherRate: nonnegative.optional(),
};
const delivery = z.object({
  venueId: z.string().min(1),
  quantity: nonnegative,
  requestLineId: z.string().optional(),
  shortageNote: z.string().trim().optional(),
  supplies: z.array(supplySchema).max(100).default([]),
});
export const confirmationSchema = z.object({
  date: dateSchema,
  recipeId: z.string().min(1),
  quantity: nonnegative,
  unit: z.string().trim().min(1),
  cookName: z.string().trim().min(1),
  lot: z.string().trim().min(1).optional(),
  waste: nonnegative.default(0),
  wasteReason: z.string().trim().optional(),
  deliveries: z.array(delivery).max(200),
  productionSupplies: z
    .array(supplySchema.extend({ shared: z.literal(true) }))
    .max(100)
    .default([]),
  ...labor,
});
export const pickupSchema = z.object({
  date: dateSchema,
  recipeId: z.string().min(1),
  quantity: nonnegative.positive(),
  unit: z.string().trim().min(1),
  venueId: z.string().min(1),
  supplies: z.array(supplySchema).max(100).default([]),
  ...labor,
});
export const completionSchema = z.object({
  transferId: z.string().min(1),
  date: dateSchema,
  reason: z.string().trim().min(1),
  patch: z.object({
    prices: z.record(z.string(), nonnegative).optional(),
    gcodes: z.record(z.string(), z.string().trim().min(1)).optional(),
    conversions: z.record(z.string(), nonnegative.positive()).optional(),
    productionMinutes: nonnegative.optional(),
    dishwasherMinutes: nonnegative.optional(),
  }),
});
export const returnSchema = z.object({
  transferId: z.string().min(1),
  date: dateSchema,
  quantity: nonnegative.positive(),
  reason: z.string().trim().min(1),
});
export const correctionSchema = z.object({
  transferId: z.string().min(1),
  date: dateSchema,
  reason: z.string().trim().min(1),
  replacement: pickupSchema.extend({ quantity: nonnegative }),
});
export const closeSchema = z.object({ date: dateSchema });

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function lockDay(tx: Tx, date: Date, allowClosed = false) {
  await tx.prepBusinessDay.upsert({
    where: { date },
    create: { date, revision: 1 },
    update: { revision: { increment: 1 } },
  });
  const closed = await tx.productionCloseout.findUnique({
    where: { businessDate: date },
  });
  if (closed?.finalizedAt && !allowClosed)
    throw new Error("This day is closed. Use a linked amendment.");
}
export async function serializable<T>(
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 30000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 4
      ) {
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Concurrent update; retry using the same operation key.");
}
export async function operation<T>(
  authorId: string,
  key: string,
  kind: string,
  payload: unknown,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!/^[a-zA-Z0-9_-]{12,120}$/.test(key))
    throw new Error("A durable operation key is required.");
  const payloadHash = createHash("sha256")
    .update(canonical(payload))
    .digest("hex");
  return serializable(async (tx) => {
    const author = await tx.user.findUnique({
      where: { id: authorId },
      select: { role: true },
    });
    if (!author || !["ADMIN", "MANAGER"].includes(author.role))
      throw new Error("Manager authorization required.");
    const previous = await tx.prepOperation.findUnique({ where: { key } });
    if (previous) {
      if (
        previous.kind !== kind ||
        previous.payloadHash !== payloadHash ||
        previous.authorId !== authorId
      )
        throw new Error(
          "Operation key was already used with different contents.",
        );
      return previous.result as T;
    }
    const result = await work(tx);
    await tx.prepOperation.create({
      data: { key, kind, payloadHash, authorId, result: json(result) },
    });
    return result;
  });
}
// Load only the reachable graph, with explicit limits instead of a catalog-wide scan.
export async function loadCostRecipes(
  tx: Tx,
  root: string,
): Promise<CapturedRecipe[]> {
  const result: CapturedRecipe[] = [],
    seen = new Set<string>();
  let pending = [root];
  while (pending.length) {
    const ids = [...new Set(pending)].filter((id) => !seen.has(id));
    if (!ids.length) break;
    if (seen.size + ids.length > 500)
      throw new Error("Recipe graph exceeds 500 recipes.");
    const rows = await tx.recipe.findMany({
      where: { id: { in: ids } },
      include: { items: { include: { item: true } }, components: true },
      take: 501,
    });
    pending = [];
    for (const r of rows) {
      seen.add(r.id);
      result.push({
        ...r,
        items: r.items.map((i) => ({
          ...i,
          item: {
            ...i.item,
            unitCost: i.item.unitCost > 0 ? i.item.unitCost : null,
          },
        })),
      });
      pending.push(...r.components.map((c) => c.childId));
    }
    if (rows.length === 0) break;
  }
  return result;
}
function dollars(n: number | null) {
  return n == null ? null : n / 100;
}
export function chargeFields(s: CostSnapshot) {
  const c = s.charge,
    ratio =
      s.capture.weights[s.capture.share] /
      s.capture.weights.reduce((a, b) => a + b, 0);
  return {
    accountingState: c.total == null ? "PENDING" : "READY",
    costingSnapshot: json(s),
    foodCostBeforeExclusions: dollars(c.gross),
    excludedFoodCost: dollars(c.excluded),
    netFoodCost: dollars(c.net),
    productionLaborCost: dollars(c.production),
    dishwasherLaborCost: dollars(c.dishwasher),
    totalTransferCost: dollars(c.total),
    productionMinutes:
      s.capture.productionMinutes == null
        ? null
        : s.capture.productionMinutes * ratio,
    dishwasherMinutes:
      s.capture.dishwasherMinutes == null
        ? null
        : s.capture.dishwasherMinutes * ratio,
  };
}
async function validateSupplies(
  tx: Tx,
  venueId: string,
  supplies: z.infer<typeof supplySchema>[],
) {
  for (const s of supplies) {
    if (!s.shared && s.venueId !== venueId)
      throw new Error("A different source venue needs shared-supply review.");
    if (
      !(await tx.venue.findUnique({
        where: { id: s.venueId },
        select: { id: true },
      }))
    )
      throw new Error("Supplying venue not found.");
  }
}
export async function confirmProduction(
  authorId: string,
  key: string,
  input: unknown,
) {
  const d = confirmationSchema.parse(input);
  // Stable request ordering also breaks equal penny remainders deterministically.
  d.deliveries.sort((a, b) =>
    (a.requestLineId ?? a.venueId).localeCompare(b.requestLineId ?? b.venueId),
  );
  return operation(authorId, key, "CONFIRM", d, async (tx) => {
    const date = businessDate(d.date);
    await lockDay(tx, date);
    const ids = d.deliveries.flatMap((r) =>
      r.requestLineId ? [r.requestLineId] : [],
    );
    if (new Set(ids).size !== ids.length)
      throw new Error("A request line can only occur once.");
    const lines = await tx.prepOrderLine.findMany({
      where: { id: { in: ids } },
      include: { prepOrder: true },
    });
    if (lines.length !== ids.length) throw new Error("Request line not found.");
    await validateSupplies(tx, "", d.productionSupplies);
    if (d.quantity === 0 && d.productionSupplies.length)
      throw new Error(
        "Associate supplied ingredients with a production result greater than zero.",
      );
    let delivered = 0;
    for (const r of d.deliveries) {
      delivered += r.quantity;
      await validateSupplies(tx, r.venueId, r.supplies);
      const line = lines.find((l) => l.id === r.requestLineId);
      if (line) {
        if (
          line.recipeId !== d.recipeId ||
          line.destinationVenueId !== r.venueId ||
          line.prepOrder.forDate.getTime() !== date.getTime()
        )
          throw new Error(
            "Request recipe, venue and date must match this result.",
          );
        if (
          !["REQUESTED", "PRINTED", "IN_PROGRESS"].includes(line.status) ||
          line.productionBatchId
        )
          throw new Error("Completed historical requests are read-only.");
        const requested = convertQty(
          line.requestedQty,
          line.requestedUnit,
          d.unit,
        );
        if (requested == null)
          throw new Error("Request units do not match production units.");
        if (r.quantity < requested - 1e-8 && !r.shortageNote)
          throw new Error(
            "Each shortage needs a note; it will not carry forward.",
          );
      }
    }
    if (delivered + d.waste > d.quantity + 1e-8)
      throw new Error("Deliveries and production waste exceed actual output.");
    if (d.waste > 0 && !d.wasteReason)
      throw new Error("Production waste needs a reason.");
    if (d.quantity === 0 && lines.length === 0)
      throw new Error("Zero output needs an associated shortage request.");
    let batchId: string | null = null;
    const transfers: string[] = [];
    if (d.quantity > 0) {
      const recipes = await loadCostRecipes(tx, d.recipeId);
      const retained = Math.max(0, d.quantity - delivered - d.waste);
      // Waste is an explicit production disposition; it creates no venue charge.
      const weights = [
        ...d.deliveries.map((r) => r.quantity),
        retained,
        d.waste,
      ];
      const capture = captureCost({
        ...d,
        recipes,
        weights,
        share: d.deliveries.length,
        supplies: [],
        productionMinutes: null,
      });
      const printedLots = [
        ...new Set(lines.flatMap((l) => (l.lot ? [l.lot] : []))),
      ];
      if (printedLots.length > 1 && !d.lot)
        throw new Error(
          "Selected requests have different printed lots. Enter the actual production lot used by the cook.",
        );
      const actualLot =
        d.lot ??
        printedLots[0] ??
        `${d.date.replaceAll("-", "")}-${randomUUID().slice(0, 8)}`;
      if (
        await tx.productionBatch.findUnique({
          where: { lot: actualLot },
          select: { id: true },
        })
      )
        throw new Error(
          "This lot already has production. Enter a distinct lot for the additional production.",
        );
      const retainedSnapshot = {
        ...snapshot(capture),
        productionSupplies: d.productionSupplies,
      };
      const pool = snapshot({
        ...capture,
        weights: [d.quantity || 1],
        share: 0,
      });
      const batch = await tx.productionBatch.create({
        data: {
          recipeId: d.recipeId,
          lot: actualLot,
          producedOn: date,
          outputQty: d.quantity,
          outputUnit: d.unit,
          retainedQty: retained,
          productionWasteQty: d.waste,
          cookName: d.cookName,
          costingSnapshot: json(retainedSnapshot),
          foodCostSnapshot: dollars(pool.charge.gross),
          standardProductionMinutes:
            capture.productionSource === "STANDARD"
              ? capture.productionMinutes
              : null,
          actualProductionMinutes: capture.productionMinutes,
          productionMinutesSource: capture.productionSource,
          productionLaborRate: capture.productionRate,
          productionLaborCost: dollars(pool.charge.production),
          dishwasherMinutes: d.dishwasherMinutes,
          dishwasherLaborRate: capture.dishwasherRate,
          dishwasherLaborCost: dollars(pool.charge.dishwasher),
          dishwasherAllocationMethod: "ITEM_QUANTITY",
          enteredByUserId: authorId,
        },
      });
      batchId = batch.id;
      for (const [i, r] of d.deliveries.entries())
        if (r.quantity > 0) {
          const shared = [
            ...d.productionSupplies,
            ...d.deliveries.flatMap((row) =>
              row.supplies.filter((supply) => supply.shared),
            ),
          ];
          const s = snapshot({
            ...capture,
            share: i,
            supplies: [
              ...r.supplies.filter((supply) => !supply.shared),
              ...shared,
            ],
          });
          const transfer = await tx.stockTransfer.create({
            data: {
              batchId,
              recipeId: d.recipeId,
              requestLineId: r.requestLineId,
              venueId: r.venueId,
              transferDate: date,
              quantity: r.quantity,
              unit: d.unit,
              sourceType: "PLANNED",
              enteredByUserId: authorId,
              ...chargeFields(s),
            },
          });
          transfers.push(transfer.id);
        }
      if (d.waste > 0)
        await tx.finishedStockAdjustment.create({
          data: {
            batchId,
            recipeId: d.recipeId,
            date,
            type: "WASTE",
            quantity: -d.waste,
            unit: d.unit,
            reason: d.wasteReason!,
            enteredByUserId: authorId,
          },
        });
    }
    for (const line of lines) {
      const row = d.deliveries.find((r) => r.requestLineId === line.id)!;
      const qty = convertQty(row.quantity, d.unit, line.requestedUnit)!;
      await tx.prepOrderLine.update({
        where: { id: line.id },
        data: {
          status:
            qty === 0
              ? "NOT_MADE"
              : qty < line.requestedQty - 1e-8
                ? "SHORT"
                : "MADE",
          actualQty: row.quantity,
          actualUnit: d.unit,
          productionBatchId: batchId,
          madeAt: date,
          enteredAt: new Date(),
          enteredByUserId: authorId,
          notes: row.shortageNote || line.notes,
        },
      });
    }
    return { batchId, transfers };
  });
}
async function createPickup(
  tx: Tx,
  authorId: string,
  d: z.infer<typeof pickupSchema>,
  correctionOfId?: string,
) {
  await validateSupplies(tx, d.venueId, d.supplies);
  const capture = captureCost({
    ...d,
    ...(d.quantity === 0
      ? { productionOverride: 0, dishwasherMinutes: 0 }
      : {}),
    recipes: await loadCostRecipes(tx, d.recipeId),
    weights: [d.quantity || 1],
    share: 0,
    productionMinutes: null,
  });
  return tx.stockTransfer.create({
    data: {
      recipeId: d.recipeId,
      venueId: d.venueId,
      transferDate: businessDate(d.date),
      quantity: d.quantity,
      unit: d.unit,
      sourceType: correctionOfId ? "CORRECTION" : "STOCK_PICKUP",
      correctionOfId,
      enteredByUserId: authorId,
      notes: "Recipe estimate captured at entry",
      ...chargeFields(snapshot(capture)),
    },
  });
}
export async function recordPickup(
  authorId: string,
  key: string,
  input: unknown,
) {
  const d = pickupSchema.parse(input);
  return operation(authorId, key, "PICKUP", d, async (tx) => {
    await lockDay(tx, businessDate(d.date));
    const t = await createPickup(tx, authorId, d);
    return { transferId: t.id };
  });
}
export async function closeDay(authorId: string, key: string, input: unknown) {
  const d = closeSchema.parse(input);
  return operation(authorId, key, "CLOSE", d, async (tx) => {
    const date = businessDate(d.date);
    await lockDay(tx, date, true);
    const existing = await tx.productionCloseout.findUnique({
      where: { businessDate: date },
    });
    if (existing?.finalizedAt) return { closeoutId: existing.id };
    const open = await tx.prepOrderLine.count({
      where: {
        prepOrder: { forDate: date },
        status: { in: ["REQUESTED", "PRINTED", "IN_PROGRESS"] },
      },
    });
    if (open)
      throw new Error(
        "Enter results or a shortage note for every request before closing the day.",
      );
    const now = new Date();
    await tx.productionBatch.updateMany({
      where: { producedOn: date, finalizedAt: null },
      data: { finalizedAt: now, status: "FINALIZED" },
    });
    await tx.stockTransfer.updateMany({
      where: { transferDate: date, finalizedAt: null },
      data: { finalizedAt: now },
    });
    const closeout = await tx.productionCloseout.upsert({
      where: { businessDate: date },
      create: {
        businessDate: date,
        finalizedAt: now,
        finalizedByUserId: authorId,
      },
      update: { finalizedAt: now, finalizedByUserId: authorId },
    });
    return { closeoutId: closeout.id };
  });
}
export async function effectiveCost(tx: Tx, transferId: string) {
  const transfer = await tx.stockTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { amendments: { orderBy: { revision: "asc" } } },
  });
  const latest = transfer.amendments
    .filter((a) => a.kind === "COST_COMPLETION")
    .at(-1);
  const cost = readCost(latest?.costingSnapshot ?? transfer.costingSnapshot);
  return { transfer, cost };
}
export async function completeTransferCost(
  authorId: string,
  key: string,
  input: unknown,
) {
  const d = completionSchema.parse(input);
  return operation(authorId, key, "COMPLETE", d, async (tx) => {
    await lockDay(tx, businessDate(d.date), true);
    const { transfer, cost } = await effectiveCost(tx, d.transferId);
    if (businessDate(d.date) < transfer.transferDate)
      throw new Error("Completion date cannot precede delivery.");
    if (!cost) throw new Error("Legacy captured charges cannot be repriced.");
    if (
      transfer.amendments.some((a) => ["RETURN", "REVERSAL"].includes(a.kind))
    )
      throw new Error("A credited transfer cannot be cost-completed.");
    if (!cost.charge.issues.length)
      throw new Error("There is no missing cost information.");
    const completed = completeCost(cost, d.patch);
    if (canonical(cost) === canonical(completed))
      throw new Error("Supply at least one missing value.");
    const amendment = await tx.prepAmendment.create({
      data: {
        transferId: transfer.id,
        kind: "COST_COMPLETION",
        revision: transfer.amendments.length + 1,
        adjustmentDate: businessDate(d.date),
        reason: d.reason,
        authorId,
        costingSnapshot: json(completed),
      },
    });
    return { amendmentId: amendment.id };
  });
}
function legacyCharge(t: {
  foodCostBeforeExclusions: number | null;
  excludedFoodCost: number | null;
  netFoodCost: number | null;
  productionLaborCost: number | null;
  dishwasherLaborCost: number | null;
  totalTransferCost: number | null;
}): Charge {
  const cent = (n: number | null) => (n == null ? null : Math.round(n * 100));
  return {
    gross: cent(t.foodCostBeforeExclusions),
    excluded: cent(t.excludedFoodCost),
    net: cent(t.netFoodCost),
    production: cent(t.productionLaborCost),
    dishwasher: cent(t.dishwasherLaborCost),
    total: cent(t.totalTransferCost),
    issues: [],
    ingredients: [],
  };
}
export async function recordReturn(
  authorId: string,
  key: string,
  input: unknown,
) {
  const d = returnSchema.parse(input);
  return operation(authorId, key, "RETURN", d, async (tx) => {
    const date = businessDate(d.date);
    await lockDay(tx, date);
    const { transfer, cost } = await effectiveCost(tx, d.transferId);
    if (date < transfer.transferDate)
      throw new Error("Return date cannot precede delivery.");
    if (transfer.amendments.some((a) => a.kind === "REVERSAL"))
      throw new Error("This transfer has been reversed.");
    const returned = transfer.amendments
      .filter((a) => a.kind === "RETURN")
      .reduce((n, a) => n + (a.quantity ?? 0), 0);
    const credit = returnCredit(
      cost?.charge ?? legacyCharge(transfer),
      transfer.quantity,
      returned,
      d.quantity,
    );
    const amendment = await tx.prepAmendment.create({
      data: {
        transferId: transfer.id,
        kind: "RETURN",
        revision: transfer.amendments.length + 1,
        adjustmentDate: date,
        quantity: d.quantity,
        reason: d.reason,
        authorId,
        costingSnapshot: json({ charge: credit }),
      },
    });
    await tx.finishedStockAdjustment.create({
      data: {
        batchId: transfer.batchId,
        transferId: transfer.id,
        amendmentId: amendment.id,
        recipeId: transfer.recipeId,
        date,
        type: "WASTE",
        quantity: -d.quantity,
        unit: transfer.unit,
        reason: `Venue return: ${d.reason}`,
        enteredByUserId: authorId,
      },
    });
    return { amendmentId: amendment.id };
  });
}
export async function correctTransfer(
  authorId: string,
  key: string,
  input: unknown,
) {
  const d = correctionSchema.parse(input);
  if (d.replacement.date !== d.date)
    throw new Error("Replacement must use the adjustment date.");
  return operation(authorId, key, "CORRECTION", d, async (tx) => {
    const date = businessDate(d.date);
    await lockDay(tx, date);
    const { transfer, cost } = await effectiveCost(tx, d.transferId);
    if (date < transfer.transferDate)
      throw new Error("Correction date cannot precede delivery.");
    if (transfer.amendments.some((a) => a.kind === "REVERSAL"))
      throw new Error(
        "This transfer has already been reversed; correct its replacement instead.",
      );
    const charge = structuredClone(cost?.charge ?? legacyCharge(transfer));
    let returnedQuantity = 0;
    for (const amendment of transfer.amendments.filter(
      (a) => a.kind === "RETURN",
    )) {
      const credited = amendment.costingSnapshot as unknown as {
        charge: Charge;
      };
      returnedQuantity += amendment.quantity ?? 0;
      for (const field of [
        "gross",
        "excluded",
        "net",
        "production",
        "dishwasher",
        "total",
      ] as const) {
        if (charge[field] != null)
          charge[field] = Math.max(
            0,
            charge[field]! - (credited.charge[field] ?? 0),
          );
      }
    }
    charge.ingredients = [];
    const replacement = await createPickup(
      tx,
      authorId,
      d.replacement,
      transfer.id,
    );
    const amendment = await tx.prepAmendment.create({
      data: {
        transferId: transfer.id,
        kind: "REVERSAL",
        revision: transfer.amendments.length + 1,
        adjustmentDate: date,
        quantity: Math.max(0, transfer.quantity - returnedQuantity),
        reason: d.reason,
        authorId,
        costingSnapshot: json({ charge, replacementId: replacement.id }),
      },
    });
    return { amendmentId: amendment.id, replacementId: replacement.id };
  });
}
