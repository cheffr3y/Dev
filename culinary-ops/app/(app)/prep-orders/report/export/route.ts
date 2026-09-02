import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { prepReportDates } from "@/lib/prep-report";

// CSV handoff of the cost-transfer report. One row per produced line so
// accounting can pivot by venue/item and apply Acumatica pricing to the
// quantities. Protected by the proxy auth; we double-check the session here.

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const range = prepReportDates(searchParams.get("from"), searchParams.get("to"));
  const venueId = searchParams.get("venue") || "";
  const { fromDate, toDate } = range;

  const lines = await prisma.prepOrderLine.findMany({
    where: {
      status: { in: ["MADE", "SHORT"] },
      ...(venueId ? { destinationVenueId: venueId } : {}),
      prepOrder: { forDate: { gte: fromDate, lte: toDate } },
    },
    include: {
      recipe: { select: { name: true, prodCode: true } },
      destinationVenue: { select: { name: true } },
      prepOrder: { select: { forDate: true } },
      madeBy: { select: { name: true } },
    },
    orderBy: [{ destinationVenue: { name: "asc" } }, { recipe: { name: "asc" } }, { prepOrder: { forDate: "asc" } }],
  });

  const header = [
    "Production Date",
    "Destination Venue",
    "Item",
    "Prod Code",
    "Lot",
    "Quantity",
    "Unit",
    "Status",
    "Made By",
    "Est. Mise Cost (not authoritative)",
    "Notes",
  ];
  const rows = lines.map((l) =>
    [
      l.prepOrder.forDate.toISOString().slice(0, 10),
      l.destinationVenue.name,
      l.recipe.name,
      l.recipe.prodCode,
      l.lot ?? "",
      l.actualQty != null ? num(l.actualQty) : "",
      l.actualUnit ?? "",
      l.status,
      l.madeBy?.name ?? "",
      l.allocatedCost != null ? l.allocatedCost.toFixed(2) : "",
      l.notes ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.map(csvCell).join(","), ...rows].join("\n");

  const filename = `cost-transfer_${fromDate.toISOString().slice(0, 10)}_${toDate.toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
