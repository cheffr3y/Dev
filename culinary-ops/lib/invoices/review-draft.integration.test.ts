import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { emptyReviewDraft, reviewDraftSchema } from "./review-draft";
import { saveInvoiceReviewDraft } from "./review-draft-data";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/prep_workflow_test");
const admin = randomUUID(), manager = randomUUID(), staff = randomUUID(), documentId = randomUUID();
before(async () => {
  await prisma.user.createMany({ data: [{ id: admin, email: `${admin}@draft.test`, name: "Draft admin", passwordHash: "unused", role: "ADMIN" }, { id: manager, email: `${manager}@draft.test`, name: "Draft manager", passwordHash: "unused", role: "MANAGER" }, { id: staff, email: `${staff}@draft.test`, name: "Draft staff", passwordHash: "unused", role: "STAFF" }] });
  await prisma.invoiceDocument.create({ data: { id: documentId, fileHash: documentId, filename: "draft.pdf", mime: "application/pdf", data: Buffer.from("draft"), preview: Buffer.from("draft"), originalBytes: 5, storedBytes: 5, pages: 1, createdBy: admin, ocrRevision: 1 } });
});
after(() => prisma.$disconnect());

test("personal draft saves are durable, retry-safe and isolated from accounting and other users", async () => {
  const before = JSON.stringify({ items: await prisma.item.findMany({ select: { id: true, unitCost: true }, orderBy: { id: "asc" } }), purchases: await prisma.invoicePurchaseLine.count(), batches: await prisma.productionBatch.count() });
  const payload = { ...emptyReviewDraft(1), date: "unfinished", manual: {key:"new",id:randomUUID(),lineRevision:null,fields:{description:"Draft only",amount:"",countsAsFood:"off"}} };
  assert.deepEqual(await saveInvoiceReviewDraft(prisma, admin, documentId, 0, payload), { ok: true, revision: 1 });
  assert.deepEqual(await saveInvoiceReviewDraft(prisma, admin, documentId, 0, payload), { ok: true, revision: 1 });
  assert.deepEqual(await saveInvoiceReviewDraft(prisma, admin, documentId, 0, {...payload,manual:{...payload.manual,fields:{countsAsFood:"off",amount:"",description:"Draft only"}}}), {ok:true,revision:1}, "JSONB field ordering must not break lost-response replay");
  const stale = await saveInvoiceReviewDraft(prisma, admin, documentId, 0, { ...payload, date: "different" });
  assert.equal(stale.ok, false);
  assert.deepEqual(await saveInvoiceReviewDraft(prisma, manager, documentId, 0, { ...payload, date: "manager" }), { ok: true, revision: 1 });
  assert.equal(reviewDraftSchema.parse((await prisma.invoiceReviewDraft.findUniqueOrThrow({ where: { userId_documentId: { userId: admin, documentId } } })).payload).date, "unfinished");
  assert.equal(await prisma.invoiceReviewDraft.count({where:{documentId}}),2);
  await assert.rejects(saveInvoiceReviewDraft(prisma, staff, documentId, 0, payload), /Manager/);
  await assert.rejects(saveInvoiceReviewDraft(prisma, "removed-user", documentId, 0, payload), /Manager/);
  assert.equal((await saveInvoiceReviewDraft(prisma, admin, documentId, 1, { ...payload, sourceRevision: 2 })).ok, false);
  assert.equal(JSON.stringify({ items: await prisma.item.findMany({ select: { id: true, unitCost: true }, orderBy: { id: "asc" } }), purchases: await prisma.invoicePurchaseLine.count(), batches: await prisma.productionBatch.count() }), before);
});

test("concurrent personal draft writers cannot both replace the same revision", async () => {
  const payload = emptyReviewDraft(1);
  const results = await Promise.all([saveInvoiceReviewDraft(prisma, admin, documentId, 1, { ...payload, date: "first" }), saveInvoiceReviewDraft(prisma, admin, documentId, 1, { ...payload, date: "second" })]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal((await prisma.invoiceReviewDraft.findUniqueOrThrow({ where: { userId_documentId: { userId: admin, documentId } } })).revision, 2);
});
