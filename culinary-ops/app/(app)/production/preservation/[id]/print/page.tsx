import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { getPreservationBatch } from "@/lib/production/preservation-data";
import { preservationFactsSchema, preservationMetrics } from "@/lib/production/preservation";
import { allergenLabels, parseAllergens } from "@/lib/recipes/allergens";
import { preciseNum } from "@/lib/recipes/costing";
import { PrintController } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";
import { ProductionJobQr } from "@/components/ProductionJobQr";

export default async function PreservationLabel({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePrepUser(), { id } = await params, batch = await getPreservationBatch(user.id, id);
  if (!batch) notFound();
  const facts = preservationFactsSchema.parse(batch.facts), metrics = preservationMetrics(facts.input, facts.finished);
  return <PrintController className="paper-preview mx-auto max-w-[8.5in]" label="Print preservation label"><Link className="no-print mb-4 inline-block underline" href={`/production/preservation/${id}`}>← Batch details</Link>
    <article className="preservation-label atelier-paper break-inside-avoid border-2 border-black p-5 text-black" aria-label="Preservation batch label">
      <PrintSpecHeader venue={facts.venueName} title={facts.input.name} targetLabel={`Production: ${facts.input.productionDate}`} printedAt={new Date()} />
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><h1 className="text-3xl font-bold">{facts.input.name}</h1><p className="mt-2">{facts.input.method} · {facts.venueName}</p><p className="mt-2 break-all font-mono text-xs">Batch: {id}</p><p className="mt-3 text-xl font-bold">{batch.status === "VOID" ? "VOID — DO NOT USE THIS LABEL" : batch.status === "RUNNING" ? "IN PROCESS — YIELD PENDING" : "FINISHED BATCH"}</p></div><ProductionJobQr href={`/production/preservation/${id}`} label="Scan batch record" /></div>
      <div className="mt-5 space-y-3 border-t-2 border-black pt-4 text-lg"><p><strong>Produced:</strong> {facts.input.productionDate}</p><p><strong>Use-by:</strong> {facts.input.useBy || "NOT ASSIGNED"}</p><p><strong>Yield:</strong> {metrics.yieldPct === null ? "Pending" : `${preciseNum(metrics.yieldPct)}% · ${preciseNum(metrics.finished!)} ${facts.input.unit} net`}</p><p><strong>Allergens:</strong> {allergenLabels(parseAllergens(facts.allergens)) || "No recorded tags"}</p><p className="whitespace-pre-wrap"><strong>Shelf-life / storage:</strong> {facts.input.shelfLife || "Not assigned"}</p></div>
      <p className="print-write-in mt-5 border-t border-black pt-3">Cook / initials: ____________________</p>
    </article>
  </PrintController>;
}
