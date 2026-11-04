import type { Prisma } from "@prisma/client";
import { invoiceReviewFacts } from "./inbox";

export async function refreshInvoiceReview(tx: Prisma.TransactionClient, id: string) {
  const document = await tx.invoiceDocument.findUniqueOrThrow({ where: { id }, select: { reviewState: true, ocrDraft: true, ocrRevision: true, lineRevision: true, reviewedLineRevision: true, reviewedOcrRevision: true, reviewCompletedAt: true,
    purchaseLines: { select: { ocrLineKey: true, voided: true } }, ocrDecisions: { select: { lineKey: true } } } });
  if (document.reviewState === "DISCARDED") throw new Error("This invoice was discarded.");
  const { ready, ...data } = invoiceReviewFacts(document);
  await tx.invoiceDocument.update({ where: { id }, data });
  return { ...data, ready };
}
