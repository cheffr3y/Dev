import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { getPreservationBatch } from "@/lib/production/preservation-data";
import { preservationCatalogCost, preservationFactsSchema, preservationMetrics } from "@/lib/production/preservation";
import { allergenLabels, parseAllergens } from "@/lib/recipes/allergens";
import { money, preciseNum } from "@/lib/recipes/costing";
import { Card, CardHeader, PageHeader, LinkButton } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { PreservationFinishForm, PreservationPostButton, PreservationVoidForm } from "../PreservationForms";

export default async function PreservationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePrepUser(), { id } = await params, batch = await getPreservationBatch(user.id, id);
  if (!batch) notFound();
  const facts = preservationFactsSchema.parse(batch.facts), metrics = preservationMetrics(facts.input, facts.finished), manager = user.role !== "STAFF";
  const item = facts.item ? await prisma.item.findUnique({ where: { id: facts.item.id }, select: { id: true, name: true, unit: true, unitCost: true } }) : null;
  const proposal = item ? preservationCatalogCost(facts, item.unit) : null;
  return <div><Link href="/production/preservation" className="text-sm underline">← Preservation batches</Link><PageHeader title={facts.input.name} subtitle={`${facts.input.method} · ${facts.venueName} · ${batch.status}`} action={<LinkButton href={`/production/preservation/${id}/print`} variant="secondary">Print batch label</LinkButton>} />
    {facts.void && <p className="mb-4 border-2 border-red-500 p-3 font-semibold">VOID · {facts.void.reason} · {facts.void.actorName}</p>}
    <div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><h2 className="mb-3 font-semibold">Recorded batch</h2><dl className="space-y-2 text-sm">
      <Record label="Batch ID" value={id} /><Record label="Production date" value={facts.input.productionDate} /><Record label="Source recipe" value={facts.recipe ? `${facts.recipe.name} v${facts.recipe.version}` : "Not linked"} /><Record label="Finished ingredient" value={facts.item?.name ?? "Not linked"} />
      <Record label="Initial gross / tare" value={`${preciseNum(facts.input.wetGross)} / ${preciseNum(facts.input.wetTare)} ${facts.input.unit}`} /><Record label="Initial net weight" value={`${preciseNum(metrics.wet)} ${facts.input.unit}`} />
      <Record label="Finished gross / tare" value={facts.finished ? `${preciseNum(facts.finished.gross)} / ${preciseNum(facts.finished.tare)} ${facts.input.unit}` : "Pending"} />
      <Record label="Finished net weight" value={metrics.finished === null ? "Pending" : `${preciseNum(metrics.finished)} ${facts.input.unit}`} /><Record label="Yield" value={metrics.yieldPct === null ? "Pending" : `${preciseNum(metrics.yieldPct)}%`} />
      <Record label={metrics.lossPct !== null && metrics.lossPct < 0 ? "Weight gain" : "Weight loss / moisture-loss estimate"} value={metrics.lossPct === null ? "Pending" : `${preciseNum(Math.abs(metrics.lossPct))}%`} />
      <Record label="Total input cost" value={money(facts.input.inputCost, 5)} /><Record label="Cost source" value={facts.input.costNotes} /><Record label={`Finished cost / ${facts.input.unit}`} value={metrics.unitCost === null ? "Unavailable (no positive finished weight)" : money(metrics.unitCost, 5)} />
      <Record label="Equipment" value={facts.input.equipment || "Not recorded"} /><Record label="Temperature" value={facts.input.temperature === null ? "Not recorded" : `${facts.input.temperature}°${facts.input.temperatureUnit}`} /><Record label="Humidity" value={facts.input.humidity === null ? "Not recorded" : `${facts.input.humidity}%`} /><Record label="Planned cycle" value={facts.input.cycleMinutes === null ? "Not recorded" : `${facts.input.cycleMinutes} minutes`} />
      <Record label="Started" value={<LocalTime date={facts.input.startedAt} />} /><Record label="Finished" value={facts.finished ? <LocalTime date={facts.finished.finishedAt} /> : "Pending"} /><Record label="Actual elapsed" value={metrics.elapsedMinutes === null ? "In progress" : `${preciseNum(metrics.elapsedMinutes)} minutes`} />
      <Record label="Allergens (captured)" value={allergenLabels(parseAllergens(facts.allergens)) || "No recorded tags"} /><Record label="Assigned use-by" value={facts.input.useBy || "Not assigned"} /><Record label="Shelf-life / storage" value={facts.input.shelfLife || "Not assigned"} />
    </dl><p className="mt-4 whitespace-pre-wrap text-sm">{facts.input.notes}</p>{facts.finished?.notes && <p className="mt-3 whitespace-pre-wrap text-sm">Finish notes: {facts.finished.notes}</p>}<p className="mt-4 text-xs text-zinc-500">Weight change includes all material losses or gains; it is not a direct moisture measurement.</p></Card>
      <div className="space-y-4">{batch.status === "RUNNING" && (manager || batch.createdById === user.id) && <Card><CardHeader>Record finished yield</CardHeader><div className="p-4"><PreservationFinishForm id={id} revision={batch.revision} unit={facts.input.unit} /></div></Card>}
        <Card><CardHeader>Catalog cost</CardHeader><div className="space-y-3 p-4">{facts.posting ? <p className="text-sm">Applied {money(facts.posting.cost, 5)} / {facts.posting.unit} by {facts.posting.actorName} · <LocalTime date={facts.posting.at} />. Previous cost: {money(facts.posting.previousCost, 5)}.</p> : <><p className="text-sm text-zinc-500">The catalog changes only when a manager applies the reviewed finished cost. No inventory, prep charges or accounting entries are created.</p>{manager && batch.status === "FINISHED" && proposal !== null && item ? <><p className="font-medium">{item.name}</p><PreservationPostButton id={id} revision={batch.revision} expectedCost={item.unitCost} expectedUnit={item.unit} cost={proposal} /></> : <p className="text-sm">{batch.status === "VOID" ? "Voided batches cannot post prices." : !manager ? "Manager review is required to apply catalog prices." : !facts.finished ? "Finish the batch first." : !item ? "No current linked catalog ingredient." : "Posting needs a positive finished weight and a weight-based catalog unit."}</p>}</>}</div></Card>
        <Card><CardHeader>History</CardHeader><ul className="space-y-2 p-4 text-sm">{batch.audits.map(entry => <li key={entry.id}>{entry.action} · {entry.actorName} · <LocalTime date={entry.createdAt} /></li>)}</ul></Card>
        {manager && batch.status !== "VOID" && !facts.posting && <details className="rounded border border-hairline p-4"><summary className="cursor-pointer text-sm">Void an incorrect batch</summary><p className="my-3 text-xs text-zinc-500">Original facts and history are retained. Start a new batch for corrected measurements.</p><PreservationVoidForm id={id} revision={batch.revision} /></details>}
      </div>
    </div>
  </div>;
}
function Record({ label, value }: { label: string; value: React.ReactNode }) { return <div className="grid min-w-0 grid-cols-2 gap-3"><dt className="text-zinc-500">{label}</dt><dd className="break-words text-right tabular-nums">{value}</dd></div>; }
