import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { discardInvoice } from "./discard-invoice";
import { saveInvoicePurchase } from "./invoice-purchases-data";
import { mutateLocalInvoice } from "./invoice-ocr-data";
import { completeInvoiceReview } from "./complete-review";
import { saveInvoiceReviewDraft } from "./review-draft-data";
import { emptyReviewDraft } from "./review-draft";
import { saveOperatingRecord } from "../accounting/operating-calendar-data";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/prep_workflow_test");
let admin: string, staff: string;
const vendorId = randomUUID(), venueId = randomUUID();
before(async () => {
  admin = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id;
  staff = (await prisma.user.findFirstOrThrow({ where: { role: "STAFF" } })).id;
  await prisma.vendor.create({ data: { id: vendorId, name: "Start over supplier" } });
  await prisma.venue.create({ data: { id: venueId, name: "Start over kitchen", code: "RESET" } });
});
after(() => prisma.$disconnect());
async function document() {
  const id = randomUUID();
  return prisma.invoiceDocument.create({ data: { id, fileHash: id, filename: "restart.pdf", mime: "application/pdf", data: Buffer.from("source"), preview: Buffer.from("preview"), originalBytes: 6, storedBytes: 6, pages: 1, createdBy: admin, vendorId } });
}
async function command(documentId: string) {
  const doc = await prisma.invoiceDocument.findUniqueOrThrow({ where: { id: documentId } });
  const expense = await prisma.operatingFoodExpense.findUnique({ where: { invoiceDocumentId: documentId } });
  return { documentId, lineRevision: doc.lineRevision, ocrRevision: doc.ocrRevision, expenseRevision: expense?.revision ?? null };
}
const line = (documentId: string, itemId: string, patch = {}) => ({ id: randomUUID(), invoiceDocumentId: documentId, itemId, vendorId, venueId, revision: null, invoiceDate: "2026-11-03", description: "Restart ingredient", quantity: 1, purchaseUnit: "lb", packQty: 1, packUnit: "lb", amount: "6", countsAsFood: true, ...patch });

test("discard clears working copies and recognition, releases the same upload, and fences stale clients", async () => {
  const doc = await document();
  await mutateLocalInvoice(admin, { action: "draft", documentId: doc.id, expectedRevision: 0, pages: [{ page: 1, text: "123 GARLIC 1 LB 6.00 6.00" }] });
  const saved = await prisma.invoiceDocument.findUniqueOrThrow({ where: { id: doc.id } });
  const key = (saved.ocrDraft as { lines: { key: string }[] }).lines[0].key;
  const remove = { action: "remove", documentId: doc.id, key, operationId: randomUUID() };
  await mutateLocalInvoice(admin, remove);
  const draft = { ...emptyReviewDraft(1), date: "unfinished", manual: { key: "new", id: randomUUID(), lineRevision: null, fields: { description: "wrong entry" } } };
  await saveInvoiceReviewDraft(prisma, admin, doc.id, 0, draft);
  const request = await command(doc.id);
  await assert.rejects(discardInvoice(prisma, staff, request), /Manager/);
  assert.deepEqual(await discardInvoice(prisma, admin, request), { ok: true });
  assert.deepEqual(await discardInvoice(prisma, admin, request), { ok: true });
  const discarded = await prisma.invoiceDocument.findUniqueOrThrow({ where: { id: doc.id } });
  assert.equal(discarded.reviewState, "DISCARDED"); assert.equal(discarded.ocrDraft, null);
  assert.equal(await prisma.invoiceReviewDraft.count({ where: { documentId: doc.id } }), 0);
  assert.equal(await prisma.invoiceOcrDecision.count({ where: { documentId: doc.id } }), 0);
  assert.equal(await prisma.invoiceDocument.findUnique({ where: { fileHash: doc.fileHash } }), null);
  await assert.rejects(saveInvoiceReviewDraft(prisma, admin, doc.id, 0, emptyReviewDraft(0)), /discarded/);
  await assert.rejects(mutateLocalInvoice(admin, remove), /discarded/);
  await assert.rejects(completeInvoiceReview(prisma, admin, doc.id, discarded.lineRevision, discarded.ocrRevision), /discarded/);
  const fresh = await prisma.invoiceDocument.create({ data: { ...doc, id: randomUUID(), ocrDraft: undefined } });
  assert.notEqual(fresh.id, doc.id); assert.equal(fresh.ocrDraft, null);
});

test("discard reverses all saved lines once, restores other purchase costs, voids accounting and reopens the day", async () => {
  const doc = await document(), older = await document();
  const item = await prisma.item.create({ data: { name: "Discard cost rollback", unit: "lb", unitCost: 2 } });
  assert.ok((await saveInvoicePurchase(prisma, admin, line(older.id, item.id, { invoiceDate: "2026-11-02", amount: "3" }))).ok);
  const first = line(doc.id, item.id), second = line(doc.id, item.id, { amount: "8" });
  assert.ok((await saveInvoicePurchase(prisma, admin, first)).ok); assert.ok((await saveInvoicePurchase(prisma, admin, second)).ok);
  const revision = (await command(doc.id)).lineRevision, expenseId = randomUUID();
  const expenseInput = { kind: "expense", id: expenseId, revision: null, venueId, invoiceDate: "2026-11-03", amount: "14", description: "Restart spend", invoiceDocumentId: doc.id, invoiceLineRevision: revision, voided: false };
  assert.ok((await saveOperatingRecord(prisma, admin, expenseInput)).ok);
  const day = await prisma.operatingDay.create({ data: { venueId, businessDate: new Date("2026-11-03T00:00:00Z"), foodReviewed: true, grossSalesCents: 12345, laborCents: 2000, createdBy: admin } });
  const request = await command(doc.id);
  const results = await Promise.all([discardInvoice(prisma, admin, request), discardInvoice(prisma, admin, request)]);
  assert.ok(results.every(result => result.ok));
  assert.equal((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).unitCost, 3);
  const rows = await prisma.invoicePurchaseLine.findMany({ where: { invoiceDocumentId: doc.id } });
  assert.ok(rows.every(row => row.voided && row.revision === 1 && (row.history as unknown[]).length === 2));
  const expense = await prisma.operatingFoodExpense.findUniqueOrThrow({ where: { id: expenseId } });
  assert.equal(expense.voided, true); assert.equal(expense.revision, 1); assert.equal(expense.invoiceReferenceKey, null);
  const reopened = await prisma.operatingDay.findUniqueOrThrow({ where: { id: day.id } });
  assert.equal(reopened.foodReviewed, false); assert.equal(reopened.grossSalesCents, 12345); assert.equal(reopened.laborCents, 2000);
  const priceEvents = await prisma.invoicePriceChange.count({ where: { invoiceDocumentId: doc.id } });
  await discardInvoice(prisma, admin, request);
  assert.equal(await prisma.invoicePriceChange.count({ where: { invoiceDocumentId: doc.id } }), priceEvents);
  assert.equal((await saveInvoicePurchase(prisma, admin, { ...first, id: randomUUID() })).ok, false);
  assert.equal((await saveOperatingRecord(prisma, admin, { ...expenseInput, revision: 1, reason: "Stale tab" })).ok, false);
});

test("start over requires current saved facts and preserves later manual catalog edits", async () => {
  const doc = await document(), initial = await command(doc.id);
  const item = await prisma.item.create({ data: { name: "Discard manual price", unit: "lb", unitCost: 2 } });
  assert.ok((await saveInvoicePurchase(prisma, admin, line(doc.id, item.id))).ok);
  assert.equal((await discardInvoice(prisma, admin, initial)).ok, false);
  assert.equal(await prisma.invoicePurchaseLine.count({ where: { invoiceDocumentId: doc.id, voided: false } }), 1);
  await prisma.item.update({ where: { id: item.id }, data: { unitCost: 11 } });
  assert.ok((await discardInvoice(prisma, admin, await command(doc.id))).ok);
  assert.equal((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).unitCost, 11);
});
