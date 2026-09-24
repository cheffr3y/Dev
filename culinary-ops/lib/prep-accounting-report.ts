import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { json, type Tx } from "./prep-workflow";
import { prepReportDates } from "./prep-report";
import { readCost, type Charge } from "./prep-costing";
import { convertQty } from "./units";
import { readPrepCostDetailSnapshot } from "./prep-cost-detail";
import type { XlsxSheet } from "./xlsx";
export type ReportTable = {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  currencyColumns?: number[];
};
export type PrepAccountingReport = {
  version: 2;
  from: string;
  to: string;
  venueId: string | null;
  tables: ReportTable[];
  transferIds: string[];
  transferStableIds: string[];
};
const dollar = (n: number | null) => (n == null ? null : n / 100);
const date = (d: Date) => d.toISOString().slice(0, 10);
const legacyCharge = (t: {
  foodCostBeforeExclusions: number | null;
  excludedFoodCost: number | null;
  netFoodCost: number | null;
  productionLaborCost: number | null;
  dishwasherLaborCost: number | null;
  totalTransferCost: number | null;
}): Charge => ({
  gross:
    t.foodCostBeforeExclusions == null
      ? null
      : Math.round(t.foodCostBeforeExclusions * 100),
  excluded:
    t.excludedFoodCost == null ? null : Math.round(t.excludedFoodCost * 100),
  net: t.netFoodCost == null ? null : Math.round(t.netFoodCost * 100),
  production:
    t.productionLaborCost == null
      ? null
      : Math.round(t.productionLaborCost * 100),
  dishwasher:
    t.dishwasherLaborCost == null
      ? null
      : Math.round(t.dishwasherLaborCost * 100),
  total:
    t.totalTransferCost == null ? null : Math.round(t.totalTransferCost * 100),
  issues: [],
  ingredients: [],
});
export async function calculatePrepReport(
  tx: Tx,
  from?: string | null,
  to?: string | null,
  venueId?: string | null,
): Promise<PrepAccountingReport> {
  const range = prepReportDates(from, to),
    period = { gte: range.fromDate, lte: range.toDate },
    limit = 5000;
  const [transfers, legacy, waste] = await Promise.all([
    tx.stockTransfer.findMany({
      where: {
        ...(venueId ? { venueId } : {}),
        OR: [
          { transferDate: period },
          { amendments: { some: { adjustmentDate: period } } },
        ],
      },
      include: {
        venue: true,
        recipe: true,
        batch: { include: { recipe: true } },
        exclusions: { include: { supplyingVenue: true } },
        amendments: { orderBy: { revision: "asc" } },
      },
      orderBy: [{ transferDate: "asc" }, { stableId: "asc" }],
      take: limit + 1,
    }),
    tx.prepOrderLine.findMany({
      where: {
        status: { in: ["MADE", "SHORT", "NOT_MADE"] },
        productionBatchId: null,
        enteredAt: { not: null },
        prepOrder: { forDate: period },
        ...(venueId ? { destinationVenueId: venueId } : {}),
        deliveries: { none: {} },
      },
      include: { recipe: true, destinationVenue: true, prepOrder: true },
      orderBy: { id: "asc" },
      take: limit + 1,
    }),
    tx.finishedStockAdjustment.findMany({
      where: {
        date: period,
        ...(venueId
          ? {
              OR: [
                { transfer: { venueId } },
                { batch: { transfers: { some: { venueId } } } },
              ],
            }
          : {}),
      },
      include: {
        batch: { include: { recipe: true } },
        transfer: { include: { recipe: true } },
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    }),
  ]);
  if ([transfers, legacy, waste].some((r) => r.length > limit))
    throw new Error(
      "Report exceeds 5000 records. Choose a smaller date range.",
    );
  const summary: ReportTable = {
    name: "Venue Summary",
    headers: [
      "Venue",
      "Gross food",
      "Exclusions",
      "Net food",
      "Production labor",
      "Dishwasher labor",
      "Credits",
      "Net charges",
    ],
    rows: [],
    currencyColumns: [1, 2, 3, 4, 5, 6, 7],
  };
  const ready: ReportTable = {
    name: "Ready Charges",
    headers: [
      "Record ID",
      "Date",
      "Venue",
      "Recipe",
      "Quantity",
      "Unit",
      "Gross food",
      "Exclusions",
      "Net food",
      "Production labor",
      "Dishwasher labor",
      "Charge",
      "Source",
      "Original transfer",
    ],
    rows: [],
    currencyColumns: [6, 7, 8, 9, 10, 11],
  };
  const pending: ReportTable = {
    name: "Pending Issues",
    headers: ["Transfer ID", "Transfer date", "Venue", "Recipe", "Issue"],
    rows: [],
  };
  const ingredients: ReportTable = {
    name: "Ingredient Support",
    headers: [
      "Transfer ID",
      "Ingredient",
      "GCODE",
      "Quantity",
      "Unit",
      "Captured unit price",
      "Gross food",
      "Excluded food",
      "Net food",
    ],
    rows: [],
    currencyColumns: [5, 6, 7, 8],
  };
  const labor: ReportTable = {
    name: "Labor Support",
    headers: [
      "Transfer ID",
      "Production minutes",
      "Production rate",
      "Production source",
      "Production charge",
      "Dishwasher minutes",
      "Dishwasher rate",
      "Dishwasher charge",
    ],
    rows: [],
    currencyColumns: [2, 4, 6, 7],
  };
  const supplied: ReportTable = {
    name: "Supplied Ingredients",
    headers: [
      "Transfer / production ID",
      "Source venue",
      "Ingredient",
      "Quantity",
      "Unit",
      "Note",
      "Shared review",
    ],
    rows: [],
  };
  const adjustments: ReportTable = {
    name: "Corrections and Returns",
    headers: [
      "Amendment ID",
      "Original transfer",
      "Date",
      "Kind",
      "Quantity",
      "Net food credit",
      "Production credit",
      "Dishwasher credit",
      "Total credit",
      "Reason",
      "Author",
      "Replacement ID",
    ],
    rows: [],
    currencyColumns: [5, 6, 7, 8],
  };
  const late: ReportTable = {
    name: "Late Cost Completions",
    headers: [
      "Amendment ID",
      "Transfer ID",
      "Original transfer date",
      "Completion date",
      "Venue",
      "Charge",
      "Review",
    ],
    rows: [],
    currencyColumns: [5],
  };
  const historical: ReportTable = {
    name: "Legacy Production",
    headers: [
      "Request line ID",
      "Date",
      "Venue",
      "Recipe",
      "Quantity",
      "Unit",
      "Captured food",
      "Treatment",
    ],
    rows: legacy
      .filter((l) => l.allocatedCost != null || l.costBreakdownSnapshot != null)
      .map((l) => [
        l.id,
        date(l.prepOrder.forDate),
        l.destinationVenue.name,
        l.recipe.name,
        l.actualQty,
        l.actualUnit ?? l.requestedUnit,
        l.allocatedCost,
        "Preserved production only; no transfer charge",
      ]),
    currencyColumns: [6],
  };
  const wasteTable: ReportTable = {
    name: "Waste",
    headers: [
      "Waste ID",
      "Date",
      "Recipe",
      "Quantity",
      "Unit",
      "Reason",
      "Transfer ID",
      "Amendment ID",
      "Author",
    ],
    rows: waste.map((w) => [
      w.stableId,
      date(w.date),
      w.batch?.recipe.name ?? w.transfer?.recipe?.name ?? w.recipeId,
      w.quantity,
      w.unit,
      w.reason,
      w.transferId,
      w.amendmentId,
      w.enteredByUserId,
    ]),
  };
  const totals = new Map<string, number[]>();
  const add = (venue: string, c: Charge, credit = false) => {
    const v = totals.get(venue) ?? [0, 0, 0, 0, 0, 0, 0];
    if (credit) {
      v[5] += c.total ?? 0;
      v[6] -= c.total ?? 0;
    } else {
      v[0] += c.gross ?? 0;
      v[1] += c.excluded ?? 0;
      v[2] += c.net ?? 0;
      v[3] += c.production ?? 0;
      v[4] += c.dishwasher ?? 0;
      v[6] += c.total ?? 0;
    }
    totals.set(venue, v);
  };
  const productionFacts = await tx.productionBatch.findMany({
    where: { producedOn: period },
    select: { stableId: true, costingSnapshot: true },
    take: limit + 1,
  });
  if (productionFacts.length > limit)
    throw new Error(
      "Report exceeds 5000 production records. Choose a smaller date range.",
    );
  for (const batch of productionFacts) {
    const snap = readCost(batch.costingSnapshot);
    for (const supply of snap?.productionSupplies ?? []) {
      if (venueId && supply.venueId !== venueId) continue;
      supplied.rows.push([
        batch.stableId,
        supply.venueId,
        snap?.capture.recipes
          .flatMap((r) => r.items)
          .find((i) => i.itemId === supply.itemId)?.item.name ?? supply.itemId,
        supply.quantity,
        supply.unit,
        supply.note,
        "Shared / retained supply facts; no automatic allocation",
      ]);
    }
  }
  const closedDates = new Set(
    (
      await tx.productionCloseout.findMany({
        where: { businessDate: period, finalizedAt: { not: null } },
        select: { businessDate: true },
        take: 367,
      })
    ).map((row) => date(row.businessDate)),
  );
  const sourceVenues = await tx.venue.findMany({
    select: { id: true, name: true },
    take: 1000,
  });
  const venueNames = new Map(sourceVenues.map((v) => [v.id, v.name]));
  for (const t of transfers) {
    const inPeriod =
      t.transferDate >= range.fromDate && t.transferDate <= range.toDate;
    const completion = t.amendments
      .filter((a) => a.kind === "COST_COMPLETION")
      .at(-1);
    const s = readCost(completion?.costingSnapshot ?? t.costingSnapshot),
      c = s?.charge ?? legacyCharge(t),
      recipe =
        s?.capture.recipes.find((r) => r.id === s.capture.recipeId)?.name ??
        t.recipe?.name ??
        t.batch?.recipe.name ??
        "Historical item";
    const issues = [
      ...c.issues,
      ...(!t.finalizedAt ? ["Operational day not yet closed"] : []),
    ];
    if (inPeriod) {
      if (c.total != null && !issues.length) {
        ready.rows.push([
          t.stableId,
          date(t.transferDate),
          t.venue.name,
          recipe,
          t.quantity,
          t.unit,
          dollar(c.gross),
          dollar(c.excluded),
          dollar(c.net),
          dollar(c.production),
          dollar(c.dishwasher),
          dollar(c.total),
          t.sourceType,
          t.correctionOfId,
        ]);
        add(t.venue.name, c);
      } else if (
        !t.amendments.some(
          (a) => a.kind === "REVERSAL" && a.adjustmentDate <= range.toDate,
        )
      )
        for (const issue of issues.length
          ? issues
          : ["Incomplete captured historical charge"])
          pending.rows.push([
            t.stableId,
            date(t.transferDate),
            t.venue.name,
            recipe,
            issue,
          ]);
    }
    if (s) {
      for (const r of c.ingredients)
        ingredients.rows.push([
          t.stableId,
          r.name,
          r.gcode,
          r.quantity,
          r.unit,
          r.price,
          dollar(r.gross),
          dollar(r.excluded),
          dollar(r.net),
        ]);
      const ratio =
        s.capture.weights[s.capture.share] /
        s.capture.weights.reduce((a, b) => a + b, 0);
      labor.rows.push([
        t.stableId,
        s.capture.productionMinutes == null
          ? null
          : s.capture.productionMinutes * ratio,
        s.capture.productionRate,
        s.capture.productionSource,
        dollar(c.production),
        s.capture.dishwasherMinutes == null
          ? null
          : s.capture.dishwasherMinutes * ratio,
        s.capture.dishwasherRate,
        dollar(c.dishwasher),
      ]);
      for (const v of s.capture.supplies)
        supplied.rows.push([
          t.stableId,
          venueNames.get(v.venueId) ?? v.venueId,
          c.ingredients.find((i) => i.itemId === v.itemId)?.name ?? v.itemId,
          v.quantity,
          v.unit,
          v.note,
          v.shared ? "Held for review" : "Identified venue food exclusion",
        ]);
    } else {
      const detail = readPrepCostDetailSnapshot(
        t.batch?.foodCostDetailSnapshot,
      );
      const ratio = t.batch
        ? (convertQty(t.quantity, t.unit, t.batch.outputUnit) ?? 0) /
          t.batch.outputQty
        : 1;
      for (const r of detail?.rows ?? [])
        ingredients.rows.push([
          t.stableId,
          r.itemName,
          r.gcode,
          r.quantity * ratio,
          r.unit,
          r.unitCost,
          r.extendedCost * ratio,
          null,
          null,
        ]);
      labor.rows.push([
        t.stableId,
        t.productionMinutes,
        t.batch?.productionLaborRate ?? null,
        "Historical captured",
        t.productionLaborCost,
        t.dishwasherMinutes,
        t.batch?.dishwasherLaborRate ?? null,
        t.dishwasherLaborCost,
      ]);
      for (const e of t.exclusions)
        supplied.rows.push([
          t.stableId,
          e.supplyingVenue.name,
          e.itemName,
          e.quantity,
          e.unit,
          e.reason,
          e.treatment,
        ]);
    }
    for (const a of t.amendments) {
      if (a.adjustmentDate < range.fromDate || a.adjustmentDate > range.toDate)
        continue;
      if (a.kind === "COST_COMPLETION") {
        if (!inPeriod)
          late.rows.push([
            a.id,
            t.stableId,
            date(t.transferDate),
            date(a.adjustmentDate),
            t.venue.name,
            dollar(readCost(a.costingSnapshot)?.charge.total ?? null),
            "Review original period; not added to this period's charges",
          ]);
        continue;
      }
      const data = a.costingSnapshot as unknown as {
        charge: Charge;
        replacementId?: string;
      };
      adjustments.rows.push([
        a.id,
        t.stableId,
        date(a.adjustmentDate),
        a.kind,
        a.quantity,
        dollar(data.charge.net),
        dollar(data.charge.production),
        dollar(data.charge.dishwasher),
        dollar(data.charge.total),
        a.reason,
        a.authorId,
        data.replacementId ?? null,
      ]);
      if (
        data.charge.total != null &&
        (!t.finalizedAt || !closedDates.has(date(a.adjustmentDate)))
      )
        pending.rows.push([
          t.stableId,
          date(a.adjustmentDate),
          t.venue.name,
          recipe,
          `${a.kind} ${a.id}: original or adjustment day not yet closed`,
        ]);
      if (
        data.charge.total != null &&
        t.finalizedAt &&
        closedDates.has(date(a.adjustmentDate))
      ) {
        add(t.venue.name, data.charge, true);
        ready.rows.push([
          a.id,
          date(a.adjustmentDate),
          t.venue.name,
          recipe,
          -(a.quantity ?? 0),
          t.unit,
          0,
          0,
          0,
          0,
          0,
          -data.charge.total / 100,
          a.kind,
          t.stableId,
        ]);
      }
    }
  }
  summary.rows = [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([venue, n]) => [venue, ...n.map((x) => x / 100)]);
  return {
    version: 2,
    from: range.from,
    to: range.to,
    venueId: venueId || null,
    tables: [
      summary,
      ready,
      pending,
      ingredients,
      labor,
      supplied,
      adjustments,
      wasteTable,
      late,
      historical,
    ],
    transferIds: transfers.map((t) => t.id),
    transferStableIds: transfers.map((t) => t.stableId),
  };
}
export async function getPrepReport(
  from?: string | null,
  to?: string | null,
  venue?: string | null,
) {
  return prisma.$transaction((tx) => calculatePrepReport(tx, from, to, venue), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 30000,
  });
}
export async function exportSnapshot(
  from?: string | null,
  to?: string | null,
  venue?: string | null,
  runId?: string | null,
) {
  if (runId) {
    const run = await prisma.transferReportRun.findUniqueOrThrow({
      where: { stableId: runId },
    });
    if (!run.snapshot)
      throw new Error("This old report run has no immutable snapshot.");
    return {
      id: run.stableId,
      report: run.snapshot as unknown as PrepAccountingReport,
    };
  }
  return prisma.$transaction(
    async (tx) => {
      const report = await calculatePrepReport(tx, from, to, venue);
      const range = prepReportDates(report.from, report.to);
      const run = await tx.transferReportRun.create({
        data: {
          fromDate: range.fromDate,
          toDate: range.toDate,
          venueId: report.venueId,
          snapshot: json(report),
          inclusions: {
            create: report.transferIds.map((transferId) => ({ transferId })),
          },
        },
      });
      return { id: run.stableId, report };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    },
  );
}
export function reportSheets(
  report: PrepAccountingReport,
  runId: string,
): XlsxSheet[] {
  return report.tables.map((t) => ({
    ...t,
    title: `${t.name} · ${report.from} through ${report.to}`,
    note: `Immutable export ${runId}. Acumatica is authoritative. Export does not imply posting.`,
    widths: t.headers.map(() => 24),
  }));
}
function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  const safe =
    typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function reportCsv(report: PrepAccountingReport, runId: string) {
  return [
    ["Export snapshot", runId],
    ...report.tables.flatMap((t) => [[t.name], t.headers, ...t.rows, []]),
  ]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");
}
