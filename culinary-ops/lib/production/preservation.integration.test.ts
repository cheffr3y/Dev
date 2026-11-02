import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { mutatePreservation, getPreservationBatch, listPreservationBatches } from "./preservation-data";
import { preservationFactsSchema, type PreservationInput } from "./preservation";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (process.env.PREP_DISPOSABLE_DB !== "1" || database.hostname !== "127.0.0.1" || database.pathname !== "/prep_workflow_test") throw new Error("Disposable database required.");
let manager: string, staff: string, other: string, itemId: string, recipeId: string;
const venueId = "preservation-test-venue";
const input = (): PreservationInput => ({ id: randomUUID(), name: "Preservation test", venueId, recipeId, itemId, method: "Freeze-drying", productionDate: "2026-10-01", startedAt: "2026-10-01T12:00:00Z", unit: "lb", wetGross: 12, wetTare: 2, inputCost: 100, costNotes: "Reviewed ingredient cost", equipment: "FD1", temperature: -30, temperatureUnit: "C", humidity: 40, cycleMinutes: 2880, shelfLife: "Assigned by manager", useBy: "2026-10-10", allergens: ["eggs"], notes: "" });
const finished = { gross: 3, tare: 1, finishedAt: "2026-10-03T12:00:00Z", notes: "Batch complete" };
const create = (actor = manager, data = input()) => mutatePreservation(actor, { action: "create", data });
before(async () => {
  await prisma.venue.create({ data: { id: venueId, name: "Preservation Kitchen", code: "PRESERVE" } });
  manager = (await prisma.user.create({ data: { name: "Preservation Manager", email: "pres-manager@integration.test", passwordHash: "not-used", role: "MANAGER" } })).id;
  staff = (await prisma.user.create({ data: { name: "Preservation Cook", email: "pres-staff@integration.test", passwordHash: "not-used", role: "STAFF", homeVenueId: venueId } })).id;
  other = (await prisma.user.create({ data: { name: "Other Cook", email: "pres-other@integration.test", passwordHash: "not-used", role: "STAFF" } })).id;
  itemId = (await prisma.item.create({ data: { name: "Preserved output", unit: "oz", unitCost: 1, allergens: "fish" } })).id;
  const raw = await prisma.item.create({ data: { name: "Raw preservation input", unit: "lb", unitCost: 10, allergens: "milk" } });
  recipeId = (await prisma.recipe.create({ data: { name: "Preservation source", prodCode: "PRESERVE", allergens: "sesame", items: { create: { itemId: raw.id, quantity: 1, unit: "lb" } } } })).id;
});
after(() => prisma.$disconnect());
test("staff venue/ownership and current database roles protect reads, finish, void and price posting", async () => {
  await assert.rejects(create(other), /assigned venue/);
  const batch = await create(staff);
  assert.equal(await getPreservationBatch(other, batch.id), null);
  assert.ok((await listPreservationBatches(staff)).some(row => row.id === batch.id));
  await assert.rejects(mutatePreservation(other, { action: "finish", id: batch.id, revision: 1, data: finished }), /creator/);
  await mutatePreservation(staff, { action: "finish", id: batch.id, revision: 1, data: finished });
  await assert.rejects(mutatePreservation(staff, { action: "post", id: batch.id, revision: 2, expectedCost: 1, expectedUnit: "oz" }), /Manager/);
  await prisma.user.update({ where: { id: manager }, data: { role: "STAFF" } });
  await assert.rejects(mutatePreservation(manager, { action: "void", id: batch.id, revision: 2, reason: "Wrong data" }), /creator|Manager/);
  await prisma.user.update({ where: { id: manager }, data: { role: "MANAGER" } });
});
test("concurrent create/finish retries preserve one snapshot, timestamps and append-only audit history", async () => {
  const data = input();
  const [a, b] = await Promise.all([create(manager, data), create(manager, data)]);
  assert.equal(a.id, b.id); assert.equal(a.createdAt.toISOString(), b.createdAt.toISOString());
  const original = preservationFactsSchema.parse(a.facts);
  assert.deepEqual(original.allergens.split(",").sort(), ["eggs", "fish", "milk", "sesame"]);
  await prisma.recipe.update({ where: { id: recipeId }, data: { name: "Source edited later", allergens: null } });
  await Promise.all([mutatePreservation(manager, { action: "finish", id: a.id, revision: 1, data: finished }), mutatePreservation(manager, { action: "finish", id: a.id, revision: 1, data: finished })]);
  const result = await getPreservationBatch(manager, a.id);
  assert.equal(result!.audits.length, 2); assert.deepEqual(preservationFactsSchema.parse(result!.facts).input, original.input);
  assert.deepEqual(preservationFactsSchema.parse(result!.facts).recipe, original.recipe);
  assert.equal(preservationFactsSchema.parse(result!.facts).allergens, original.allergens);
  await assert.rejects(prisma.preservationAudit.update({ where: { id: result!.audits[0].id }, data: { actorName: "rewritten" } }), /cannot be changed/);
  await assert.rejects(mutatePreservation(manager, { action: "finish", id: a.id, revision: 2, data: { ...finished, gross: 4 } }), /cannot be replaced/);
});
test("posting detects catalog changes, converts the cost basis, and concurrent/lost-response retries never reapply", async () => {
  const batch = await create(); await mutatePreservation(manager, { action: "finish", id: batch.id, revision: 1, data: finished });
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 2 } });
  await assert.rejects(mutatePreservation(manager, { action: "post", id: batch.id, revision: 2, expectedCost: 1, expectedUnit: "oz" }), /changed/);
  const command = { action: "post", id: batch.id, revision: 2, expectedCost: 2, expectedUnit: "oz" };
  await assert.rejects(mutatePreservation(manager, { ...command, expectedUnit: "lb" }), /cost unit changed/);
  await Promise.all([mutatePreservation(manager, command), mutatePreservation(manager, command)]);
  const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } }); assert.equal(item.unitCost, 3.125);
  const result = await getPreservationBatch(manager, batch.id); assert.equal(result!.audits.filter(entry => entry.action === "POST").length, 1);
  await prisma.item.update({ where: { id: itemId }, data: { unitCost: 99 } });
  await mutatePreservation(manager, command); assert.equal((await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).unitCost, 99);
  await assert.rejects(mutatePreservation(manager, { action: "void", id: batch.id, revision: 3, reason: "Mistake" }), /posted batch/);
});
test("zero yield cannot post, gains require notes, stale revisions reject and voids preserve original facts", async () => {
  const batch = await create();
  await assert.rejects(mutatePreservation(manager, { action: "finish", id: batch.id, revision: 99, data: finished }), /another session/);
  await assert.rejects(mutatePreservation(manager, { action: "finish", id: batch.id, revision: 1, data: { ...finished, gross: 14, notes: "" } }), /weight gain/);
  await mutatePreservation(manager, { action: "finish", id: batch.id, revision: 1, data: { ...finished, gross: 1 } });
  await assert.rejects(mutatePreservation(manager, { action: "post", id: batch.id, revision: 2, expectedCost: 99, expectedUnit: "oz" }), /positive finished weight/);
  await mutatePreservation(manager, { action: "void", id: batch.id, revision: 2, reason: "No usable output" });
  await assert.rejects(mutatePreservation(manager, { action: "finish", id: batch.id, revision: 3, data: finished }), /void/);
  assert.equal(preservationFactsSchema.parse((await getPreservationBatch(manager, batch.id))!.facts).finished!.gross, 1);
});
test("preservation operations do not create inventory, prep, stock-transfer or accounting records", async () => {
  const snapshot = async () => JSON.stringify({ inventory: await prisma.inventoryItem.findMany(), lines: await prisma.prepOrderLine.findMany(), batches: await prisma.productionBatch.findMany(), transfers: await prisma.stockTransfer.findMany(), closeouts: await prisma.productionCloseout.findMany(), packets: await prisma.prepPacketSnapshot.findMany() });
  const before = await snapshot(), batch = await create();
  await mutatePreservation(manager, { action: "finish", id: batch.id, revision: 1, data: finished });
  await mutatePreservation(manager, { action: "void", id: batch.id, revision: 2, reason: "Test reference only" });
  assert.equal(await snapshot(), before);
});
test("removed live source records do not erase captured labels, and a removed catalog target cannot be priced", async () => {
  const batch = await create(); await mutatePreservation(manager, { action: "finish", id: batch.id, revision: 1, data: finished });
  const original = preservationFactsSchema.parse((await getPreservationBatch(manager, batch.id))!.facts);
  await prisma.recipe.delete({ where: { id: recipeId } }); await prisma.item.delete({ where: { id: itemId } });
  const saved = preservationFactsSchema.parse((await getPreservationBatch(manager, batch.id))!.facts);
  assert.deepEqual(saved.recipe, original.recipe); assert.deepEqual(saved.item, original.item); assert.equal(saved.allergens, original.allergens);
  await assert.rejects(mutatePreservation(manager, { action: "post", id: batch.id, revision: 2, expectedCost: 99, expectedUnit: "oz" }), /removed/);
});
