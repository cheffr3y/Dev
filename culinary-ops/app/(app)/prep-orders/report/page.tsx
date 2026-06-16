import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { money, num } from "@/lib/costing";
import { convertQty, unitLabel } from "@/lib/units";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { prepStatusLabel, PREP_STATUS_COLOR, type PrepStatus } from "@/lib/prep";

// The artifact handed to accounting. Quantity per item per destination venue is
// the contract; Mise cost is a clearly-labeled, non-authoritative sanity check.
// Accounting applies their own Acumatica pricing to these quantities.

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7); // weekly cadence (assumed)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function CostTransferReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; venue?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const venueId = sp.venue || "";

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T23:59:59Z`);

  const [venues, lines] = await Promise.all([
    getVenues(),
    prisma.prepOrderLine.findMany({
      where: {
        status: { in: ["MADE", "SHORT"] }, // produced & transferred
        ...(venueId ? { destinationVenueId: venueId } : {}),
        prepOrder: { forDate: { gte: fromDate, lte: toDate } },
      },
      include: {
        recipe: { select: { name: true, prodCode: true, yieldUnit: true } },
        destinationVenue: { select: { id: true, name: true, code: true } },
        prepOrder: { select: { forDate: true } },
        madeBy: { select: { name: true } },
      },
      orderBy: [{ destinationVenue: { name: "asc" } }, { recipe: { name: "asc" } }, { prepOrder: { forDate: "asc" } }],
    }),
  ]);

  // Rollup: venue → (recipe + unit) → summed qty + cost.
  type Roll = { recipe: string; prodCode: string; unit: string; qty: number; cost: number; lines: number };
  const byVenue = new Map<string, { name: string; rows: Map<string, Roll> }>();
  for (const l of lines) {
    const v = byVenue.get(l.destinationVenue.id) ?? { name: l.destinationVenue.name, rows: new Map() };
    const unit = l.actualUnit ?? l.requestedUnit;
    const key = `${l.recipeId}|${unit}`;
    const row = v.rows.get(key) ?? { recipe: l.recipe.name, prodCode: l.recipe.prodCode, unit, qty: 0, cost: 0, lines: 0 };
    row.qty += l.actualQty ?? 0;
    row.cost += l.allocatedCost ?? 0;
    row.lines += 1;
    v.rows.set(key, row);
    byVenue.set(l.destinationVenue.id, v);
  }

  const grandCost = lines.reduce((s, l) => s + (l.allocatedCost ?? 0), 0);

  // Yield insight: requested vs actual per recipe (converted to yield unit).
  type Yield = { recipe: string; prodCode: string; unit: string; requested: number; actual: number; convertible: boolean };
  const yields = new Map<string, Yield>();
  for (const l of lines) {
    const y =
      yields.get(l.recipeId) ??
      { recipe: l.recipe.name, prodCode: l.recipe.prodCode, unit: l.recipe.yieldUnit, requested: 0, actual: 0, convertible: true };
    const req = convertQty(l.requestedQty, l.requestedUnit, l.recipe.yieldUnit);
    const act = convertQty(l.actualQty ?? 0, l.actualUnit ?? l.requestedUnit, l.recipe.yieldUnit);
    if (req == null || act == null) y.convertible = false;
    else {
      y.requested += req;
      y.actual += act;
    }
    yields.set(l.recipeId, y);
  }
  const yieldRows = [...yields.values()].filter((y) => y.convertible && y.requested > 0);

  const exportQuery = new URLSearchParams({ from, to, ...(venueId ? { venue: venueId } : {}) }).toString();

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/prep-orders" className="text-sm text-blue-600 hover:underline">
          ← Prep orders
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/prep-orders/report/export?${exportQuery}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-medium tracking-wide text-ink transition-colors hover:border-ink"
            prefetch={false}
          >
            Export CSV
          </Link>
          <PrintButton label="Print report" />
        </div>
      </div>

      <PageHeader title="Cost-Transfer Report" subtitle="Quantity per item per destination venue — the contract with accounting." />

      {/* Filters */}
      <Card className="no-print mb-6 p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Field label="From">
              <Input name="from" type="date" defaultValue={from} />
            </Field>
          </div>
          <div className="w-44">
            <Field label="To">
              <Input name="to" type="date" defaultValue={to} />
            </Field>
          </div>
          <div className="w-48">
            <Field label="Venue">
              <Select name="venue" defaultValue={venueId}>
                <option value="">All venues</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </Card>

      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <span className="font-semibold">Quantity is the source of truth.</span> The cost column is{" "}
        <span className="font-semibold">estimated — Mise basis, not authoritative</span>. Accounting applies Acumatica
        pricing to these quantities.
      </div>

      {byVenue.size === 0 ? (
        <Card className="p-8 text-center text-sm text-zinc-400">
          No produced lines in this range. Adjust the filters above.
        </Card>
      ) : (
        <div className="space-y-6">
          {[...byVenue.values()].map((v) => {
            const rows = [...v.rows.values()].sort((a, b) => a.recipe.localeCompare(b.recipe));
            const venueCost = rows.reduce((s, r) => s + r.cost, 0);
            return (
              <Card key={v.name}>
                <CardHeader>{v.name}</CardHeader>
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 font-medium">Code</th>
                      <th className="px-4 py-2 text-right font-medium">Quantity</th>
                      <th className="px-4 py-2 text-right font-medium">Est. Mise cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((r) => (
                      <tr key={`${r.recipe}-${r.unit}`}>
                        <td className="px-4 py-2 text-zinc-800">{r.recipe}</td>
                        <td className="px-4 py-2 font-mono text-[12px] text-zinc-500">{r.prodCode}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-zinc-900">
                          {num(r.qty)} {unitLabel(r.unit)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{money(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                      <td className="px-4 py-2 text-zinc-700" colSpan={3}>
                        {v.name} estimated total
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-900">{money(venueCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            );
          })}

          <div className="rounded-lg bg-stone p-5">
            <p className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Grand estimated Mise cost (all venues)</p>
            <p className="mt-2 font-display text-3xl tracking-tight text-ink">{money(grandCost)}</p>
            <p className="mt-1 text-xs text-zinc-500">Estimate only — accounting rebuilds authoritative cost in Acumatica.</p>
          </div>
        </div>
      )}

      {/* Per-line drill-down (audit) */}
      {lines.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
            Per-line drill-down ({lines.length} lines)
          </summary>
          <Card className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Venue</th>
                  <th className="px-3 py-2 font-medium">Recipe</th>
                  <th className="px-3 py-2 font-medium">Lot</th>
                  <th className="px-3 py-2 text-right font-medium">Req.</th>
                  <th className="px-3 py-2 text-right font-medium">Actual</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Made by</th>
                  <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-zinc-600">
                      {l.prepOrder.forDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{l.destinationVenue.code}</td>
                    <td className="px-3 py-2 text-zinc-800">{l.recipe.name}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-zinc-500">{l.lot}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                      {num(l.requestedQty)} {unitLabel(l.requestedUnit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                      {l.actualQty != null ? `${num(l.actualQty)} ${unitLabel(l.actualUnit ?? "")}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={PREP_STATUS_COLOR[l.status as PrepStatus]}>{prepStatusLabel(l.status)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{l.madeBy?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{money(l.allocatedCost ?? 0)}</td>
                    <td className="px-3 py-2 text-zinc-500">{l.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </details>
      )}

      {/* Yield insight */}
      {yieldRows.length > 0 && (
        <Card className="mt-8">
          <CardHeader>Yield Insight · requested vs actual</CardHeader>
          <p className="px-4 pt-3 text-xs text-zinc-500">
            Persistent deltas flag recipes whose stated yield may be wrong. Line notes (drill-down above) explain why.
          </p>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">Recipe</th>
                <th className="px-4 py-2 text-right font-medium">Requested</th>
                <th className="px-4 py-2 text-right font-medium">Actual</th>
                <th className="px-4 py-2 text-right font-medium">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {yieldRows
                .sort((a, b) => Math.abs(b.actual - b.requested) - Math.abs(a.actual - a.requested))
                .map((y) => {
                  const delta = y.actual - y.requested;
                  const pctDelta = (delta / y.requested) * 100;
                  const off = Math.abs(pctDelta) >= 10;
                  return (
                    <tr key={y.recipe}>
                      <td className="px-4 py-2 text-zinc-800">
                        {y.recipe} <span className="font-mono text-[11px] text-zinc-400">{y.prodCode}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                        {num(y.requested)} {unitLabel(y.unit)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                        {num(y.actual)} {unitLabel(y.unit)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${off ? "text-red-600" : "text-zinc-500"}`}>
                        {delta >= 0 ? "+" : ""}
                        {num(delta)} ({pctDelta >= 0 ? "+" : ""}
                        {pctDelta.toFixed(0)}%)
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
