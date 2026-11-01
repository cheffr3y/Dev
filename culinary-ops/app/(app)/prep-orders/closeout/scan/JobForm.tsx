"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { durationLabel, elapsedMinutes, type JobSource } from "@/lib/production/production-job-options";
import { startJob, finishJob, reviewJob } from "./actions";

export function JobForm({ source, cookName, job, canFinish, admin, currentTime }: {
  source: JobSource; cookName: string;
  job: { id: string; startedAt: string; finishedAt: string | null; reviewedAt: string | null; expectedUnit: string; actualQty: number | null; actualUnit: string | null } | null;
  canFinish: boolean; admin: boolean; currentTime: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date(currentTime).getTime());
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!job || job.finishedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  return <div className="space-y-4">
    {job && !job.finishedAt && <p className="text-xl font-semibold tabular-nums" aria-label="Elapsed time">{durationLabel(elapsedMinutes(job.startedAt, new Date(now)))}</p>}
    {!job ? <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
      try { const result = await startJob(source, String(data.get("cookName"))); if (!result.ok) { setError(result.error); return; } router.replace(`/prep-orders/closeout/scan?job=${result.jobId}`); router.refresh(); }
      catch { setError("Connection interrupted. Tap Start project again to retrieve the same timer."); } finally { setBusy(false); }
    }}>
      <Field label="Cook / initials"><Input name="cookName" defaultValue={cookName} required maxLength={120} /></Field>
      <Button disabled={busy} type="submit" className="min-h-12 w-full">{busy ? "Starting…" : "Start project"}</Button>
    </form> : !job.finishedAt && canFinish ? <form className="space-y-4" onChange={() => setDirty(true)} onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
      try {
        const result = await finishJob({ jobId: job.id, actualQty: Number(data.get("actualQty")), actualUnit: String(data.get("actualUnit")), notes: String(data.get("notes")), labeledAndDated: data.get("labeledAndDated") === "on" });
        if (!result.ok) { setError(result.error); return; } setDirty(false); router.refresh();
      } catch { setError("Connection interrupted. Keep these values and retry to retrieve the original submission."); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-4">
        <Field label="Actual yield produced"><Input name="actualQty" type="number" inputMode="decimal" min="0" max="100000000" step="any" required /></Field>
        <Field label="Yield unit"><Input name="actualUnit" defaultValue={job.expectedUnit} required maxLength={40} /></Field>
        <Field label="Shift / quality notes" hint="Include shortages, problems, or why nothing was produced."><Textarea aria-label="Shift / quality notes" name="notes" maxLength={5000} /></Field>
        <label className="flex items-start gap-3 rounded-lg border border-hairline p-4 text-sm"><input className="mt-0.5 h-5 w-5 shrink-0" name="labeledAndDated" type="checkbox" required /><span>Finished: product is labeled and dated, or no product was made to label.</span></label>
        <Button type="submit" className="min-h-12 w-full">{busy ? "Submitting…" : "Finish & submit for review"}</Button>
      </fieldset>
    </form> : !job.finishedAt ? <p className="text-sm text-zinc-500">This project is running. Its cook or a manager can finish it.</p> : <p role="status" className="font-medium">{job.reviewedAt ? "Reviewed by an admin." : "Submitted. Waiting for admin review."}</p>}
    {job?.finishedAt && !job.reviewedAt && admin && <form className="space-y-3 border-t border-hairline pt-4" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
      try { const result = await reviewJob(job.id, String(data.get("reviewNote")), { quantity: Number(data.get("reviewedQty")), unit: String(data.get("reviewedUnit")) }); if (!result.ok) setError(result.error); else router.refresh(); }
      catch { setError("The review could not be saved. Retry to check its status."); } finally { setBusy(false); }
    }}>
      <div className="grid grid-cols-2 gap-3"><Field label="Reviewed yield"><Input name="reviewedQty" type="number" min="0" max="100000000" step="any" defaultValue={job.actualQty ?? ""} required /></Field><Field label="Reviewed unit"><Input name="reviewedUnit" defaultValue={job.actualUnit ?? job.expectedUnit} maxLength={40} required /></Field></div>
      <Field label="Admin review note"><Textarea name="reviewNote" maxLength={5000} /></Field>
      <Button type="submit" disabled={busy} className="min-h-12 w-full">Mark reviewed</Button>
      <p className="text-xs text-zinc-500">Yield corrections need an explanation and preserve the cook’s original submission. Use the daily worksheet to confirm deliveries, labor, and charges.</p>
    </form>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
