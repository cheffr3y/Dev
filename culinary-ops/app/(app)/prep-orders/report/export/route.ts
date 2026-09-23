import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { prepReportDates } from "@/lib/prep-report";

function csv(value: unknown) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  if (!await getCurrentUser()) return new Response("Unauthorized", { status: 401 });
  const { searchParams } = new URL(request.url);
  const { from, to, fromDate, toDate } = prepReportDates(searchParams.get("from"), searchParams.get("to"));
  const venueId = searchParams.get("venue") || "";
  const transfers = await prisma.stockTransfer.findMany({
    where: { transferDate: { gte: fromDate, lte: toDate }, ...(venueId ? { venueId } : {}) },
    include: { venue: true, batch: { include: { recipe: true } } },
    orderBy: [{ transferDate: "asc" }, { stableId: "asc" }],
  });
  const headers = ["Transfer ID", "Transfer Date", "Venue Code", "Venue", "Recipe / Item", "Mise Prod Code", "Quantity", "Unit", "Lot / Batch", "Source", "Food Before Exclusions", "Excluded Food", "Net Food", "Production Labor", "Dishwasher Labor", "Total Transfer", "Finalized"];
  const rows = transfers.map((t) => [t.stableId, t.transferDate, t.venue.code, t.venue.name, t.batch.recipe.name, t.batch.recipe.prodCode, t.quantity, t.unit, t.batch.lot, t.sourceType, t.foodCostBeforeExclusions, t.excludedFoodCost, t.netFoodCost, t.productionLaborCost, t.dishwasherLaborCost, t.totalTransferCost, t.finalizedAt ? "yes" : "no"]);
  const body = [headers, ...rows].map((row) => row.map(csv).join(",")).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cost-transfer_${from}_${to}.csv"`, "Cache-Control": "private, no-store" } });
}
