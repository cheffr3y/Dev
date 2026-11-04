import { isDeepStrictEqual } from "node:util";
import { measurementSelect, measurementSnapshot, measurementVersion, type IngredientMeasure } from "../ingredients/measurements";
import { refreshInvoiceReview } from "./inbox-data";
import { normalizedObservation, priceVariance, varianceThreshold } from "./price-trends";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma";
import { businessDate } from "../prep/prep-dates";
import { dollarsToCents } from "../accounting/operating-calendar";
import { invoicePurchaseSchema, normalizedInvoicePrice, invoiceNormalizationMeasure, type InvoicePurchaseData } from "./invoice-purchases";
import type { OperatingSaveResult } from "../accounting/operating-calendar-data";
import { cascadeInvoiceCost } from "./invoice-cascade";
import { rememberInvoiceAlias } from "./invoice-learning-data";
import { localInvoiceDraftSchema } from "./invoice-parser";
import { isRemovedInvoiceDecision } from "./invoice-decisions";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function learnPurchase(tx: Prisma.TransactionClient, userId: string, lineId: string, revision: number, edit: ReturnType<typeof invoicePurchaseSchema.parse>) {
  if (!edit.remember || edit.voided || !edit.itemId) return;
  const id = `purchase-learning:${lineId}:${revision}`;
  if (await tx.invoiceLearningEvent.findUnique({ where: { id } })) return;
  // Food-spend inclusion is an accounting choice, not an OCR ignore rule.
  // Only the explicit Ignore control trains ignored aliases.
  await rememberInvoiceAlias(tx, { vendorId: edit.vendorId, rawCode: edit.rawCode, description: edit.description, itemId: edit.itemId, isIgnored: false, defaultUnit: edit.purchaseUnit, defaultPackQty: edit.packQty, defaultPackUnit: edit.packUnit });
  await tx.invoiceLearningEvent.create({ data: { id, actorId: userId, requestHash: id, result: json({ lineId, revision, learned: true }) } });
}
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
          tx.invoiceDocument.findUnique({ where: { id: edit.invoiceDocumentId }, select: { id: true, vendorId: true, ocrDraft: true, reviewState: true } }),
          tx.invoicePurchaseLine.findUnique({ where: { id: edit.id } }), edit.itemId ? tx.item.findUnique({ where: { id: edit.itemId }, select: { name: true, unit: true, ...measurementSelect } }) : null,
          tx.vendor.findUnique({ where: { id: edit.vendorId }, select: { id: true } }), tx.venue.findUnique({ where: { id: edit.venueId }, select: { id: true } }),
        ]);
        if (!doc || !vendor || !venue || edit.itemId && !item) return { ok: false, error: "Choose an existing invoice, supplier, venue, and ingredient." };
        if (doc.reviewState === "DISCARDED") return { ok: false, error: "This invoice was discarded. Upload it again to start over." };
        if (doc.vendorId && doc.vendorId !== edit.vendorId) return { ok: false, error: "Use the supplier recorded on this invoice." };
        if(edit.ocrLineKey && !localInvoiceDraftSchema.safeParse(doc.ocrDraft).data?.lines.some(line=>line.key===edit.ocrLineKey)) return {ok:false,error:"Recognition row not found. Reload this invoice."};
        if(edit.ocrLineKey && !current) {
          const decision=await tx.invoiceOcrDecision.findUnique({where:{documentId_lineKey:{documentId:doc.id,lineKey:edit.ocrLineKey}}});
          if(isRemovedInvoiceDecision(decision?.facts))return {ok:false,error:"This row was removed. Restore it before approving it."};
        }
        if(edit.ocrLineKey && !current && await tx.invoicePurchaseLine.findFirst({where:{invoiceDocumentId:doc.id,ocrLineKey:edit.ocrLineKey}})) return {ok:false,conflict:true,error:"This OCR row was already approved. Edit its saved line below."};
        if (current && current.invoiceDocumentId !== doc.id) return { ok: false, error: "An invoice line cannot be moved to another document." };
        const otherVendor = await tx.invoicePurchaseLine.findFirst({ where: { invoiceDocumentId: doc.id, voided: false, vendorId: { not: edit.vendorId }, id: { not: edit.id } }, select: { id: true } });
        if (otherVendor) return { ok: false, error: "All active lines on this invoice must use the same supplier." };
        const amountCents = dollarsToCents(edit.amount, true);
        if (amountCents == null || amountCents === 0) return { ok: false, error: "Enter the paid line amount; use negative amounts for credits." };
        const {sameBasis,measure} = item ? invoiceNormalizationMeasure(item,current,edit) : {sameBasis:false,measure:{}};
        if (item?.measurementReviewedAt && !sameBasis && edit.expectedMeasurementVersion !== measurementVersion(item)) return {ok:false,error:"Ingredient conversions changed. Refresh ingredient data and verify the normalization before approval."};
        const price = item ? normalizedInvoicePrice(amountCents, edit.quantity, edit.packQty, edit.packUnit, item.unit, measure) : null;
        const state = { measurementSnapshot: sameBasis ? current?.measurementSnapshot??null : item ? {...measurementSnapshot({...measure,unit:item.unit}),eachWeightOverride:edit.eachWeightOz} : null, billedUnitPrice: edit.billedUnitPrice ?? current?.billedUnitPrice ?? null, rawCode: edit.rawCode, ocrLineKey: current?.ocrLineKey ?? edit.ocrLineKey, invoiceDocumentId: doc.id, venueId: edit.venueId, vendorId: edit.vendorId, itemId: edit.itemId,
          invoiceDate: businessDate(edit.invoiceDate), description: edit.description, quantity: edit.quantity,
          purchaseUnit: edit.purchaseUnit, packQty: edit.packQty, packUnit: edit.packUnit, amountCents,
          itemName: item?.name ?? null, normalizedUnit: item?.unit ?? null, normalizedUnitCost: price,
          countsAsFood: edit.countsAsFood, voided: edit.voided };
        if (current && Object.entries(state).every(([key, value]) => { const old = (current as unknown as Record<string, unknown>)[key]; return old instanceof Date && value instanceof Date ? old.getTime() === value.getTime() : typeof value === "object" ? isDeepStrictEqual(old,value) : old === value; })) { await learnPurchase(tx,userId,current.id,current.revision,edit); return { ok: true, revision: current.revision }; }
        if (current ? current.revision !== edit.revision : edit.revision != null) return { ok: false, conflict: true, error: "This invoice line changed. Reload before saving; your entry is kept." };
        if (current && !edit.reason) return { ok: false, error: "Explain the invoice-line correction or void." };
        if (!current && edit.voided) return { ok: false, error: "Save the line before voiding it." };
        const before = current ? { measurementSnapshot:current.measurementSnapshot, description: current.description, amountCents: current.amountCents, itemId: current.itemId, itemName: current.itemName, quantity: current.quantity, packQty: current.packQty, packUnit: current.packUnit, invoiceDate: current.invoiceDate, venueId: current.venueId, vendorId: current.vendorId, countsAsFood: current.countsAsFood, voided: current.voided, normalizedUnitCost: current.normalizedUnitCost, normalizedUnit: current.normalizedUnit } : null;
        const history = json([...(Array.isArray(current?.history) ? current.history : []), { at: new Date().toISOString(), userId, userName: user.name, reason: edit.reason || "Reviewed invoice line", before, after: state }]);
        const saved = current ? await tx.invoicePurchaseLine.update({ where: { id: current.id }, data: { ...state, measurementSnapshot:state.measurementSnapshot==null?Prisma.DbNull:json(state.measurementSnapshot), history, revision: { increment: 1 } } })
          : await tx.invoicePurchaseLine.create({ data: { id: edit.id, ...state, measurementSnapshot:state.measurementSnapshot==null?Prisma.DbNull:json(state.measurementSnapshot), history, createdBy: userId } });
        await learnPurchase(tx,userId,saved.id,saved.revision,edit);
        for (const itemId of new Set([current?.itemId, saved.itemId].filter((value): value is string => !!value))) {
          await cascadeInvoiceCost(tx, itemId, saved.id, doc.id, userId, itemId === saved.itemId && !saved.voided && saved.countsAsFood && saved.amountCents > 0);
        }
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
        await refreshInvoiceReview(tx,doc.id);
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
  const itemIds = [...new Set(rows.flatMap(row => row.itemId ? [row.itemId] : []))];
  const latestDate = rows.reduce((latest, row) => row.invoiceDate > latest ? row.invoiceDate : latest, new Date(0));
  const history = itemIds.length ? await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, purchaseLines: {
    where: { invoiceDocumentId: { not: id }, voided: false, countsAsFood: true, amountCents: { gt: 0 }, normalizedUnitCost: { gt: 0 }, invoiceDate: { lte: latestDate } },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 100,
    select: { id: true, vendorId: true, invoiceDate: true, createdAt: true, normalizedUnit: true, normalizedUnitCost: true, amountCents: true, measurementSnapshot: true },
  } } }) : [];
  const byItem = new Map(history.map(item => [item.id, item.purchaseLines]));
  const threshold = varianceThreshold(process.env.PRICE_VARIANCE_THRESHOLD_PERCENT);
  return rows.map(row => {
    const previous = (byItem.get(row.itemId ?? "") ?? []).find(candidate => candidate.vendorId === row.vendorId &&
      (candidate.invoiceDate < row.invoiceDate || candidate.invoiceDate.getTime() === row.invoiceDate.getTime() &&
        (candidate.createdAt < row.createdAt || candidate.createdAt.getTime() === row.createdAt.getTime() && candidate.id < row.id)) &&
      row.normalizedUnit && normalizedObservation({ ...candidate, vendorName: "" }, row.normalizedUnit) != null);
    const previousUnitCost = previous && row.normalizedUnit ? normalizedObservation({ ...previous, vendorName: "" }, row.normalizedUnit) : null;
    return { ...row, measurementSnapshot:row.measurementSnapshot as IngredientMeasure|null, eachWeightOz:(row.measurementSnapshot as (IngredientMeasure & {eachWeightOverride?:number|null}) | null)?.eachWeightOverride??null, invoiceDate: row.invoiceDate.toISOString().slice(0, 10), previousUnitCost,
      priceChange: row.voided || !row.countsAsFood || row.amountCents <= 0 ? null : priceVariance(previousUnitCost, row.normalizedUnitCost), varianceThreshold: threshold };
  });
}
