import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { convertQty } from "@/lib/units";
import { prepReportDates } from "@/lib/prep-report";
import {
  buildPrepCostDetail,
  readPrepCostDetailSnapshot,
  type CostDetailRecipeNode,
  type PrepCostDetailRow,
} from "@/lib/prep-cost-detail";
import { createXlsx, type XlsxCell } from "@/lib/xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const { from, to, fromDate, toDate } = prepReportDates(searchParams.get("from"), searchParams.get("to"));
  const venueId = searchParams.get("venue") || "";

  const [lines, recipeNodes] = await Promise.all([
    prisma.prepOrderLine.findMany({
      where: {
        status: { in: ["MADE", "SHORT"] },
        ...(venueId ? { destinationVenueId: venueId } : {}),
        prepOrder: { forDate: { gte: fromDate, lte: toDate } },
      },
      include: {
        recipe: { select: { name: true, prodCode: true, yieldQty: true, yieldUnit: true } },
        destinationVenue: { select: { name: true, code: true } },
        prepOrder: { select: { forDate: true } },
        madeBy: { select: { name: true } },
      },
      orderBy: [{ destinationVenue: { name: "asc" } }, { recipe: { name: "asc" } }, { prepOrder: { forDate: "asc" } }],
    }),
    prisma.recipe.findMany({
      select: {
        id: true,
        yieldQty: true,
        yieldUnit: true,
        items: {
          select: {
            itemId: true,
            quantity: true,
            unit: true,
            item: { select: { name: true, category: true, unit: true, unitCost: true, sku: true, gcode: true } },
          },
        },
        components: { select: { childId: true, quantity: true, unit: true } },
      },
    }),
  ]);

  type Summary = {
    venue: string;
    venueCode: string;
    recipe: string;
    prodCode: string;
    unit: string;
    madeQty: number;
    shortQty: number;
    cost: number;
    lineCount: number;
  };
  const summary = new Map<string, Summary>();
  for (const line of lines) {
    const unit = line.actualUnit ?? line.requestedUnit;
    const key = `${line.destinationVenueId}|${line.recipeId}|${unit}`;
    const row = summary.get(key) ?? {
      venue: line.destinationVenue.name,
      venueCode: line.destinationVenue.code,
      recipe: line.recipe.name,
      prodCode: line.recipe.prodCode,
      unit,
      madeQty: 0,
      shortQty: 0,
      cost: 0,
      lineCount: 0,
    };
    if (line.status === "MADE") row.madeQty += line.actualQty ?? 0;
    else row.shortQty += line.actualQty ?? 0;
    row.cost += line.allocatedCost ?? 0;
    row.lineCount += 1;
    summary.set(key, row);
  }

  const summaryRows: XlsxCell[][] = [...summary.values()]
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.recipe.localeCompare(b.recipe))
    .map((row) => {
      const totalQty = row.madeQty + row.shortQty;
      return [
        row.venueCode,
        row.venue,
        "",
        row.prodCode,
        row.recipe,
        row.madeQty,
        row.shortQty,
        totalQty,
        row.unit,
        totalQty > 0 ? row.cost / totalQty : 0,
        row.cost,
        row.lineCount,
      ];
    });

  const productionRows: XlsxCell[][] = lines.map((line) => [
    line.prepOrder.forDate,
    line.destinationVenue.code,
    line.destinationVenue.name,
    "",
    line.recipe.prodCode,
    line.recipe.name,
    line.recipeVersion,
    line.lot ?? "",
    line.status,
    line.requestedQty,
    line.requestedUnit,
    line.actualQty ?? 0,
    line.actualUnit ?? line.requestedUnit,
    line.unitCostSnapshot ?? 0,
    line.recipe.yieldUnit,
    line.allocatedCost ?? 0,
    line.madeBy?.name ?? "",
    line.notes ?? "",
  ]);

  const ingredientRows: XlsxCell[][] = [];
  for (const line of lines) {
    const snapshot = readPrepCostDetailSnapshot(line.costBreakdownSnapshot);
    const details: PrepCostDetailRow[] = snapshot?.rows ?? buildPrepCostDetail(
      line.recipeId,
      line.actualQty ?? 0,
      line.actualUnit ?? line.requestedUnit,
      recipeNodes as CostDetailRecipeNode[],
    );
    const detailTotal = details.reduce((sum, detail) => sum + detail.extendedCost, 0);
    for (const detail of details) {
      const allocatedFrozenCost = detailTotal > 0
        ? ((line.allocatedCost ?? 0) * detail.extendedCost) / detailTotal
        : 0;
      ingredientRows.push([
        line.prepOrder.forDate,
        line.destinationVenue.code,
        line.destinationVenue.name,
        line.recipe.prodCode,
        line.recipe.name,
        line.lot ?? "",
        detail.gcode ?? "",
        detail.sku ?? "",
        detail.itemName,
        detail.category,
        detail.quantity,
        detail.unit,
        detail.unitCost,
        detail.extendedCost,
        allocatedFrozenCost,
        snapshot ? "Frozen at production" : "Current recipe fallback (legacy line)",
        detail.converted ? "" : "Unit conversion unavailable",
      ]);
    }
  }

  const reportLabel = `${from} through ${to}`;
  const workbook = createXlsx([
    {
      name: "Recipe Totals",
      title: `Commissary Recipe Cost Transfer · ${reportLabel}`,
      note: "Completed production only (MADE and SHORT). Frozen Mise cost is an accounting support value; Acumatica remains authoritative. Finished-product GCODE is intentionally blank until recipes become Acumatica sub-assemblies.",
      headers: ["Venue Code", "Destination Venue", "Finished GCODE", "Mise Prod Code", "Recipe", "Made Qty", "Short Qty", "Total Actual Qty", "Unit", "Avg Frozen Cost / Actual Unit", "Frozen Extended Cost", "Production Lines"],
      rows: summaryRows,
      widths: [14, 24, 18, 16, 32, 12, 12, 16, 12, 24, 22, 16],
      currencyColumns: [9, 10],
      numberColumns: [5, 6, 7, 11],
    },
    {
      name: "Production Detail",
      title: `Production Audit Detail · ${reportLabel}`,
      note: "One row per completed prep-order line. Unit Cost Snapshot is stored per recipe yield unit; Frozen Extended Cost is the transferred line total.",
      headers: ["Production Date", "Venue Code", "Destination Venue", "Finished GCODE", "Mise Prod Code", "Recipe", "Recipe Version", "Lot", "Status", "Requested Qty", "Requested Unit", "Actual Qty", "Actual Unit", "Unit Cost Snapshot", "Cost Basis Unit", "Frozen Extended Cost", "Made By", "Notes"],
      rows: productionRows,
      widths: [16, 14, 24, 18, 16, 32, 15, 18, 12, 15, 16, 14, 14, 20, 16, 22, 20, 36],
      dateColumns: [0],
      currencyColumns: [13, 15],
      numberColumns: [6, 9, 11],
    },
    {
      name: "Ingredient Detail",
      title: `Ingredient Cost Support · ${reportLabel}`,
      note: "GCODEs come from Catalog items. Frozen snapshots are historical; legacy lines use the current recipe as a fallback. Allocated Frozen Cost is proportionally reconciled to each recipe line's frozen total.",
      headers: ["Production Date", "Venue Code", "Destination Venue", "Mise Prod Code", "Recipe", "Lot", "Ingredient GCODE", "Vendor Item #", "Ingredient", "Category", "Quantity", "Unit", "Captured Unit Cost", "Captured Extended Cost", "Allocated Frozen Cost", "Detail Source", "Warning"],
      rows: ingredientRows,
      widths: [16, 14, 24, 16, 32, 18, 20, 18, 30, 22, 14, 12, 20, 22, 22, 30, 28],
      dateColumns: [0],
      currencyColumns: [12, 13, 14],
      numberColumns: [10],
    },
  ]);

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="commissary-cost-transfer_${from}_${to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
