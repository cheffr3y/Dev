import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { prepReportDates } from "@/lib/prep-report";

export default async function CostTransferReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; venue?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { from, to, fromDate, toDate } = prepReportDates(sp.from, sp.to);
  const venueId = sp.venue || "";
  const [venues, transfers, legacyCount] = await Promise.all([
    getVenues(),
    prisma.stockTransfer.findMany({
      where: { transferDate: { gte: fromDate, lte: toDate }, ...(venueId ? { venueId } : {}) },
      include: { venue: true, batch: { include: { recipe: true } }, exclusions: true },
      orderBy: [{ venue: { name: "asc" } }, { transferDate: "asc" }, { stableId: "asc" }],
    }),
    prisma.prepOrderLine.count({ where: { status: { in: ["MADE", "SHORT"] }, productionBatchId: null, prepOrder: { forDate: { gte: fromDate, lte: toDate } }, ...(venueId ? { destinationVenueId: venueId } : {}) } }),
  ]);
  const byVenue = new Map<string, { name: string; foodGross: number; excluded: number; foodNet: number; production: number; dishwasher: number; total: number }>();
  for (const transfer of transfers) {
    const row = byVenue.get(transfer.venueId) ?? { name: transfer.venue.name, foodGross: 0, excluded: 0, foodNet: 0, production: 0, dishwasher: 0, total: 0 };
    row.foodGross += transfer.foodCostBeforeExclusions;
    row.excluded += transfer.excludedFoodCost;
    row.foodNet += transfer.netFoodCost;
    row.production += transfer.productionLaborCost;
    row.dishwasher += transfer.dishwasherLaborCost;
    row.total += transfer.totalTransferCost;
    byVenue.set(transfer.venueId, row);
  }
  const exportQuery = new URLSearchParams({ from, to, ...(venueId ? { venue: venueId } : {}) }).toString();
  return <div>
    <div className="no-print mb-4 flex items-center justify-between"><Link href="/prep-orders/daily" className="text-sm text-blue-600 hover:underline">← Daily prep</Link><div className="flex gap-2"><Link href={`/prep-orders/report/export-xlsx?${exportQuery}`} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white" prefetch={false}>Export Excel</Link><Link href={`/prep-orders/report/export?${exportQuery}`} className="rounded-full border border-hairline bg-canvas px-5 py-2 text-sm" prefetch={false}>Export CSV</Link><PrintButton label="Print report" /></div></div>
    <PageHeader title="Cost-Transfer Report" subtitle="Venue charges by transfer date · Acumatica remains authoritative" />
    <Card className="no-print mb-6 p-4"><form className="flex flex-wrap items-end gap-3"><Field label="From"><Input name="from" type="date" defaultValue={from}/></Field><Field label="To"><Input name="to" type="date" defaultValue={to}/></Field><Field label="Venue"><Select name="venue" defaultValue={venueId}><option value="">All venues</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field><Button type="submit" variant="secondary">Apply</Button></form></Card>
    {legacyCount > 0 && <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>{legacyCount} legacy completed prep line{legacyCount === 1 ? "" : "s"}</strong> in this production-date range are preserved in the Excel legacy sheet and are not treated as transfers. Confirm current-day lines from Daily Prep when appropriate; do not backfill historical labor.</div>}
    <Card><CardHeader>Venue summary</CardHeader>{byVenue.size === 0 ? <p className="p-8 text-center text-sm text-zinc-400">No transfers in this date range.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase text-zinc-600"><tr><th className="px-3 py-2">Venue</th><th className="px-3 py-2 text-right">Food before</th><th className="px-3 py-2 text-right">Excluded food</th><th className="px-3 py-2 text-right">Net food</th><th className="px-3 py-2 text-right">Production labor</th><th className="px-3 py-2 text-right">Dishwasher labor</th><th className="px-3 py-2 text-right">Total transfer</th></tr></thead><tbody className="divide-y divide-zinc-100">{[...byVenue.values()].map((v) => <tr key={v.name}><td className="px-3 py-2 font-medium">{v.name}</td><td className="px-3 py-2 text-right">{money(v.foodGross)}</td><td className="px-3 py-2 text-right">{money(v.excluded)}</td><td className="px-3 py-2 text-right">{money(v.foodNet)}</td><td className="px-3 py-2 text-right">{money(v.production)}</td><td className="px-3 py-2 text-right">{money(v.dishwasher)}</td><td className="px-3 py-2 text-right font-semibold">{money(v.total)}</td></tr>)}</tbody></table></div>}</Card>
    <Card className="mt-6"><CardHeader>Transfer detail</CardHeader><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase text-zinc-600"><tr><th className="px-3 py-2">ID / date</th><th className="px-3 py-2">Venue</th><th className="px-3 py-2">Item / lot</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2">Source</th><th className="px-3 py-2 text-right">Food</th><th className="px-3 py-2 text-right">Prod</th><th className="px-3 py-2 text-right">Dish</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-zinc-100">{transfers.map((t) => <tr key={t.id}><td className="px-3 py-2"><p className="font-mono text-xs">{t.stableId}</p><p className="text-zinc-500">{t.transferDate.toISOString().slice(0,10)}</p></td><td className="px-3 py-2">{t.venue.code}</td><td className="px-3 py-2">{t.batch.recipe.name}<p className="font-mono text-xs text-zinc-500">{t.batch.lot}</p></td><td className="px-3 py-2 text-right">{num(t.quantity)} {unitLabel(t.unit)}</td><td className="px-3 py-2">{t.sourceType.replaceAll("_", " ").toLowerCase()}</td><td className="px-3 py-2 text-right">{money(t.netFoodCost)}</td><td className="px-3 py-2 text-right">{money(t.productionLaborCost)}</td><td className="px-3 py-2 text-right">{money(t.dishwasherLaborCost)}</td><td className="px-3 py-2 text-right font-semibold">{money(t.totalTransferCost)}</td></tr>)}</tbody></table></div></Card>
  </div>;
}
