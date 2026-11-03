import { Prisma, type PrismaClient } from "@prisma/client";
import { reviewDraftSchema, serializeReviewDraft } from "./review-draft";

export async function saveInvoiceReviewDraft(db: PrismaClient, userId: string, documentId: string, expectedRevision: number, raw: unknown) {
  const payload = reviewDraftSchema.parse(raw);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!actor || actor.role === "STAFF") throw new Error("Manager access required.");
        const document = await tx.invoiceDocument.findUnique({ where: { id: documentId }, select: { ocrRevision: true } });
        if (!document) throw new Error("Invoice unavailable.");
        if (payload.sourceRevision > document.ocrRevision || (payload.sourceRevision < document.ocrRevision && payload.rows.length > 0)) return { ok: false as const, conflict: true, error: "Recognition changed. Reload before continuing this draft." };
        const where = { userId_documentId: { userId, documentId } };
        const current = await tx.invoiceReviewDraft.findUnique({ where });
        // A lost save response may be retried without advancing twice.
        if (current && serializeReviewDraft(reviewDraftSchema.parse(current.payload)) === serializeReviewDraft(payload)) return { ok: true as const, revision: current.revision };
        if ((current?.revision ?? 0) !== expectedRevision) return { ok: false as const, conflict: true, error: "This draft changed in another tab. Reload to use the saved draft; your current entries are still visible." };
        const data = { payload: payload as Prisma.InputJsonValue };
        const saved = current
          ? await tx.invoiceReviewDraft.update({ where, data: { ...data, revision: { increment: 1 } } })
          : await tx.invoiceReviewDraft.create({ data: { ...data, userId, documentId, revision: 1 } });
        return { ok: true as const, revision: saved.revision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Draft is busy. Retry saving.");
}
