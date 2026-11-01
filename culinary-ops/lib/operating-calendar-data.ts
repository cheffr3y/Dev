import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { businessDate } from "./prep-dates";
import { dollarsToCents, operatingEditSchema, operatingMonth, type OperatingDayData, type FoodExpenseData } from "./operating-calendar";

export type OperatingSaveResult = { ok: true; revision: number } | { ok: false; error: string; conflict?: boolean };
const conflict = (): OperatingSaveResult => ({ ok: false, conflict: true, error: "This record changed in another session. Your entry is kept. Reload the latest record before saving." });
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const same = (row: object, state: object) => Object.entries(state).every(([key, value]) => {
  const actual = (row as Record<string, unknown>)[key];
  return actual instanceof Date && value instanceof Date ? actual.getTime() === value.getTime() : actual === value;
});
function history(previous: unknown, userId: string, reason: string, before: unknown, after: unknown, userName: string) {
  return json([...(Array.isArray(previous) ? previous : []), { at: new Date().toISOString(), userId, userName, reason, before, after }]);
}
const dayFacts = (day: { grossSalesCents: number | null; laborCents: number | null; foodReviewed: boolean; notes: string }) => ({ grossSalesCents: day.grossSalesCents, laborCents: day.laborCents, foodReviewed: day.foodReviewed, notes: day.notes });
const expenseFacts = (expense: { venueId: string; invoiceDate: Date; amountCents: number; description: string; invoiceDocumentId: string | null; voided: boolean }) => ({ venueId: expense.venueId, invoiceDate: expense.invoiceDate.toISOString().slice(0, 10), amountCents: expense.amountCents, description: expense.description, invoiceDocumentId: expense.invoiceDocumentId, voided: expense.voided });

export async function saveOperatingRecord(db: PrismaClient, userId: string, input: unknown): Promise<OperatingSaveResult> {
  const parsed = operatingEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check the entry." };
  const edit = parsed.data;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, name: true } });
        if (!user || user.role === "STAFF") return { ok: false, error: "Manager access is required." };
        if (!await tx.venue.findUnique({ where: { id: edit.venueId }, select: { id: true } })) return { ok: false, error: "Choose an existing venue." };
        if (edit.kind === "day") {
          const business = businessDate(edit.date);
          const current = await tx.operatingDay.findUnique({ where: { venueId_businessDate: { venueId: edit.venueId, businessDate: business } } });
          const state = { grossSalesCents: dollarsToCents(edit.grossSales), laborCents: dollarsToCents(edit.labor), foodReviewed: edit.foodReviewed, notes: edit.notes };
          if (current && same(current, state)) return { ok: true, revision: current.revision };
          if (current ? edit.revision !== current.revision : edit.revision != null) return conflict();
          if (current && !edit.reason) return { ok: false, error: "Add a reason for correcting an existing daily entry." };
          if (state.foodReviewed) {
            const expenses = await tx.operatingFoodExpense.findMany({ where: { venueId: edit.venueId, invoiceDate: business, voided: false, invoiceLineRevision: { not: null } }, include: { invoiceDocument: { select: { lineRevision: true } } } });
            if (expenses.some(expense => expense.invoiceLineRevision !== expense.invoiceDocument?.lineRevision)) return { ok: false, error: "Invoice lines changed. Confirm the updated invoice food total before completing this day." };
          }
          const audit = history(current?.history, userId, edit.reason || "Initial daily entry", current ? dayFacts(current) : null, state, user.name);
          const saved = current ? await tx.operatingDay.update({ where: { id: current.id }, data: { ...state, revision: { increment: 1 }, history: audit } })
            : await tx.operatingDay.create({ data: { venueId: edit.venueId, businessDate: business, ...state, history: audit, createdBy: userId } });
          return { ok: true, revision: saved.revision };
        }
        const current = await tx.operatingFoodExpense.findUnique({ where: { id: edit.id } });
        const amountCents = dollarsToCents(edit.amount, true);
        if (amountCents == null || amountCents === 0 && edit.invoiceLineRevision == null) return { ok: false, error: "Enter a nonzero food amount; use a negative amount for an invoice credit." };
        if (!current && edit.voided) return { ok: false, error: "Save a spending entry before voiding it." };
        const document = edit.invoiceDocumentId ? await tx.invoiceDocument.findUnique({ where: { id: edit.invoiceDocumentId }, select: { id: true, vendorId: true, invoiceNumber: true, lineRevision: true, purchaseLines: { where: { voided: false }, select: { amountCents: true, countsAsFood: true, invoiceDate: true, venueId: true, vendorId: true } } } }) : null;
        if (edit.invoiceDocumentId && !document) return { ok: false, error: "That invoice document is unavailable." };
        if (current?.invoiceDocumentId && edit.invoiceDocumentId !== current.invoiceDocumentId) return { ok: false, error: "Keep the original invoice link. Void an incorrect entry before replacing it." };
        if (edit.invoiceLineRevision != null) {
          if (!document || document.lineRevision !== edit.invoiceLineRevision || !document.purchaseLines.length) return { ok: false, conflict: true, error: "Invoice lines changed or no active lines exist. Reload and review the line total." };
          const total = document.purchaseLines.filter(line => line.countsAsFood).reduce((sum, line) => sum + line.amountCents, 0);
          if (total !== amountCents || document.purchaseLines.some(line => line.invoiceDate.toISOString().slice(0, 10) !== edit.invoiceDate || line.venueId !== edit.venueId)) return { ok: false, error: "Use the reviewed food-line total, invoice date, and venue. Correct inconsistent invoice lines before posting." };
        }
        const supplierId = document?.vendorId || document?.purchaseLines[0]?.vendorId;
        const reference = supplierId && document?.invoiceNumber?.trim()
          ? JSON.stringify([supplierId, document.invoiceNumber.trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ")]) : null;
        const state = { venueId: edit.venueId, invoiceDate: businessDate(edit.invoiceDate), amountCents, description: edit.description, invoiceDocumentId: edit.invoiceDocumentId, invoiceReferenceKey: edit.voided ? null : reference, invoiceLineRevision: edit.invoiceLineRevision, voided: edit.voided };
        if (current && same(current, state)) return { ok: true, revision: current.revision };
        if (current ? edit.revision !== current.revision : edit.revision != null) return conflict();
        if (current && !edit.reason) return { ok: false, error: "Add a reason for correcting or voiding an existing food entry." };
        const duplicate = await tx.operatingFoodExpense.findFirst({ where: { id: { not: edit.id }, OR: [
          ...(edit.invoiceDocumentId ? [{ invoiceDocumentId: edit.invoiceDocumentId }] : []),
          ...(state.invoiceReferenceKey ? [{ invoiceReferenceKey: state.invoiceReferenceKey }] : []),
        ] } });
        if (duplicate) return { ok: false, error: "This invoice is already linked to food spending. Open its existing entry to correct it." };
        const audit = history(current?.history, userId, edit.reason || "Initial food entry", current ? expenseFacts(current) : null, expenseFacts(state), user.name);
        const saved = current ? await tx.operatingFoodExpense.update({ where: { id: current.id }, data: { ...state, history: audit, revision: { increment: 1 } } })
          : await tx.operatingFoodExpense.create({ data: { id: edit.id, ...state, history: audit, createdBy: userId } });
        // Late invoices/credits reopen the affected day's food review. Preserve
        // all manually entered sales and labor, and record why review reopened.
        const affected = new Map([[`${state.venueId}:${edit.invoiceDate}`, { venueId: state.venueId, businessDate: state.invoiceDate }]]);
        if (current) affected.set(`${current.venueId}:${current.invoiceDate.toISOString().slice(0, 10)}`, { venueId: current.venueId, businessDate: current.invoiceDate });
        for (const key of affected.values()) {
          const day = await tx.operatingDay.findUnique({ where: { venueId_businessDate: key } });
          if (!day?.foodReviewed) continue;
          const before = dayFacts(day), after = { ...before, foodReviewed: false };
          await tx.operatingDay.update({ where: { id: day.id }, data: { foodReviewed: false, revision: { increment: 1 }, history: history(day.history, userId, "Food spending changed; review reopened", before, after, user.name) } });
        }
        return { ok: true, revision: saved.revision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 2) continue;
        return error.code === "P2002" ? { ok: false, error: "This invoice or daily entry was saved in another session. Reload to review it." } : conflict();
      }
      return { ok: false, error: error instanceof Prisma.PrismaClientKnownRequestError ? "Could not save this entry. Reload and try again." : error instanceof Error ? error.message : "Could not save the entry." };
    }
  }
  return conflict();
}

export async function loadOperatingMonth(venueId: string, month: string): Promise<{ entries: OperatingDayData[]; expenses: FoodExpenseData[] }> {
  const { start, end } = operatingMonth(month);
  const [entries, expenses] = await Promise.all([
    prisma.operatingDay.findMany({ where: { venueId, businessDate: { gte: start, lt: end } }, orderBy: { businessDate: "asc" } }),
    prisma.operatingFoodExpense.findMany({ where: { venueId, invoiceDate: { gte: start, lt: end } }, include: { invoiceDocument: { select: { filename: true, vendor: { select: { name: true } }, invoiceNumber: true, lineRevision: true } } }, orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }] }),
  ]);
  return { entries: entries.map(row => ({ id: row.id, venueId: row.venueId, businessDate: row.businessDate.toISOString().slice(0, 10), grossSalesCents: row.grossSalesCents, laborCents: row.laborCents, foodReviewed: row.foodReviewed, notes: row.notes, revision: row.revision, history: row.history })),
    expenses: expenses.map(row => ({ id: row.id, venueId: row.venueId, invoiceDate: row.invoiceDate.toISOString().slice(0, 10), amountCents: row.amountCents, description: row.description, invoiceDocumentId: row.invoiceDocumentId, voided: row.voided, revision: row.revision, history: row.history, invoiceLineRevision: row.invoiceLineRevision, invoiceReviewPending: !row.voided && row.invoiceLineRevision != null && row.invoiceLineRevision !== row.invoiceDocument?.lineRevision,
      invoice: row.invoiceDocument ? { filename: row.invoiceDocument.filename, vendor: row.invoiceDocument.vendor?.name ?? null, invoiceNumber: row.invoiceDocument.invoiceNumber } : null })) };
}
