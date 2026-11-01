import Link from "next/link";
import { requirePrepUser } from "@/lib/prep-session";
import { hasRole } from "@/lib/session";
import { chicagoToday } from "@/lib/prep-dates";
import { addDays, isoDate } from "@/lib/banquet-week";
import { planningRange, buildPurchasingList } from "@/lib/production-planning";
import { loadProductionPlanning } from "@/lib/production-planning-data";
import { preciseNum } from "@/lib/costing";
import { Card, PageHeader } from "@/components/ui";
import { PrintController } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
export default async function ProductionPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requirePrepUser();
  const canPurchase = hasRole(user, "MANAGER");
  const query = await searchParams;
  const from = first(query.from) || chicagoToday();
  const to = first(query.to) || isoDate(addDays(new Date(`${chicagoToday()}T00:00:00Z`), 6));
  const undated = query.undated === "1";
  const shopping = query.view === "shopping" && canPurchase;
  let error = "";
  try { planningRange(from, to); } catch (e) { error = (e as Error).message; }
  const data = error ? null : await loadProductionPlanning(from, to, undated);
  const requested = new Set(typeof query.source === "string" ? [query.source] : query.source ?? []);
  const selected = data?.sources.filter(source => requested.has(source.id)) ?? [];
  const list = shopping && data ? buildPurchasingList(selected, data.recipes, data.items) : null;
  const staleSelection = requested.size !== selected.length;
  return <PrintController className="production-planning">
    <div className="no-print"><PageHeader title="Production planning" subtitle="Separate event work for cooks · Combined shopping for purchasing" />
      <div className="mb-4 flex flex-wrap gap-4 text-sm"><Link className="text-gold underline" href="/prep-orders">Daily prep</Link>{user.role === "ADMIN" && <Link className="text-gold underline" href="/prep-orders/closeout">Accounting closeout</Link>}</div>
      <form className="mb-6 space-y-4 rounded border border-hairline p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">From<input className="block rounded border p-2" aria-label="Planning from" name="from" type="date" defaultValue={from} required /></label>
          <label className="text-sm">Through<input className="block rounded border p-2" aria-label="Planning through" name="to" type="date" defaultValue={to} required /></label>
          <label className="text-sm"><input type="checkbox" name="undated" value="1" defaultChecked={undated} /> Include undated To-Go plans</label>
          <button className="rounded border px-3 py-2 text-sm" name="view" value="events">Show event work</button>
        </div>
        <p className="text-xs text-zinc-500">Up to 31 days · Active banquets/festivals and unfinished prep. To-Go dates are order cutoffs, not service dates; undated plans are included only when selected above. Prep deadlines require confirmation on each event sheet.</p>
        {canPurchase && data && <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Select events / jobs for purchasing</legend>
          {data.sources.map(source => <label key={source.id} className="flex items-start gap-2 rounded border border-hairline p-2 text-sm"><input className="mt-1" type="checkbox" name="source" value={source.id} defaultChecked={requested.has(source.id)} />
            <span>{source.name} <span className="text-xs text-zinc-500">· {source.kind} · {source.date ?? "Undated"} · {source.destination}</span></span></label>)}
          <button name="view" value="shopping" className="rounded border border-gold px-3 py-2 text-sm font-semibold">Combine selected shopping lists</button>
          <p className="text-xs text-zinc-500">Combines ingredient needs for purchasing. Each cook packet stays with its own event. Check for duplicated demand if the same event is also represented by a Daily Prep request.</p>
        </fieldset>}
      </form>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
    </div>
    {data && <>
      <PrintSpecHeader venue="Selected events / destinations" title={shopping ? "Combined purchasing list" : "Event work summaries"} targetLabel={`${from} through ${to}`} printedAt={new Date()} />
      {shopping ? <article className="atelier-paper p-4">
        <h1 className="text-2xl font-semibold">Combined shopping · {selected.length} selected jobs</h1>
        <p className="my-2 text-sm">Purchasing estimate using current vendor/pack/usable-yield settings. Frozen prep quantities retain their saved recipe contents. Check stock, pack sizes, and source overlaps before ordering. Event cook work remains separate.</p>
        {staleSelection && <p role="alert" className="my-3 border-2 border-amber-500 p-3">Some selected jobs are no longer in this range or are completed/cancelled. Reselect jobs before ordering.</p>}
        {!selected.length && <p className="my-4">Select at least one event or prep job above.</p>}
        <ul className="my-4 list-disc pl-5 text-sm">{selected.map(source => <li key={source.id}>{source.name} · {source.dateLabel}: {source.date ?? "Unspecified"} · {source.destination}</li>)}</ul>
        {!!list?.warnings.length && <section className="my-4 border-2 border-amber-500 p-3 text-sm" aria-label="Purchasing review"><strong>Incomplete / review required</strong><ul className="mt-2 list-disc pl-5">{list.warnings.map(w => <li key={w}>{w}</li>)}</ul></section>}
        <div className="overflow-x-auto"><table className="atelier-table purchasing-table w-full text-left text-sm"><thead><tr><th>Vendor / ingredient</th><th>Required quantity</th><th>Pack reference</th><th>Event contributions</th><th>Stock checked / order</th></tr></thead>
          <tbody>{list?.rows.map(row => <tr key={row.key}>
            <td><span className="block text-xs">{row.vendor} · {row.category}</span><strong>{row.name}</strong>{row.sku && <span className="block text-xs">SKU {row.sku}</span>}</td>
            <td className="tabular-nums">{preciseNum(row.quantity)} {row.unit}<span className="block font-sans text-xs">{row.basis}</span></td><td>{row.packSize || "Confirm vendor pack"}{row.suggestedPacks != null && <span className="block text-xs">{row.suggestedPacks} packs before stock</span>}</td>
            <td>{row.contributions.map(part => <p key={part.sourceId} className="mb-1 text-xs">{part.event}: <strong>{preciseNum(part.quantity)} {row.unit}</strong></p>)}</td>
            <td className="print-write-in min-w-28">[  ] Stock<br />Order: __________</td>
          </tr>)}</tbody></table></div>
        {selected.length > 0 && !list?.rows.length && <p className="my-4">No calculable ingredient demand. Review source quantities and mappings above.</p>}
      </article> : <>
        {!data.sources.length && <Card className="p-6">No active event or prep work in this range.</Card>}
        {data.sources.map(source => <article key={source.id} className="event-work-sheet atelier-paper mb-6 border border-hairline p-4" aria-label={`Work for ${source.name}`}>
          <h2 className="text-xl font-semibold">{source.name}</h2>
          <p className="mt-1 text-sm">{source.kind} · {source.dateLabel}: {source.date ?? "Unspecified"} · {source.time}</p>
          <p className="mt-1 text-sm"><strong>Destination:</strong> {source.destination}</p>
          <p className="print-write-in my-2 text-sm">Prep ready by: ____________________ · Cook / initials: ____________________</p>
          {source.notes && <p className="my-3 whitespace-pre-wrap border-l-2 border-gold pl-3 text-sm">{source.notes}</p>}
          <div className="no-print my-3 flex flex-wrap gap-4 text-sm"><Link className="text-gold underline" href={source.href}>Open event / request</Link><Link className="text-gold underline" href={source.packetHref}>Event cook / packing sheet</Link></div>
          <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Recipe / work</th><th>Event quantity</th><th>Instructions</th><th>Done / initials</th></tr></thead><tbody>{source.lines.map(line => <tr key={line.id}><td>{line.name}</td><td className="tabular-nums">{line.quantity == null ? "Quantity to confirm" : `${preciseNum(line.quantity)} ${line.unit}`}</td><td className="whitespace-pre-wrap">{line.notes}{line.warning && <p className="font-semibold text-amber-800">{line.warning}</p>}</td><td className="print-write-in">[  ] __________</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-xs">Event reference: {source.id} · Work summary; use this event&apos;s recipe packet for cooking methods and critical notes.</p>
        </article>)}
      </>}
    </>}
  </PrintController>;
}
