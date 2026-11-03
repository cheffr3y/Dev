import { localInvoiceDraftSchema } from "./invoice-parser";

export const invoiceStates = ["NEEDS_REVIEW", "IN_PROGRESS", "NEEDS_ATTENTION", "READY", "COMPLETE"] as const;
export type InvoiceState = typeof invoiceStates[number];
export const invoiceStateLabels: Record<InvoiceState, string> = { NEEDS_REVIEW: "Needs review", IN_PROGRESS: "In progress", NEEDS_ATTENTION: "Needs attention", READY: "Ready to finish", COMPLETE: "Complete" };
export function invoiceReviewFacts(input: { ocrDraft: unknown; ocrRevision: number; lineRevision: number; reviewedLineRevision: number | null; reviewedOcrRevision: number | null; reviewCompletedAt: Date | null; purchaseLines: { ocrLineKey: string | null; voided: boolean }[]; ocrDecisions: { lineKey: string }[] }) {
  const parsed = input.ocrDraft == null ? null : localInvoiceDraftSchema.safeParse(input.ocrDraft);
  const lines = parsed?.success ? parsed.data.lines : [];
  const resolved = new Set([...input.purchaseLines.flatMap(line => line.ocrLineKey ? [line.ocrLineKey] : []), ...input.ocrDecisions.map(line => line.lineKey)]);
  const pending = lines.filter(line => !resolved.has(line.key));
  const candidateLineCount = lines.length, reviewedCandidateCount = lines.length - pending.length;
  const ready = pending.length === 0 && (candidateLineCount > 0 || input.purchaseLines.length > 0) && parsed?.success !== false;
  let reviewState: InvoiceState;
  if (ready && input.reviewCompletedAt && input.reviewedLineRevision === input.lineRevision && input.reviewedOcrRevision === input.ocrRevision) reviewState = "COMPLETE";
  else if (ready) reviewState = "READY";
  else if (parsed?.success === false || pending.some(line => line.warnings.length > 0)) reviewState = "NEEDS_ATTENTION";
  else if (reviewedCandidateCount > 0 || input.purchaseLines.length > 0) reviewState = "IN_PROGRESS";
  else reviewState = "NEEDS_REVIEW";
  return { reviewState, candidateLineCount, reviewedCandidateCount, ready };
}
