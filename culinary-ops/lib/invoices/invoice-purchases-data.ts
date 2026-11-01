import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma";
import { businessDate } from "../prep/prep-dates";
import { dollarsToCents } from "../accounting/operating-calendar";
import { invoicePurchaseSchema, normalizedInvoicePrice, type InvoicePurchaseData } from "./invoice-purchases";
import type { OperatingSaveResult } from "../accounting/operating-calendar-data";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function saveInvoicePurchase(db: PrismaClient, userId: string, input: unknown): Promise<OperatingSaveResult> {
  const parsed = invoicePurchaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check the invoice line." };
  const edit = parsed.data;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, name: true } });
        if (!user || user.role === "STAFF") return { ok: false, error: "Manager access required." };
        const [doc, current, item, vendor, venue] = await Promise.all([
          tx.invoiceDocument.findUnique({ where: { id: edit.invoiceDocumentId }, select: { id: true, vendorId: true } }),
          tx.invoicePurchaseLine.findUnique({ where: { id: edit.id } }), edit.itemId ? tx.item.findUnique({ where: { id: edit.itemId }, select: { name: true, unit: true } }) : null,
          tx.vendor.findUnique({ where: { id: edit.vendorId }, select: { id: true } }), tx.venue.findUnique({ where: { id: edit.venueId }, select: { id: true } }),
        ]);
        if (!doc || !vendor || !venue || edit.itemId && !item) return { ok: false, error: "Choose an existing invoice, supplier, venue, and ingredient." };
        if (doc.vendorId && doc.vendorId !== edit.vendorId) return { ok: false, error: "Use the supplier recorded on this invoice." };
        if (current && current.invoiceDocumentId !== doc.id) return { ok: false, error: "An invoice line cannot be moved to another document." };
        const otherVendor = await tx.invoicePurchaseLine.findFirst({ where: { invoiceDocumentId: doc.id, voided: false, vendorId: { not: edit.vendorId }, id: { not: edit.id } }, select: { id: true } });
        if (otherVendor) return { ok: false, error: "All active lines on this invoice must use the same supplier." };
        const amountCents = dollarsToCents(edit.amount, true);
        if (amountCents == null || amountCents === 0) return { ok: false, error: "Enter the paid line amount; use negative amounts for credits." };
        const price = item ? normalizedInvoicePrice(amountCents, edit.quantity, edit.packQty, edit.packUnit, item.unit) : null;
        const state = { invoiceDocumentId: doc.id, venueId: edit.venueId, vendorId: edit.vendorId, itemId: edit.itemId,
          invoiceDate: businessDate(edit.invoiceDate), description: edit.description, quantity: edit.quantity,
          purchaseUnit: edit.purchaseUnit, packQty: edit.packQty, packUnit: edit.packUnit, amountCents,
          itemName: item?.name ?? null, normalizedUnit: item?.unit ?? null, normalizedUnitCost: price,
          countsAsFood: edit.countsAsFood, voided: edit.voided };
        if (current && Object.entries(state).every(([key, value]) => { const old = (current as unknown as Record<string, unknown>)[key]; return old instanceof Date && value instanceof Date ? old.getTime() === value.getTime() : old === value; })) return { ok: true, revision: current.revision };
        if (current ? current.revision !== edit.revision : edit.revision != null) return { ok: false, conflict: true, error: "This invoice line changed. Reload before saving; your entry is kept." };
        if (current && !edit.reason) return { ok: false, error: "Explain the invoice-line correction or void." };
        if (!current && edit.voided) return { ok: false, error: "Save the line before voiding it." };
        const before = current ? { description: current.description, amountCents: current.amountCents, itemId: current.itemId, itemName: current.itemName, quantity: current.quantity, packQty: current.packQty, packUnit: current.packUnit, invoiceDate: current.invoiceDate, venueId: current.venueId, vendorId: current.vendorId, countsAsFood: current.countsAsFood, voided: current.voided, normalizedUnitCost: current.normalizedUnitCost, normalizedUnit: current.normalizedUnit } : null;
        const history = json([...(Array.isArray(current?.history) ? current.history : []), { at: new Date().toISOString(), userId, userName: user.name, reason: edit.reason || "Reviewed invoice line", before, after: state }]);
        const saved = current ? await tx.invoicePurchaseLine.update({ where: { id: current.id }, data: { ...state, history, revision: { increment: 1 } } })
          : await tx.invoicePurchaseLine.create({ data: { id: edit.id, ...state, history, createdBy: userId } });
        await tx.invoiceDocument.update({ where: { id: doc.id }, data: { lineRevision: { increment: 1 } } });
        const expense = await tx.operatingFoodExpense.findUnique({ where: { invoiceDocumentId: doc.id } });
        if (expense && !expense.voided && expense.invoiceLineRevision != null) {
          const day = await tx.operatingDay.findUnique({ where: { venueId_businessDate: { venueId: expense.venueId, businessDate: expense.invoiceDate } } });
          if (day?.foodReviewed) {
            const before = { grossSalesCents: day.grossSalesCents, laborCents: day.laborCents, foodReviewed: true, notes: day.notes };
            const audit = json([...(Array.isArray(day.history) ? day.history : []), { at: new Date().toISOString(), userId, userName: user.name, reason: "Invoice lines changed; confirm food total again", before, after: { ...before, foodReviewed: false } }]);
            await tx.operatingDay.update({ where: { id: day.id }, data: { foodReviewed: false, revision: { increment: 1 }, history: audit } });
          }
        }
        return { ok: true, revision: saved.revision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      return { ok: false, error: error instanceof Prisma.PrismaClientKnownRequestError ? "Another edit arrived or the line could not be saved. Reload and retry." : error instanceof Error ? error.message : "Unable to save invoice line." };
    }
  }
  return { ok: false, error: "Reload and retry the invoice line." };
}
export async function loadInvoicePurchases(id: string): Promise<InvoicePurchaseData[]> {
  const rows = await prisma.invoicePurchaseLine.findMany({ where: { invoiceDocumentId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return rows.map(row => ({ ...row, invoiceDate: row.invoiceDate.toISOString().slice(0, 10) }));
}
