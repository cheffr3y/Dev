import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePrepUser } from "@/lib/prep-session";
import { businessDate, chicagoToday } from "@/lib/prep-dates";
import { addDays, isoDate, startOfUtcWeek } from "@/lib/banquet-week";
import { loadProductionTarget } from "@/lib/production-jobs";
import { sourceFromQuery, jobSourceSchema, jobScanHref, durationLabel, elapsedMinutes } from "@/lib/production-job-options";
import { Badge, Card, PageHeader, LinkButton } from "@/components/ui";
import { JobForm } from "./JobForm";

const jobInclude = { startedBy: { select: { name: true } }, finishedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } } as const;
type Query = { job?: string; prep?: string; banquet?: string; date?: string; week?: string; recipe?: string; event?: string; scale?: string; type?: string };
const fmtTime = (date: Date) => date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
export default async function ScanProjectPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requirePrepUser();
  const query = await searchParams;
  let source;
  try { source = sourceFromQuery(query); } catch { return <Card className="p-5">This project link is invalid. <Link href="/prep-orders">Open daily prep</Link></Card>; }
  let job = query.job ? await prisma.productionJob.findUnique({ where: { id: query.job }, include: jobInclude }) : null;
  if (query.job && !job) notFound();
  let target: Awaited<ReturnType<typeof loadProductionTarget>> | null = null;
  if (source && !job) {
    if (source.kind === "BANQUET") job = await prisma.productionJob.findUnique({ where: { targetKey: `BANQUET:${source.lineId}` }, include: jobInclude });
    if (!job) {
      try { target = await loadProductionTarget(source); }
      catch { return <Card className="p-5"><h1 className="text-xl font-semibold">Project unavailable</h1><p className="mt-2">This project was removed or has no printed lot yet.</p><Link href="/prep-orders" className="mt-3 inline-block underline">Open daily prep</Link></Card>; }
      job = await prisma.productionJob.findUnique({ where: { targetKey: target.targetKey }, include: jobInclude });
    }
  }
  if (job || target) {
    const facts = job ?? target!;
    const ref = job ? jobSourceSchema.parse(job.sourceRef) : source!;
    const day = isoDate(facts.businessDate);
    const closed = facts.kind === "PREP" && !!(await prisma.productionCloseout.findUnique({ where: { businessDate: facts.businessDate } }))?.finalizedAt;
    return <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title={facts.recipeName} subtitle={facts.contextLabel} />
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><Badge color={job?.reviewedAt ? "green" : job?.finishedAt ? "amber" : job ? "blue" : "gray"}>{job?.reviewedAt ? "Reviewed" : job?.finishedAt ? "Awaiting review" : job ? "In progress" : "Ready to start"}</Badge><span className="text-sm tabular-nums">{day}</span></div>
        {facts.lot && <p className="text-sm">Lot <strong className="tabular-nums">{facts.lot}</strong></p>}
        <p className="text-sm">Planned: {facts.expectedQty == null ? "Verify quantity" : Number(facts.expectedQty.toFixed(4))} {facts.expectedUnit}{facts.printScale !== 1 ? ` · ${facts.printScale}× print copy` : ""}</p>
        {job && <div className="space-y-1 text-sm">
          <p>Cook: <strong>{job.cookName}</strong> · Started by {job.startedBy.name}</p><p>Started {fmtTime(job.startedAt)}</p>
          {job.finishedAt && <><p>Finished {fmtTime(job.finishedAt)} · Recorded by {job.finishedBy?.name}</p><p className="text-lg font-semibold">{durationLabel(elapsedMinutes(job.startedAt, job.finishedAt))} elapsed</p><p>Cook-reported yield: <strong>{job.actualQty} {job.actualUnit}</strong> · Labeled and dated</p></>}
          {job.notes && <p className="whitespace-pre-wrap pt-2">{job.notes}</p>}
          {job.reviewedAt && <p className="pt-2">Reviewed yield: <strong>{job.reviewedQty} {job.reviewedUnit}</strong> · Reviewed by {job.reviewedBy?.name} · {fmtTime(job.reviewedAt)}{job.reviewNote ? ` · ${job.reviewNote}` : ""}</p>}
        </div>}
        <p className="text-xs text-zinc-500">Elapsed time includes cooking and waiting. It is recorded separately from person-minutes used for accounting.</p>
        {!job && (closed || !target?.available) ? <p>This project is completed or cancelled. Its saved records are read-only.</p> : <JobForm key={`${job?.id ?? "new"}-${!!job?.finishedAt}-${!!job?.reviewedAt}`} source={ref} cookName={user.name} canFinish={user.role !== "STAFF" || user.id === job?.startedByUserId} admin={user.role === "ADMIN"} currentTime={new Date().toISOString()}
          job={job ? { id: job.id, startedAt: job.startedAt.toISOString(), finishedAt: job.finishedAt?.toISOString() ?? null, reviewedAt: job.reviewedAt?.toISOString() ?? null, expectedUnit: job.expectedUnit, actualQty: job.actualQty, actualUnit: job.actualUnit } : null} />}
      </Card>
      <div className="flex flex-wrap gap-3"><LinkButton variant="secondary" href={`/prep-orders/closeout/scan?date=${day}`}>Other projects</LinkButton>{user.role === "ADMIN" && <LinkButton href={facts.kind === "PREP" ? `/prep-orders/closeout?date=${day}` : `/prep-orders/jobs?date=${day}`}>Admin review</LinkButton>}</div>
    </div>;
  }

  let start: Date;
  try { start = query.week ? startOfUtcWeek(businessDate(query.week)) : businessDate(query.date ?? chicagoToday()); }
  catch { return <Card className="p-5">Choose a valid production date.</Card>; }
  const end = addDays(start, query.week ? 7 : 1), day = isoDate(start);
  const [prep, banquets, jobs] = await Promise.all([
    query.type === "BANQUET" ? Promise.resolve([]) : prisma.prepOrderLine.findMany({ where: { lot: { not: null }, prepOrder: { forDate: { gte: start, lt: end } }, ...(query.recipe ? { recipeId: query.recipe } : {}) }, include: { recipe: { select: { name: true } }, destinationVenue: { select: { name: true } } }, orderBy: { id: "asc" } }),
    query.type === "PREP" ? Promise.resolve([]) : prisma.banquetMenuItem.findMany({ where: { ...(query.recipe ? { recipeId: query.recipe } : {}), banquet: { date: { gte: start, lt: end }, status: { in: ["PLANNED", "CONFIRMED"] }, ...(query.event ? { id: query.event } : {}) } }, include: { recipe: { select: { name: true } }, banquet: { select: { name: true } } }, orderBy: { id: "asc" } }),
    prisma.productionJob.findMany({ where: { businessDate: { gte: start, lt: end }, ...(["PREP", "BANQUET"].includes(query.type ?? "") ? { kind: query.type } : {}), ...(query.recipe ? { recipeId: query.recipe } : {}) }, orderBy: { startedAt: "desc" }, take: 100 }),
  ]);
  const uniquePrep = [...new Map(prep.map(line => [`${line.recipeId}:${line.lot}`, line])).values()];
  return <div className="mx-auto max-w-2xl space-y-5">
    <PageHeader title="Production projects" subtitle={`${day}${query.week ? " · Week view" : ""} · Choose your work, then start its timer.`} />
    <form className="flex gap-2">{query.type && <input type="hidden" name="type" value={query.type} />}{query.recipe && <input type="hidden" name="recipe" value={query.recipe} />}<input aria-label="Production date" name="date" type="date" defaultValue={day} className="min-h-11 rounded border border-hairline bg-canvas p-2" /><button className="rounded border border-hairline px-4">View</button></form>
    {uniquePrep.length === 0 && banquets.length === 0 && <Card className="p-5">No printed prep lots or active banquet projects for this date.</Card>}
    {uniquePrep.map(line => <Link key={line.id} href={jobScanHref({ kind: "PREP", lineId: line.id, scale: 1 })} className="block rounded-lg border border-hairline bg-canvas p-4"><strong>{line.recipe.name}</strong><span className="mt-1 block text-sm text-zinc-500">Prep · Lot {line.lot}</span></Link>)}
    {banquets.map(line => <Link key={line.id} href={jobScanHref({ kind: "BANQUET", lineId: line.id })} className="block rounded-lg border border-hairline bg-canvas p-4"><strong>{line.recipe.name}</strong><span className="mt-1 block text-sm text-zinc-500">{line.banquet.name} · {line.orderedQty} {line.unit}</span></Link>)}
    {jobs.length > 0 && <section className="space-y-3"><h2 className="font-semibold">Recent project logs</h2>{jobs.map(log => <Link key={log.id} href={`/prep-orders/closeout/scan?job=${log.id}`} className="block rounded-lg border border-hairline p-4 text-sm">{log.recipeName} · {log.cookName} · {log.reviewedAt ? "Reviewed" : log.finishedAt ? "Awaiting review" : "In progress"}</Link>)}</section>}
    {user.role === "ADMIN" && <LinkButton href={`/prep-orders/jobs?date=${day}`}>Review project logs</LinkButton>}
  </div>;
}
