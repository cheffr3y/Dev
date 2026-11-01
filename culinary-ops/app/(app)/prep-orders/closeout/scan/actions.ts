"use server";
import { revalidatePath } from "next/cache";
import { requirePrepUser } from "@/lib/prep-session";
import { startProductionJob, finishProductionJob, reviewProductionJob } from "@/lib/production-jobs";
function refresh() { revalidatePath("/prep-orders", "layout"); revalidatePath("/"); }
export async function startJob(source: unknown, cookName: string) {
  const user = await requirePrepUser();
  try { const job = await startProductionJob(user.id, source, cookName); refresh(); return { ok: true as const, jobId: job.id }; }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Unable to start. Retry to retrieve the existing project." }; }
}
export async function finishJob(payload: unknown) {
  const user = await requirePrepUser();
  try { const job = await finishProductionJob(user.id, payload); refresh(); return { ok: true as const, jobId: job.id }; }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Unable to submit. Retry the same results." }; }
}
export async function reviewJob(jobId: string, note: string, reviewedYield?: unknown) {
  const user = await requirePrepUser("ADMIN");
  try { await reviewProductionJob(user.id, jobId, note, reviewedYield); refresh(); return { ok: true as const }; }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Unable to save the review." }; }
}
