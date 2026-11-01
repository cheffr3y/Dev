import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { businessDate, chicagoToday } from "@/lib/prep/prep-dates";
import { durationLabel, elapsedMinutes } from "@/lib/production/production-job-options";
import { Card, PageHeader, Badge } from "@/components/ui";
export default async function ProductionJobsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requirePrepUser("ADMIN");
  const query = await searchParams;
  let date: Date;
  try { date = businessDate(query.date ?? chicagoToday()); }
  catch { return <Card className="p-5">Choose a valid production date.</Card>; }
  const day = date.toISOString().slice(0, 10);
  const jobs = await prisma.productionJob.findMany({ where: { businessDate: date }, include: { reviewedBy: { select: { name: true } } }, orderBy: [{ reviewedAt: { sort: "asc", nulls: "first" } }, { startedAt: "asc" }], take: 201 });
  return <div className="space-y-5">
    <PageHeader title="Production job review" subtitle="Cook start/finish times, actual yields, and quality notes. Review before entering prep charges." />
    <form className="flex gap-2"><input aria-label="Production date" name="date" type="date" defaultValue={day} className="rounded border border-hairline bg-canvas p-2" /><button className="rounded border border-hairline px-4">View day</button></form>
    <p className="text-sm text-zinc-500">Elapsed time includes waiting and unattended cooking. It does not replace labor person-minutes. Open a project to review its timestamps and results.</p>
    {jobs.length > 200 && <p>Showing the first 200 jobs for this day.</p>}
    <Card className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Project", "Cook", "Status", "Elapsed", "Actual yield", "Notes / review"].map(title => <th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{jobs.slice(0, 200).map(job => <tr key={job.id} className="border-t border-hairline">
      <td className="p-3"><Link href={`/prep-orders/closeout/scan?job=${job.id}`} className="font-medium text-blue-600 underline">{job.recipeName}</Link><span className="block text-xs text-zinc-500">{job.contextLabel}{job.lot ? ` · Lot ${job.lot}` : ""}</span></td>
      <td className="p-3">{job.cookName}</td><td className="p-3"><Badge color={job.reviewedAt ? "green" : job.finishedAt ? "amber" : "blue"}>{job.reviewedAt ? "Reviewed" : job.finishedAt ? "Awaiting review" : "In progress"}</Badge></td>
      <td className="whitespace-nowrap p-3 tabular-nums">{job.finishedAt ? durationLabel(elapsedMinutes(job.startedAt, job.finishedAt)) : "Running"}</td>
      <td className="whitespace-nowrap p-3 tabular-nums">{job.actualQty == null ? "—" : job.reviewedAt ? `${job.reviewedQty} ${job.reviewedUnit} (reviewed)` : `${job.actualQty} ${job.actualUnit}`}</td>
      <td className="max-w-sm whitespace-pre-wrap p-3">{job.notes || "—"}{job.reviewedAt && <span className="mt-1 block text-xs text-zinc-500">Reviewed by {job.reviewedBy?.name}{job.reviewNote ? ` · ${job.reviewNote}` : ""}</span>}</td>
    </tr>)}</tbody></table>{jobs.length === 0 && <p className="p-5 text-sm text-zinc-500">No project logs for this date.</p>}</Card>
    <Link href={`/prep-orders/closeout?date=${day}`} className="inline-block text-sm text-blue-600 underline">Open daily worksheet</Link>
  </div>;
}
