import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { buildPurchasingList } from "@/lib/production/production-planning";
import { loadProductionPlanning } from "@/lib/production/production-planning-data";
import { countKey, orderLine } from "@/lib/production/purchase-count";
import { preciseNum } from "@/lib/recipes/costing";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";
import { ProductionJobQr } from "@/components/ProductionJobQr";
import { OnHandCount, type CountRow } from "@/components/OnHandCount";

// One on-hand count for a Combined purchasing list. Needs are recalculated
// live from the selected events; only the counted amounts are stored.
//   (default)    count on a phone or at the desk
//   ?sheet=count printable count sheet, blank on-hand column + QR
//   ?sheet=order printable order sheet by vendor

type Query = { sheet?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PurchaseCountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  await requireRole("MANAGER");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const count = await prisma.purchaseCount.findUnique({ where: { id }, include: { lines: true } });
  if (!count) notFound();

  const data = await loadProductionPlanning(count.fromDate, count.toDate, count.includeUndated);
  const wanted = new Set(count.sourceIds);
  const selected = data.sources.filter((source) => wanted.has(source.id));
  const list = buildPurchasingList(selected, data.recipes, data.items);
  const onHand = new Map(count.lines.map((line) => [countKey(line.itemId, line.unit), line.onHand]));
  const rows: CountRow[] = list.rows.map((row) => ({
    itemId: row.itemId, name: row.name, category: row.category, vendor: row.vendor, unit: row.unit,
    need: row.quantity, packQty: row.packQtyInUnit, packSize: row.packSize, review: row.basis !== "Raw purchase quantity",
  }));
  const sheet = first(query.sheet);
  const range = count.fromDate === count.toDate ? count.fromDate : `${count.fromDate} through ${count.toDate}`;
  const backToList = `/production?${new URLSearchParams([["from", count.fromDate], ["to", count.toDate], ["view", "shopping"], ...(count.includeUndated ? [["undated", "1"]] : []), ...count.sourceIds.map((s) => ["source", s])]).toString()}`;
  const missing = count.sourceIds.length - selected.length;
  const notices = <>
    {missing > 0 && <p role="alert" className="my-3 border-2 border-amber-500 p-3 text-sm">{missing === 1 ? "One selected job is" : `${missing} selected jobs are`} no longer active in this range, so {missing === 1 ? "its" : "their"} needs are left out. Start a new count if the plan changed.</p>}
    {list.warnings.length > 0 && <details className="my-3 border-2 border-amber-500 p-3 text-sm"><summary className="cursor-pointer font-semibold">{list.warnings.length} item{list.warnings.length === 1 ? "" : "s"} to review before ordering</summary><ul className="mt-2 list-disc pl-5">{list.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
  </>;

  if (sheet === "count") {
    const byCategory = groupBy(rows, (row) => row.category);
    return <div className="mx-auto max-w-[8.5in]">
      <SheetToolbar id={id} />
      <PrintSpecHeader venue="On-hand count" title="Count sheet" targetLabel={range} printedAt={new Date()} />
      <div className="mb-3 flex items-start justify-between gap-4">
        <p className="text-sm">Write what&apos;s on the shelf in the unit shown. Skip anything you didn&apos;t check; it orders the full need. Enter counts on a phone by scanning the code.</p>
        <div className="w-28 shrink-0"><ProductionJobQr href={`/production/counts/${id}`} label="Scan to enter counts" /></div>
      </div>
      {byCategory.map(([category, list]) => <section key={category} className="mb-4 break-inside-avoid-page">
        <h2 className="border-b-2 border-black pb-1 text-base font-semibold">{category}</h2>
        <table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase tracking-wider text-zinc-600"><th className="w-6 py-1"></th><th className="py-1">Ingredient</th><th className="py-1 text-right">Need</th><th className="w-40 py-1 text-right">On hand</th></tr></thead>
          <tbody>{list.map((row) => <tr key={countKey(row.itemId, row.unit)} className="border-b border-zinc-300">
            <td className="py-2 align-bottom"><span aria-hidden className="inline-block h-3 w-3 border border-black" /></td>
            <td className="py-2">{row.name}<span className="block text-xs text-zinc-600">{row.vendor}</span></td>
            <td className="py-2 text-right tabular-nums">{preciseNum(row.need)} {row.unit}</td>
            <td className="py-2 text-right align-bottom">______________ {row.unit}</td>
          </tr>)}</tbody></table>
      </section>)}
    </div>;
  }

  if (sheet === "order") {
    const lines = rows.map((row) => ({ row, line: orderLine(row.need, onHand.get(countKey(row.itemId, row.unit)), row.packQty) }));
    const toBuy = lines.filter(({ line }) => line.toOrder > 0);
    const uncounted = lines.filter(({ line }) => !line.counted).length;
    const byVendor = groupBy(toBuy, ({ row }) => row.vendor);
    return <div className="mx-auto max-w-[8.5in]">
      <SheetToolbar id={id} />
      <PrintSpecHeader venue="Order by vendor" title="Order sheet" targetLabel={range} printedAt={new Date()} />
      {notices}
      {uncounted > 0 && <p className="my-2 text-sm"><strong>{uncounted} item{uncounted === 1 ? " was" : "s were"} not counted</strong> and order the full need (marked &ldquo;not counted&rdquo;).</p>}
      {!toBuy.length && <p className="my-6 text-lg">Everything on this list is covered by what&apos;s on hand.</p>}
      {byVendor.map(([vendor, list]) => <section key={vendor} className="mb-5 break-inside-avoid-page">
        <h2 className="border-b-2 border-black pb-1 text-base font-semibold">{vendor} <span className="text-sm font-normal text-zinc-600">· {list.length} item{list.length === 1 ? "" : "s"}</span></h2>
        <table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase tracking-wider text-zinc-600"><th className="py-1">Ingredient</th><th className="py-1 text-right">Order</th><th className="py-1 text-right">Cases</th><th className="py-1 text-right">Need / on hand</th></tr></thead>
          <tbody>{list.map(({ row, line }) => <tr key={countKey(row.itemId, row.unit)} className="border-b border-zinc-300">
            <td className="py-2">{row.name}{row.packSize && <span className="block text-xs text-zinc-600">{row.packSize}</span>}{row.review && <span className="block text-xs font-semibold">Unit needs review</span>}</td>
            <td className="py-2 text-right font-semibold tabular-nums">{preciseNum(line.toOrder)} {row.unit}</td>
            <td className="py-2 text-right tabular-nums">{line.packs ?? "—"}</td>
            <td className="py-2 text-right text-xs tabular-nums text-zinc-600">{preciseNum(row.need)} / {line.counted ? `${preciseNum(onHand.get(countKey(row.itemId, row.unit)) ?? 0)}` : "not counted"}</td>
          </tr>)}</tbody></table>
      </section>)}
    </div>;
  }

  return <div className="mx-auto max-w-4xl">
    <PageHeader title="On-hand count" subtitle={`${range} · ${selected.length} job${selected.length === 1 ? "" : "s"} · started ${count.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}`} />
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <Link className="text-gold underline" href={backToList}>← Purchasing list</Link>
      <Link className="text-gold underline" href={`/production/counts/${id}?sheet=count`}>Print count sheet</Link>
      <Link className="rounded-full border border-ink px-4 py-1.5 font-medium text-ink" href={`/production/counts/${id}?sheet=order`}>Order sheet by vendor →</Link>
    </div>
    {notices}
    {rows.length ? <OnHandCount countId={id} rows={rows} initial={Object.fromEntries(onHand)} /> : <p className="my-6">No ingredient needs for the selected jobs. Check the purchasing list.</p>}
  </div>;
}

function SheetToolbar({ id }: { id: string }) {
  return <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
    <Link href={`/production/counts/${id}`} className="text-sm text-gold underline">← Back to the count</Link>
    <PrintButton label="Print / Save as PDF" />
  </div>;
}

function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
