import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { prepReportDates } from "@/lib/prep-report";
import { readPrepCostDetailSnapshot } from "@/lib/prep-cost-detail";
import { quantityInBatchUnit } from "@/lib/production";
import { createXlsx, type XlsxCell } from "@/lib/xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!await getCurrentUser()) return new Response("Unauthorized", { status: 401 });
  const { searchParams } = new URL(request.url);
  const { from, to, fromDate, toDate } = prepReportDates(searchParams.get("from"), searchParams.get("to"));
  const venueId = searchParams.get("venue") || "";
  const [transfers, legacy, adjustments] = await Promise.all([
    prisma.stockTransfer.findMany({
      where: { transferDate: { gte: fromDate, lte: toDate }, ...(venueId ? { venueId } : {}) },
      include: { venue: true, batch: { include: { recipe: true } }, exclusions: { include: { supplyingVenue: true } }, correctionOf: true },
      orderBy: [{ venue: { name: "asc" } }, { transferDate: "asc" }, { stableId: "asc" }],
    }),
    prisma.prepOrderLine.findMany({
      where: { status: { in: ["MADE", "SHORT"] }, productionBatchId: null, prepOrder: { forDate: { gte: fromDate, lte: toDate } }, ...(venueId ? { destinationVenueId: venueId } : {}) },
      include: { recipe: true, destinationVenue: true, prepOrder: true }, orderBy: { enteredAt: "asc" },
    }),
    prisma.finishedStockAdjustment.findMany({ where: { date: { gte: fromDate, lte: toDate } }, include: { batch: { include: { recipe: true } }, correctionOf: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // Inclusion records are audit metadata only. They never create or alter a
  // transfer, so regenerating an export cannot create another charge.
  const run = await prisma.transferReportRun.create({ data: {
    fromDate, toDate, venueId: venueId || null,
    inclusions: transfers.length ? { create: transfers.map((transfer) => ({ transferId: transfer.id })) } : undefined,
  } });

  const venueMap = new Map<string, { code: string; name: string; gross: number; excluded: number; net: number; production: number; dishwasher: number; total: number }>();
  for (const t of transfers) {
    const row = venueMap.get(t.venueId) ?? { code: t.venue.code, name: t.venue.name, gross: 0, excluded: 0, net: 0, production: 0, dishwasher: 0, total: 0 };
    row.gross += t.foodCostBeforeExclusions; row.excluded += t.excludedFoodCost; row.net += t.netFoodCost;
    row.production += t.productionLaborCost; row.dishwasher += t.dishwasherLaborCost; row.total += t.totalTransferCost;
    venueMap.set(t.venueId, row);
  }
  const venueRows: XlsxCell[][] = [...venueMap.values()].map((v) => [v.code, v.name, v.gross, v.excluded, v.net, v.production, v.dishwasher, v.total]);
  const detailRows: XlsxCell[][] = transfers.map((t) => [
    t.stableId, t.transferDate, t.venue.code, t.venue.name, t.batch.recipe.prodCode, t.batch.recipe.name,
    t.quantity, t.unit, t.batch.lot, t.sourceType, t.foodCostBeforeExclusions, t.excludedFoodCost,
    t.netFoodCost, t.productionLaborCost, t.dishwasherLaborCost, t.totalTransferCost,
    t.correctionOf?.stableId ?? "", t.notes ?? "", run.stableId,
  ]);

  const ingredientRows: XlsxCell[][] = [];
  const laborRows: XlsxCell[][] = [];
  const issueRows: XlsxCell[][] = [];
  for (const t of transfers) {
    const snapshot = readPrepCostDetailSnapshot(t.batch.foodCostDetailSnapshot);
    const ratio = quantityInBatchUnit(t.quantity, t.unit, t.batch.outputUnit) / t.batch.outputQty;
    const detailTotal = snapshot?.rows.reduce((sum, row) => sum + row.extendedCost, 0) ?? 0;
    if (!snapshot) issueRows.push([t.stableId, "Missing frozen ingredient detail", "Resolve before accounting review"]);
    for (const row of snapshot?.rows ?? []) {
      const exclusion = t.exclusions.find((e) => e.itemId === row.itemId);
      const cost = detailTotal > 0 ? t.foodCostBeforeExclusions * row.extendedCost / detailTotal : 0;
      const warning = [!row.gcode ? "Missing GCODE" : "", row.unitCost <= 0 ? "Missing price" : "", !row.converted ? "Incompatible unit" : ""].filter(Boolean).join("; ");
      ingredientRows.push([
        t.stableId, t.transferDate, t.venue.code, t.batch.recipe.name, t.batch.lot, row.gcode ?? "", row.itemName,
        row.quantity * ratio, row.unit, row.unitCost <= 0 ? null : row.unitCost, cost,
        exclusion?.excludedFoodCost ?? 0, exclusion ? cost - exclusion.excludedFoodCost : cost,
        exclusion?.supplyingVenue.code ?? "", exclusion?.treatment ?? "", exclusion?.reason ?? "", warning,
      ]);
      if (warning) issueRows.push([t.stableId, `${row.itemName}: ${warning}`, "Reference/cost review required; not treated as valid zero cost"]);
    }
    laborRows.push([
      t.stableId, t.transferDate, t.venue.code, t.batch.recipe.name, t.batch.lot,
      t.productionMinutes, t.batch.productionLaborRate, t.productionLaborCost,
      t.batch.productionMinutesSource === "ACTUAL_OVERRIDE" ? "Actual entered override" : "Standard estimate",
      t.dishwasherMinutes, t.batch.dishwasherLaborRate, t.dishwasherLaborCost,
      t.batch.dishwasherAllocationMethod ?? "Pending", t.batch.standardProductionMinutes ?? null, t.batch.actualProductionMinutes ?? null,
    ]);
    for (const exclusion of t.exclusions.filter((e) => e.treatment === "BORROWED_OWED" && !e.resolvedAt)) {
      issueRows.push([t.stableId, `Borrowed ${exclusion.itemName} from ${exclusion.supplyingVenue.code} remains owed`, exclusion.reason]);
    }
    if (!t.finalizedAt) issueRows.push([t.stableId, "Transfer is not part of a finalized daily closeout", "Review labor allocation"]);
    if (t.sourceType === "CORRECTION") issueRows.push([t.stableId, `Correction${t.correctionOf ? ` of ${t.correctionOf.stableId}` : ""}`, t.notes ?? ""]);
  }
  for (const adjustment of adjustments) {
    issueRows.push([adjustment.stableId, `${adjustment.type} stock adjustment · ${adjustment.batch.recipe.name}${adjustment.correctionOf ? ` · corrects ${adjustment.correctionOf.stableId}` : ""}`, `${adjustment.quantity} ${adjustment.unit} · ${adjustment.reason}`]);
  }
  const legacyRows: XlsxCell[][] = legacy.map((line) => [
    line.id, line.prepOrder.forDate, line.destinationVenue.code, line.recipe.prodCode, line.recipe.name,
    line.lot ?? "", line.actualQty ?? 0, line.actualUnit ?? line.requestedUnit, line.allocatedCost ?? null,
    "Historical completed prep only — not a transfer charge; no labor fabricated",
  ]);

  const workbook = createXlsx([
    { name: "Venue Summary", title: `Venue Cost Transfer Summary · ${from} through ${to}`, note: `Export ${run.stableId}. Support report only; Acumatica remains authoritative. Exported does not mean posted.`, headers: ["Venue Code", "Venue", "Food Before Exclusions", "Excluded Food", "Net Transferable Food", "Production Labor", "Dishwasher Labor", "Total Transfer"], rows: venueRows, widths: [14,24,22,18,22,20,20,20], currencyColumns: [2,3,4,5,6,7] },
    { name: "Transfer Detail", title: `Transfer Detail · ${from} through ${to}`, note: "One stable row per venue transfer. Transfer date—not production or request date—drives this report.", headers: ["Transfer ID", "Transfer Date", "Venue Code", "Venue", "Mise Prod Code", "Recipe / Item", "Quantity", "Unit", "Lot / Batch", "Source Type", "Food Before Exclusions", "Excluded Food", "Net Food", "Production Labor", "Dishwasher Labor", "Total Transfer", "Corrects Transfer ID", "Notes", "Report Run ID"], rows: detailRows, widths: [28,16,14,24,16,30,14,12,24,18,22,18,18,20,20,20,28,32,28], dateColumns: [1], numberColumns: [6], currencyColumns: [10,11,12,13,14,15] },
    { name: "Ingredient Support", title: `Ingredient Support · ${from} through ${to}`, note: "Frozen ingredient detail includes excluded items. Missing prices/units are blank or flagged, never silently represented as valid free food.", headers: ["Transfer ID", "Transfer Date", "Venue", "Recipe / Item", "Lot / Batch", "GCODE", "Ingredient / Sub-recipe Detail", "Quantity", "Unit", "Captured Unit Price", "Captured Cost", "Excluded Cost", "Net Cost", "Supplying Venue", "Treatment", "Exclusion Reason", "Warning"], rows: ingredientRows, widths: [28,16,12,30,24,18,32,14,12,20,18,18,18,18,20,32,30], dateColumns: [1], numberColumns: [7], currencyColumns: [9,10,11,12] },
    { name: "Labor Detail", title: `Labor Detail · ${from} through ${to}`, note: "Wage-only rates. Production and dishwasher labor remain separate. Batch rates and allocations are frozen at closeout.", headers: ["Transfer ID", "Transfer Date", "Venue", "Recipe / Item", "Lot / Batch", "Production Minutes", "Production Rate", "Production Amount", "Estimate / Actual", "Dishwasher Minutes", "Dishwasher Rate", "Dishwasher Amount", "Allocation Method", "Batch Standard Minutes", "Batch Actual Minutes"], rows: laborRows, widths: [28,16,12,30,24,20,18,20,22,20,18,20,28,22,20], dateColumns: [1], numberColumns: [5,9,13,14], currencyColumns: [6,7,10,11] },
    { name: "Issues & Corrections", title: `Corrections and Unresolved Issues · ${from} through ${to}`, note: "Resolve warnings before relying on the support totals.", headers: ["Transfer ID", "Issue / Correction", "Notes"], rows: issueRows, widths: [28,52,52] },
    { name: "Legacy Production", title: `Preserved Legacy Production · ${from} through ${to}`, note: "Historical completed prep lines not confirmed into the new transfer ledger. Kept for compatibility; excluded from venue transfer totals and no labor is fabricated.", headers: ["Legacy Prep Line ID", "Production Date", "Venue", "Mise Prod Code", "Recipe", "Lot", "Actual Quantity", "Unit", "Historical Frozen Food Cost", "Treatment"], rows: legacyRows, widths: [28,16,12,16,30,22,18,12,24,52], dateColumns: [1], numberColumns: [6], currencyColumns: [8] },
  ]);
  return new Response(new Uint8Array(workbook), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="commissary-cost-transfer_${from}_${to}.xlsx"`,
    "Cache-Control": "private, no-store",
  } });
}
