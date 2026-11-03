import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { refreshInvoiceReview } from "./inbox-data";

export async function completeInvoiceReview(db: PrismaClient, actorId: string, id: string, lineRevision: number, ocrRevision: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (!actor || actor.role === "STAFF") throw new Error("Manager access required.");
        const doc = await tx.invoiceDocument.findUniqueOrThrow({ where: { id }, select: { lineRevision: true, ocrRevision: true, reviewedLineRevision: true, reviewedOcrRevision: true, reviewCompletedAt: true } });
        if (doc.lineRevision !== lineRevision || doc.ocrRevision !== ocrRevision) throw new Error("Invoice changed. Reload and review its latest lines before finishing.");
        const state = await refreshInvoiceReview(tx, id);
        if (!state.ready) throw new Error("Resolve all candidate lines or enter the invoice manually before finishing review.");
        if (state.reviewState !== "COMPLETE") await tx.invoiceDocument.update({ where: { id }, data: { reviewState: "COMPLETE", reviewCompletedAt: new Date(), reviewedBy: actorId, reviewedLineRevision: lineRevision, reviewedOcrRevision: ocrRevision } });
        return { ok: true as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Invoice is busy. Retry finishing review.");
}
