import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { cascadeInvoiceCost } from "./invoice-cascade";

export const discardInvoiceSchema = z.object({
  documentId: z.string().min(1).max(150),
  lineRevision: z.number().int().nonnegative(),
  ocrRevision: z.number().int().nonnegative(),
  expenseRevision: z.number().int().nonnegative().nullable(),
}).strict();
const reason = "Discarded invoice and started over";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Remove a working invoice atomically; keep audited reversals of saved facts. */
export async function discardInvoice(db: PrismaClient, actorId: string, raw: unknown) {
  const input = discardInvoiceSchema.parse(raw);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, name: true } });
        if (!actor || actor.role === "STAFF") throw new Error("Manager access required.");
        const document = await tx.invoiceDocument.findUniqueOrThrow({ where: { id: input.documentId } });
        // Retrying a lost response must not reverse costs or append history again.
        if (document.reviewState === "DISCARDED") return { ok: true as const };
        const expense = await tx.operatingFoodExpense.findUnique({ where: { invoiceDocumentId: document.id } });
        if (document.lineRevision !== input.lineRevision || document.ocrRevision !== input.ocrRevision || (expense?.revision ?? null) !== input.expenseRevision) {
          return { ok: false as const, conflict: true, error: "Invoice changed in another session. Reload to review what will be discarded." };
        }
        const audit = (history: unknown, before: unknown, after: unknown) => json([...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), userId: actorId, userName: actor.name, reason, before, after }]);
        const lines = await tx.invoicePurchaseLine.findMany({ where: { invoiceDocumentId: document.id, voided: false }, orderBy: { id: "asc" } });
        // Void every line before choosing replacement costs, including other lines
        // on this invoice. Never briefly restore a price from the discarded work.
        for (const line of lines) {
          const { history, ...before } = line;
          await tx.invoicePurchaseLine.update({ where: { id: line.id }, data: { voided: true, revision: { increment: 1 }, history: audit(history, before, { ...before, voided: true }) } });
        }
        const items = new Map(lines.flatMap(line => line.itemId ? [[line.itemId, line.id] as const] : []));
        for (const [itemId, lineId] of items) await cascadeInvoiceCost(tx, itemId, lineId, document.id, actorId, false);
        if (expense && !expense.voided) {
          const { history, ...before } = expense;
          await tx.operatingFoodExpense.update({ where: { id: expense.id }, data: { voided: true, invoiceReferenceKey: null, revision: { increment: 1 }, history: audit(history, before, { ...before, voided: true, invoiceReferenceKey: null }) } });
          const day = await tx.operatingDay.findUnique({ where: { venueId_businessDate: { venueId: expense.venueId, businessDate: expense.invoiceDate } } });
          if (day?.foodReviewed) {
            const before = { grossSalesCents: day.grossSalesCents, laborCents: day.laborCents, foodReviewed: true, notes: day.notes };
            await tx.operatingDay.update({ where: { id: day.id }, data: { foodReviewed: false, revision: { increment: 1 }, history: audit(day.history, before, { ...before, foodReviewed: false }) } });
          }
        }
        await tx.invoiceReviewDraft.deleteMany({ where: { documentId: document.id } });
        await tx.invoiceOcrDecision.deleteMany({ where: { documentId: document.id } });
        // Release upload deduplication so even the identical PDF starts fresh.
        // The archived source remains available to the retained accounting audit.
        await tx.invoiceDocument.update({ where: { id: document.id }, data: {
          reviewState: "DISCARDED", fileHash: `discarded:${document.id}`, ocrDraft: Prisma.DbNull,
          ocrRevision: { increment: 1 }, lineRevision: { increment: 1 }, candidateLineCount: 0, reviewedCandidateCount: 0,
          reviewCompletedAt: null, reviewedLineRevision: null, reviewedOcrRevision: null, reviewedBy: actorId,
        } });
        return { ok: true as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Invoice is busy. Retry discarding it.");
}
