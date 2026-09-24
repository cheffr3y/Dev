import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import {
  confirmProduction,
  recordPickup,
  closeDay,
  recordReturn,
  completeTransferCost,
  correctTransfer,
} from "./prep-workflow";
import { freezePacket, loadFrozenPacket } from "./prep-packets";
import {
  getPrepReport,
  exportSnapshot,
  reportCsv,
  reportSheets,
} from "./prep-accounting-report";
import { readCost } from "./prep-costing";
import { businessDate } from "./prep-dates";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (
  process.env.PREP_DISPOSABLE_DB !== "1" ||
  url.hostname !== "127.0.0.1" ||
  url.pathname !== "/prep_workflow_test"
)
  throw new Error(
    "Transaction tests require the disposable local test harness.",
  );
let manager: string,
  staff: string,
  venueA: string,
  venueB: string,
  recipeId: string,
  itemId: string;
const key = () => randomUUID();
const pickup = (date: string, extra: Record<string, unknown> = {}) => ({
  date,
  recipeId,
  quantity: 10,
  unit: "qt",
  venueId: venueA,
  dishwasherMinutes: 10,
  ...extra,
});
async function requests(date: string, amounts = [10, 12]) {
  return Promise.all(
    amounts.map(async (q, i) => {
      const o = await prisma.prepOrder.create({
        data: {
          forDate: businessDate(date),
          destinationVenueId: i === 0 ? venueA : venueB,
          submittedByUserId: manager,
        },
      });
      return prisma.prepOrderLine.create({
        data: {
          prepOrderId: o.id,
          recipeId,
          destinationVenueId: i === 0 ? venueA : venueB,
          requestedQty: q,
          requestedUnit: "qt",
        },
      });
    }),
  );
}
before(async () => {
  const u = await prisma.user.create({
    data: {
      name: "Manager",
      email: "manager@local.test",
      passwordHash: "unused",
      role: "MANAGER",
    },
  });
  manager = u.id;
  staff = (
    await prisma.user.create({
      data: {
        name: "Staff",
        email: "staff@local.test",
        passwordHash: "unused",
        role: "STAFF",
      },
    })
  ).id;
  venueA = (await prisma.venue.create({ data: { name: "Butcher", code: "B" } }))
    .id;
  venueB = (
    await prisma.venue.create({ data: { name: "Foxtown Brewing", code: "F" } })
  ).id;
  itemId = (
    await prisma.item.create({
      data: { name: "Cream", unit: "qt", unitCost: 2, gcode: "C" },
    })
  ).id;
  recipeId = (
    await prisma.recipe.create({
      data: {
        name: "Sauce",
        prodCode: "SCE",
        yieldQty: 22,
        yieldUnit: "qt",
        productionPersonMinutes: 60,
        instructions: "Original recipe instructions",
        items: { create: { itemId, quantity: 22, unit: "qt" } },
      },
    })
  ).id;
  await prisma.inventoryItem.create({
    data: { venueId: venueA, itemId, quantity: 123, unit: "qt" },
  });
});
after(async () => {
  await prisma.$disconnect();
});
test("concurrent confirmation returns one shared production and two linked deliveries", async () => {
  const date = "2026-09-01",
    lines = await requests(date);
  const input = {
    date,
    recipeId,
    quantity: 22,
    unit: "qt",
    cookName: "Cook",
    dishwasherMinutes: 10,
    deliveries: lines.map((l, i) => ({
      venueId: l.destinationVenueId,
      requestLineId: l.id,
      quantity: i === 0 ? 10 : 12,
    })),
  };
  const op = key();
  const results = await Promise.all([
    confirmProduction(manager, op, input),
    confirmProduction(manager, op, input),
  ]);
  assert.deepEqual(results[0], results[1]);
  const t = await prisma.stockTransfer.findMany({
    where: { batchId: results[0].batchId },
  });
  assert.equal(t.length, 2);
  assert.equal(
    t.reduce((n, t) => n + Math.round(t.totalTransferCost! * 100), 0),
    6767,
  );
  assert.ok(t.every((t) => t.requestLineId));
  await assert.rejects(
    confirmProduction(manager, op, { ...input, quantity: 23 }),
    /different contents/,
  );
});
test("retained output creates no transfer and shortages require notes and close requests", async () => {
  const date = "2026-09-02",
    [line] = await requests(date, [12]);
  const input = {
    date,
    recipeId,
    quantity: 22,
    unit: "qt",
    cookName: "Cook",
    dishwasherMinutes: 0,
    deliveries: [{ venueId: venueA, requestLineId: line.id, quantity: 10 }],
  };
  await assert.rejects(
    confirmProduction(manager, key(), input),
    /shortage needs a note/,
  );
  const r = await confirmProduction(manager, key(), {
    ...input,
    deliveries: [
      { ...input.deliveries[0], shortageNote: "Ingredient shortage" },
    ],
  });
  const batch = await prisma.productionBatch.findUniqueOrThrow({
    where: { id: r.batchId! },
    include: { transfers: true },
  });
  assert.equal(batch.retainedQty, 12);
  assert.equal(batch.transfers.length, 1);
  assert.equal(
    (await prisma.prepOrderLine.findUniqueOrThrow({ where: { id: line.id } }))
      .status,
    "SHORT",
  );
  await closeDay(manager, key(), { date });
  await assert.rejects(confirmProduction(manager, key(), input), /closed/);
});
test("cross-day pickups capture current estimates without batches or inventory changes; concurrent replays deduplicate", async () => {
  const batches = await prisma.productionBatch.count(),
    stock = await prisma.inventoryItem.findMany();
  const op = key(),
    input = pickup("2026-09-03");
  const [a, b] = await Promise.all([
    recordPickup(manager, op, input),
    recordPickup(manager, op, input),
  ]);
  assert.deepEqual(a, b);
  const first = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: a.transferId },
  });
  assert.equal(first.batchId, null);
  assert.equal(first.foodCostBeforeExclusions, 20);
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 3 } });
  const c = await recordPickup(manager, key(), pickup("2026-09-04"));
  assert.equal(
    (
      await prisma.stockTransfer.findUniqueOrThrow({
        where: { id: c.transferId },
      })
    ).foodCostBeforeExclusions,
    30,
  );
  assert.equal(
    (
      await prisma.stockTransfer.findUniqueOrThrow({
        where: { id: a.transferId },
      })
    ).foodCostBeforeExclusions,
    20,
  );
  assert.equal(await prisma.productionBatch.count(), batches);
  assert.deepEqual(await prisma.inventoryItem.findMany(), stock);
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 2 } });
});
test("missing information permits closeout; linked completion preserves original and captured values", async () => {
  const missing = await prisma.item.create({
    data: { name: "Unpriced", unit: "qt", unitCost: 0, gcode: null },
  });
  const r = await prisma.recipe.create({
    data: {
      name: "Pending recipe",
      prodCode: "PND",
      yieldQty: 1,
      yieldUnit: "qt",
      productionPersonMinutes: null,
      items: {
        create: [
          { itemId: missing.id, quantity: 1, unit: "qt" },
          { itemId, quantity: 1, unit: "qt" },
        ],
      },
    },
  });
  const p = await recordPickup(
    manager,
    key(),
    pickup("2026-09-05", {
      recipeId: r.id,
      quantity: 1,
      dishwasherMinutes: null,
    }),
  );
  const original = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: p.transferId },
  });
  assert.equal(original.totalTransferCost, null);
  const op = key();
  const [a, b] = await Promise.all([
    closeDay(manager, op, { date: "2026-09-05" }),
    closeDay(manager, op, { date: "2026-09-05" }),
  ]);
  assert.deepEqual(a, b);
  const report = await getPrepReport("2026-09-05", "2026-09-05");
  assert.equal(report.tables[0].rows.length, 0);
  assert.ok(report.tables[2].rows.length >= 4);
  const line = await prisma.recipeItem.findFirstOrThrow({
    where: { recipeId: r.id, itemId: missing.id },
  });
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 999 } });
  await completeTransferCost(manager, key(), {
    transferId: p.transferId,
    date: "2026-09-06",
    reason: "Price verified, no labor",
    patch: {
      prices: { [line.id]: 4 },
      gcodes: { [line.id]: "U" },
      productionMinutes: 0,
      dishwasherMinutes: 0,
    },
  });
  const latest = await prisma.prepAmendment.findFirstOrThrow({
    where: { transferId: p.transferId },
  });
  assert.equal(readCost(latest.costingSnapshot)?.charge.total, 600);
  const unchanged = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: p.transferId },
  });
  assert.equal(unchanged.totalTransferCost, null);
  assert.deepEqual(unchanged.costingSnapshot, original.costingSnapshot);
  const late = await getPrepReport("2026-09-06", "2026-09-06");
  assert.equal(
    late.tables.find((t) => t.name === "Late Cost Completions")?.rows.length,
    1,
  );
  assert.equal(late.tables[0].rows.length, 0);
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 2 } });
});
test("confirmation serializes against closeout and cannot enter a closed day", async () => {
  const date = "2026-09-07",
    input = {
      date,
      recipeId,
      quantity: 22,
      unit: "qt",
      cookName: "Cook",
      dishwasherMinutes: 0,
      deliveries: [],
    };
  const outcomes = await Promise.allSettled([
    confirmProduction(manager, key(), input),
    closeDay(manager, key(), { date }),
  ]);
  assert.ok(outcomes.some((x) => x.status === "fulfilled"));
  const close = await prisma.productionCloseout.findUnique({
    where: { businessDate: businessDate(date) },
  });
  assert.ok(close?.finalizedAt);
  const batches = await prisma.productionBatch.findMany({
    where: { producedOn: businessDate(date) },
  });
  assert.ok(batches.every((b) => b.finalizedAt));
  await assert.rejects(recordPickup(manager, key(), pickup(date)), /closed/);
});
test("concurrent full returns create one credit/waste and cannot exceed quantity or money", async () => {
  const p = await recordPickup(
    manager,
    key(),
    pickup("2026-09-08", {
      supplies: [
        {
          itemId,
          quantity: 2,
          unit: "qt",
          venueId: venueA,
          note: "Venue cream",
          shared: false,
        },
      ],
    }),
  );
  await closeDay(manager, key(), { date: "2026-09-08" });
  const original = await prisma.stockTransfer.findUniqueOrThrow({
      where: { id: p.transferId },
    }),
    op = key(),
    input = {
      transferId: p.transferId,
      date: "2026-09-09",
      quantity: 10,
      reason: "Returned by venue",
    };
  const [a, b] = await Promise.all([
    recordReturn(manager, op, input),
    recordReturn(manager, op, input),
  ]);
  assert.deepEqual(a, b);
  assert.equal(
    await prisma.finishedStockAdjustment.count({
      where: { transferId: p.transferId },
    }),
    1,
  );
  const waste = await prisma.finishedStockAdjustment.findFirstOrThrow({
    where: { transferId: p.transferId },
  });
  assert.equal(waste.quantity, -10);
  assert.equal(waste.type, "WASTE");
  const amendment = await prisma.prepAmendment.findUniqueOrThrow({
    where: { id: a.amendmentId },
  });
  assert.equal(
    (amendment.costingSnapshot as { charge: { total: number } }).charge.total,
    Math.round(original.totalTransferCost! * 100),
  );
  await assert.rejects(recordReturn(manager, key(), input), /exceed/);
  await closeDay(manager, key(), { date: "2026-09-09" });
  const report = await getPrepReport("2026-09-08", "2026-09-09");
  assert.equal(report.tables[0].rows[0][7], 0);
});
test("concurrent returns with different keys and dates cannot over-refund", async () => {
  const p = await recordPickup(manager, key(), pickup("2026-09-10"));
  const results = await Promise.allSettled([
    recordReturn(manager, key(), {
      transferId: p.transferId,
      date: "2026-09-11",
      quantity: 6,
      reason: "One",
    }),
    recordReturn(manager, key(), {
      transferId: p.transferId,
      date: "2026-09-12",
      quantity: 6,
      reason: "Two",
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const returned = await prisma.prepAmendment.findMany({
    where: { transferId: p.transferId, kind: "RETURN" },
  });
  assert.equal(returned.length, 1);
});
test("closed corrections reverse and replace without rewriting originals", async () => {
  const p = await recordPickup(manager, key(), pickup("2026-09-13"));
  await closeDay(manager, key(), { date: "2026-09-13" });
  const original = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: p.transferId },
  });
  const c = await correctTransfer(manager, key(), {
    transferId: p.transferId,
    date: "2026-09-14",
    reason: "Wrong venue and quantity",
    replacement: pickup("2026-09-14", { venueId: venueB, quantity: 8 }),
  });
  assert.deepEqual(
    await prisma.stockTransfer.findUniqueOrThrow({
      where: { id: p.transferId },
    }),
    original,
  );
  const replacement = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: c.replacementId },
  });
  assert.equal(replacement.correctionOfId, p.transferId);
  assert.equal(replacement.venueId, venueB);
  assert.equal(replacement.quantity, 8);
  await assert.rejects(
    correctTransfer(manager, key(), {
      transferId: p.transferId,
      date: "2026-09-14",
      reason: "Again",
      replacement: pickup("2026-09-14"),
    }),
    /already been reversed/,
  );
});
test("frozen packets preserve nested recipe contents and separate requests across catalog edits", async () => {
  const date = "2026-09-15",
    lines = await requests(date);
  const frozen = await freezePacket(manager, key(), { date });
  const before = await loadFrozenPacket(frozen.scope);
  assert.equal(before?.order.lines.length, 2);
  assert.notEqual(before?.order.lines[0].id, before?.order.lines[1].id);
  assert.equal(before?.order.lines[0].lot, before?.order.lines[1].lot);
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { instructions: "New instructions", version: 2 },
  });
  assert.deepEqual(await loadFrozenPacket(frozen.scope), before);
  assert.deepEqual(await freezePacket(manager, key(), { date }), frozen);
  assert.equal(
    await prisma.prepOrderLine.count({
      where: { id: { in: lines.map((l) => l.id) }, status: "PRINTED" },
    }),
    2,
  );
});
test("legacy completed requests stay separate, existing batch transfers readable, exports immutable and consistent", async () => {
  const [line] = await requests("2026-09-16", [2]);
  await prisma.prepOrderLine.update({
    where: { id: line.id },
    data: {
      status: "MADE",
      actualQty: 2,
      actualUnit: "qt",
      allocatedCost: 4,
      enteredAt: new Date(),
    },
  });
  await assert.rejects(
    confirmProduction(manager, key(), {
      date: "2026-09-16",
      recipeId,
      quantity: 2,
      unit: "qt",
      cookName: "Cook",
      dishwasherMinutes: 0,
      deliveries: [{ requestLineId: line.id, venueId: venueA, quantity: 2 }],
    }),
    /read-only/,
  );
  const batch = await prisma.productionBatch.create({
    data: {
      recipeId,
      lot: "LEGACY",
      producedOn: businessDate("2026-09-16"),
      outputQty: 10,
      outputUnit: "qt",
      enteredByUserId: manager,
    },
  });
  await prisma.stockTransfer.create({
    data: {
      batchId: batch.id,
      venueId: venueA,
      quantity: 2,
      unit: "qt",
      sourceType: "PLANNED",
      transferDate: businessDate("2026-09-16"),
      foodCostBeforeExclusions: 4,
      netFoodCost: 4,
      productionLaborCost: 1,
      dishwasherLaborCost: 1,
      totalTransferCost: 6,
      enteredByUserId: manager,
      finalizedAt: new Date(),
    },
  });
  const report = await getPrepReport("2026-09-16", "2026-09-16");
  assert.equal(report.tables[0].rows[0][7], 6);
  assert.equal(
    report.tables.find((t) => t.name === "Legacy Production")?.rows.length,
    1,
  );
  const count = await prisma.stockTransfer.count();
  const run = await exportSnapshot("2026-09-16", "2026-09-16");
  assert.deepEqual(run.report, report);
  assert.deepEqual(
    reportSheets(report, run.id).map((s) => s.rows),
    report.tables.map((t) => t.rows),
  );
  assert.ok(reportCsv(report, run.id).includes("Legacy Production"));
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 100 } });
  assert.deepEqual(await exportSnapshot(null, null, null, run.id), run);
  assert.equal(await prisma.stockTransfer.count(), count);
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 2 } });
});
test("server rejects staff, excess production deliveries, malformed dates and absent operation keys", async () => {
  await assert.rejects(
    recordPickup(staff, key(), pickup("2026-09-17")),
    /Manager/,
  );
  await assert.rejects(
    recordPickup(manager, "", pickup("2026-09-17")),
    /operation key/,
  );
  await assert.rejects(
    recordPickup(manager, key(), pickup("2026-02-30")),
    /Invalid business date/,
  );
  await assert.rejects(
    confirmProduction(manager, key(), {
      date: "2026-09-17",
      recipeId,
      quantity: 2,
      unit: "qt",
      cookName: "Cook",
      dishwasherMinutes: 0,
      deliveries: [{ venueId: venueA, quantity: 3 }],
    }),
    /exceed/,
  );
});

test("shared ingredient supply holds every affected venue charge without allocating or excluding labor", async () => {
  const date = "2026-09-18";
  const r = await confirmProduction(manager, key(), {
    date,
    recipeId,
    quantity: 22,
    unit: "qt",
    cookName: "Cook",
    dishwasherMinutes: 10,
    deliveries: [
      {
        venueId: venueA,
        quantity: 10,
        supplies: [
          {
            itemId,
            quantity: 2,
            unit: "qt",
            venueId: venueA,
            note: "Shared cream for both destinations",
            shared: true,
          },
        ],
      },
      { venueId: venueB, quantity: 12 },
    ],
  });
  const rows = await prisma.stockTransfer.findMany({
    where: { id: { in: r.transfers } },
  });
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      (t) =>
        t.accountingState === "PENDING" &&
        t.totalTransferCost === null &&
        t.productionLaborCost! > 0 &&
        t.dishwasherLaborCost! > 0,
    ),
  );
  await closeDay(manager, key(), { date });
  assert.equal((await getPrepReport(date, date)).tables[0].rows.length, 0);
});
test("cost completion after closeout is allowed on the closed day; originals and audit records are protected", async () => {
  const date = "2026-09-19",
    p = await recordPickup(
      manager,
      key(),
      pickup(date, { dishwasherMinutes: null }),
    );
  await closeDay(manager, key(), { date });
  const completed = await completeTransferCost(manager, key(), {
    transferId: p.transferId,
    date,
    reason: "Dishwasher signed paper",
    patch: { dishwasherMinutes: 0 },
  });
  assert.equal((await getPrepReport(date, date)).tables[0].rows.length, 1);
  await assert.rejects(
    prisma.stockTransfer.update({
      where: { id: p.transferId },
      data: { quantity: 99 },
    }),
    /immutable/,
  );
  await assert.rejects(
    prisma.stockTransfer.delete({ where: { id: p.transferId } }),
    /immutable/,
  );
  await assert.rejects(
    prisma.prepAmendment.update({
      where: { id: completed.amendmentId },
      data: { reason: "overwrite" },
    }),
    /immutable/,
  );
  const run = await exportSnapshot(date, date);
  await assert.rejects(
    prisma.transferReportRun.update({
      where: { stableId: run.id },
      data: { snapshot: {} },
    }),
    /immutable/,
  );
});
test("zero output closes shortages without inventing production; ordinary waste is distinct from return waste", async () => {
  const date = "2026-09-20",
    [line] = await requests(date, [10]);
  const result = await confirmProduction(manager, key(), {
    date,
    recipeId,
    quantity: 0,
    unit: "qt",
    cookName: "Cook",
    dishwasherMinutes: 0,
    deliveries: [
      {
        requestLineId: line.id,
        venueId: venueA,
        quantity: 0,
        shortageNote: "Not made; equipment failed",
      },
    ],
  });
  assert.equal(result.batchId, null);
  assert.equal(result.transfers.length, 0);
  await closeDay(manager, key(), { date });
  const r = await confirmProduction(manager, key(), {
    date: "2026-09-21",
    recipeId,
    quantity: 22,
    unit: "qt",
    cookName: "Cook",
    waste: 2,
    wasteReason: "Scorched",
    dishwasherMinutes: 0,
    deliveries: [{ venueId: venueA, quantity: 10 }],
  });
  const b = await prisma.productionBatch.findUniqueOrThrow({
    where: { id: r.batchId! },
  });
  assert.equal(b.retainedQty, 10);
  const w = await prisma.finishedStockAdjustment.findFirstOrThrow({
    where: { batchId: b.id },
  });
  assert.equal(w.quantity, -2);
  assert.equal(w.transferId, null);
  assert.equal(w.amendmentId, null);
});

test("non-destructive migration preserves exact legacy amounts and never converts historical requests", async () => {
  const line = await prisma.prepOrderLine.findUniqueOrThrow({
    where: { id: "legacy-line" },
  });
  assert.equal(line.allocatedCost, 4.1234567);
  assert.equal(line.productionBatchId, null);
  assert.equal(
    await prisma.stockTransfer.count({ where: { requestLineId: line.id } }),
    0,
  );
  const t = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: "legacy-transfer" },
  });
  assert.equal(t.foodCostBeforeExclusions, 4.1234567);
  assert.equal(t.productionLaborCost, 1.1111111);
  assert.equal(t.dishwasherLaborCost, 0.2222222);
  assert.equal(t.totalTransferCost, 5.45679);
  assert.equal(t.batchId, "legacy-batch");
  assert.equal(t.accountingState, "LEGACY");
  await assert.rejects(
    prisma.prepOrderLine.update({
      where: { id: line.id },
      data: { actualQty: 10 },
    }),
    /immutable/,
  );
});

test("supplies attached to entirely retained production remain visible in accounting support", async () => {
  const date = "2026-09-22";
  const r = await confirmProduction(manager, key(), {
    date,
    recipeId,
    quantity: 22,
    unit: "qt",
    cookName: "Cook",
    dishwasherMinutes: 0,
    deliveries: [],
    productionSupplies: [
      {
        itemId,
        venueId: venueA,
        quantity: 2,
        unit: "qt",
        note: "Cream supplied for retained prep",
        shared: true,
      },
    ],
  });
  assert.equal(r.transfers.length, 0);
  const report = await getPrepReport(date, date);
  const facts = report.tables.find(
    (t) => t.name === "Supplied Ingredients",
  )!.rows;
  assert.equal(facts.length, 1);
  assert.equal(facts[0][5], "Cream supplied for retained prep");
  assert.equal(report.tables[0].rows.length, 0);
});

test("correction after a partial return reverses only the remaining charge; zero replacement cancels delivery", async () => {
  const p = await recordPickup(manager, key(), pickup("2026-10-01"));
  const original = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: p.transferId },
  });
  const ret = await recordReturn(manager, key(), {
    transferId: p.transferId,
    date: "2026-10-02",
    quantity: 3,
    reason: "Returned portion",
  });
  const credit = await prisma.prepAmendment.findUniqueOrThrow({
    where: { id: ret.amendmentId },
  });
  const r = await correctTransfer(manager, key(), {
    transferId: p.transferId,
    date: "2026-10-03",
    reason: "Cancel remaining delivery",
    replacement: pickup("2026-10-03", { quantity: 0, dishwasherMinutes: 0 }),
  });
  const reversal = await prisma.prepAmendment.findUniqueOrThrow({
      where: { id: r.amendmentId },
    }),
    replacement = await prisma.stockTransfer.findUniqueOrThrow({
      where: { id: r.replacementId },
    });
  const creditCents = (credit.costingSnapshot as { charge: { total: number } })
      .charge.total,
    reversalCents = (reversal.costingSnapshot as { charge: { total: number } })
      .charge.total;
  assert.equal(
    creditCents + reversalCents,
    Math.round(original.totalTransferCost! * 100),
  );
  assert.equal(reversal.quantity, 7);
  assert.equal(replacement.quantity, 0);
  assert.equal(replacement.totalTransferCost, 0);
  assert.equal(
    await prisma.finishedStockAdjustment.count({
      where: { transferId: p.transferId },
    }),
    1,
  );
});
