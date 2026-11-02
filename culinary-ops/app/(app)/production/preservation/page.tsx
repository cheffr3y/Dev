import Link from "next/link";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { listPreservationBatches } from "@/lib/production/preservation-data";
import { preservationFactsSchema, preservationMetrics } from "@/lib/production/preservation";
import { preciseNum } from "@/lib/recipes/costing";
import { Card, PageHeader, LinkButton } from "@/components/ui";

export default async function PreservationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const query = await searchParams;
  const status = query.status === "RUNNING" || query.status === "FINISHED" || query.status === "VOID" ? query.status : undefined;
  const user = await requirePrepUser(), batches = await listPreservationBatches(user.id, status);
  return <div><Link className="text-sm underline" href="/production">← Production planning</Link><PageHeader title="Preservation batches" subtitle="Dehydration, freeze-drying, curing and fermentation · Latest 100 visible batches" action={<LinkButton href="/production/preservation/new">New preservation batch</LinkButton>} />
    <form className="mb-4 flex items-end gap-3"><label className="text-sm">Status<select name="status" aria-label="Preservation status filter" className="ml-2 rounded border border-hairline bg-canvas p-2" defaultValue={status ?? ""}><option value="">All</option><option value="RUNNING">Running</option><option value="FINISHED">Finished</option><option value="VOID">Void</option></select></label><button className="rounded border border-hairline px-3 py-2 text-sm">Filter batches</button></form>
    <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Batch / method</th><th className="p-3 text-left">Venue / production date</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Net yield</th><th className="p-3 text-left">Use-by</th></tr></thead><tbody>{batches.map(batch => {
      const facts = preservationFactsSchema.parse(batch.facts), metrics = preservationMetrics(facts.input, facts.finished);
      return <tr key={batch.id} className="border-t border-hairline"><td className="p-3"><Link className="font-medium underline" href={`/production/preservation/${batch.id}`}>{facts.input.name}</Link><span className="block text-xs text-zinc-500">{facts.input.method} · {facts.input.equipment}</span></td><td className="p-3">{facts.venueName}<span className="block text-xs">{facts.input.productionDate}</span></td><td className="p-3">{batch.status}{facts.posting && <span className="block text-xs">Cost posted</span>}</td><td className="p-3 text-right tabular-nums">{metrics.finished === null ? "Pending" : `${preciseNum(metrics.finished)} ${facts.input.unit} · ${preciseNum(metrics.yieldPct!)}%`}</td><td className="p-3">{facts.input.useBy || "Not assigned"}</td></tr>;
    })}{!batches.length && <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No preservation batches are visible yet.</td></tr>}</tbody></table></div></Card></div>;
}
