import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { num, componentBatchFactor } from "@/lib/recipes/costing";
import { dateFromParam, startOfUtcWeek, addDays, isoDate, fmtWeekRange } from "@/lib/banquets/banquet-week";
import { loadBanquetRevision } from "@/lib/banquets/banquet-baseline-data";
import { PrintController } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";
import { BanquetSetupPacket } from "@/components/BanquetSetupSheet";
import { ProductionJobQr } from "@/components/ProductionJobQr";
import { jobScanHref } from "@/lib/production/production-job-options";
import { RecipeReferences } from "@/components/RecipeReferences";
import { buildRecipeReferences } from "@/lib/recipes/recipe-references";
import { RecipeBuildCard, buildRecipeTree, recipeTreeSelect } from "@/components/RecipeBuild";

// Weekly convenience printing preserves one complete, independent event packet
// per banquet. Only purchasing combines demand across events.
export default async function WeekCookPacketPage({ params }: { params: Promise<{ date: string }> }) {
  await requirePrepUser();
  const { date } = await params;
  const requested = dateFromParam(date);
  if (!requested) notFound();
  const start = startOfUtcWeek(requested), end = addDays(start, 7);
  const [banquets, rows] = await Promise.all([
    prisma.banquet.findMany({ where: { date: { gte: start, lt: end }, status: { in: ["PLANNED", "CONFIRMED"] } },
      include: { venue: true, menuItems: { orderBy: { createdAt: "asc" } } }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
    prisma.recipe.findMany({ select: recipeTreeSelect }),
  ]);
  const byId = buildRecipeTree(rows);
  const revisions = new Map(await Promise.all(banquets.map(async b => [b.id, await loadBanquetRevision(b.id)] as const)));
  return <PrintController className="recipe-print recipe-packet mx-auto max-w-[8.5in]" label="Print event cook packets">
    <div className="no-print mb-5 flex flex-wrap justify-between gap-3"><Link className="text-gold underline" href={`/banquets/week/${isoDate(start)}`}>← Week overview</Link><Link className="text-gold underline" href={`/banquets/week/${isoDate(start)}/shopping-list`}>Combined shopping list</Link></div>
    <PrintSpecHeader venue={[...new Set(banquets.map(b => b.venue.name))].join(" / ") || "Banquets"} title="Weekly event cook packets" targetLabel={fmtWeekRange(start)} printedAt={new Date()} />
    <p className="my-3 text-sm">Separate quantities, instructions, and recipe references for every event. Shopping totals are combined only on the purchasing list.</p>
    {!banquets.length && <p>No active banquets this week.</p>}
    {banquets.map(b => {
      const label = `${b.name} · ${isoDate(b.date)} · ${b.venue.name}${b.timeLabel ? ` · ${b.timeLabel}` : " · Service time to confirm"}`;
      const dishes = b.menuItems.flatMap(line => {
        const node = byId.get(line.recipeId);
        return node ? [{ line, node, ...componentBatchFactor(line.orderedQty, line.unit, node.yieldQty, node.yieldUnit) }] : [];
      });
      const references = buildRecipeReferences(dishes.map(d => ({ node: d.node, totalBatches: d.batches })), byId);
      const prefix = `event-${b.id}-`;
      return <section key={b.id} className="event-cook-packet" data-event-id={b.id} aria-label={`Cook packet for ${b.name}`}>
        <header className="atelier-paper my-5 border-t-4 border-ink p-4"><h1 className="text-3xl font-semibold">{b.name}</h1><p className="mt-2">{label} · {b.guestCount} guests</p><p>{[b.location, b.areas].filter(Boolean).join(" · ")}</p>
          <p className="print-write-in mt-2">Prep ready by: ____________________ · Cook / initials: ____________________</p>
          {b.specialInstructions && <p className="mt-3 whitespace-pre-wrap font-semibold">{b.specialInstructions}</p>}{b.notes && <p className="mt-2 whitespace-pre-wrap">{b.notes}</p>}
        </header>
        <BanquetSetupPacket banquet={b} revisionData={revisions.get(b.id)} menu={b.menuItems.map(line => ({ id: line.id, name: byId.get(line.recipeId)?.name || "Missing recipe", orderedQty: line.orderedQty, unit: line.unit }))} />
        {!dishes.length && <p>No dishes entered for this event.</p>}
        <div className="recipe-packet-builds mt-6 space-y-8">{dishes.map(d => <RecipeBuildCard key={d.line.id} node={d.node} byId={byId} totalBatches={d.batches}
          compact={false} depth={0} stack={new Set()} references={references} referencePrefix={prefix} contextLabel={label}
          projectCode={<ProductionJobQr href={jobScanHref({ kind: "BANQUET", lineId: d.line.id })} />}
          context={<><p>Event quantity: <strong className="tabular-nums">{num(d.line.orderedQty)} {d.line.unit}</strong></p>{d.line.description && <p className="whitespace-pre-wrap">{d.line.description}</p>}{b.specialInstructions && <p className="whitespace-pre-wrap font-semibold">{b.specialInstructions}</p>}{!d.converted && <p className="recipe-scaling-warning font-semibold">Ordered units do not convert to the recipe yield. Verify this event&apos;s batch size manually.</p>}</>} />)}</div>
        <RecipeReferences references={references} byId={byId} referencePrefix={prefix} contextLabel={label} />
      </section>;
    })}
  </PrintController>;
}
