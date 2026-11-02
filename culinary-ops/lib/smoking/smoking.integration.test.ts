import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../db/prisma";
import {
  getSmokeRun,
  listSmokeRuns,
  mutateSmoke,
  uploadSmokePhoto,
} from "./data";
import { emptyActual, newPlan, lotSchema } from "./smoking";
import { compactSmokeDocument } from "./storage";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (
  process.env.PREP_DISPOSABLE_DB !== "1" ||
  url.hostname !== "127.0.0.1" ||
  url.pathname !== "/prep_workflow_test"
)
  throw new Error("Disposable database required.");
let admin: string, staff: string, other: string, runId: string, lotId: string;
const venueId = "smoking-venue";
const runData = {
  name: "Mixed Friday smoke",
  smoker: "Offset 1",
  cookName: "Chef",
  notes: "Kitchen QA",
};
const op = () => randomUUID();
const getLot = () =>
  prisma.smokeLot.findUniqueOrThrow({ where: { id: lotId } });
const checkpoint = {
  kind: "LOAD",
  at: "2026-11-01T14:00:00Z",
  temperature: 42,
  temperatureUnit: "F",
  probeName: "T1",
  probeKind: "FOOD",
  notes: "Loaded brisket",
  voided: false,
};
const create = async (actor: string = admin) =>
  mutateSmoke(actor, {
    action: "createRun",
    operationId: op(),
    date: "2026-11-01",
    venueId,
    data: runData,
  });
before(async () => {
  admin = (
    await prisma.user.findUniqueOrThrow({
      where: { email: "admin@local.test" },
    })
  ).id;
  staff = (
    await prisma.user.create({
      data: {
        email: "smoke-cook@local.test",
        name: "Smoke cook",
        role: "STAFF",
        passwordHash: "qa-only",
      },
    })
  ).id;
  other = (
    await prisma.user.create({
      data: {
        email: "smoke-other@local.test",
        name: "Other cook",
        role: "STAFF",
        passwordHash: "qa-only",
      },
    })
  ).id;
  await prisma.venue.create({
    data: { id: venueId, name: "Smoke Test Kitchen", code: "SMOKE" },
  });
  await prisma.user.update({
    where: { id: staff },
    data: { homeVenueId: venueId },
  });
});
after(() => prisma.$disconnect());
test("mixed lots retain independent settings; repeated request executes once and reused identifiers conflict", async () => {
  const request = {
    action: "createRun",
    operationId: op(),
    date: "2026-11-01",
    venueId,
    data: runData,
  };
  const results = await Promise.all([
    mutateSmoke(admin, request),
    mutateSmoke(admin, request),
  ]);
  assert.deepEqual(results[0], results[1]);
  runId = results[0].id;
  await assert.rejects(
    mutateSmoke(admin, { ...request, data: { ...runData, name: "Changed" } }),
    /identifier/,
  );
  const result = await mutateSmoke(admin, {
    action: "saveLot",
    operationId: op(),
    runId,
    lotId: null,
    revision: null,
    plan: newPlan("Smoke cook", staff),
    actual: emptyActual(),
  });
  lotId = result.id;
  await mutateSmoke(admin, {
    action: "saveLot",
    operationId: op(),
    runId,
    lotId: null,
    revision: null,
    plan: {
      ...newPlan("Cheese cook", admin),
      product: "Cheddar cheese",
      label: "Cheese",
      mode: "COLD",
    },
    actual: emptyActual(),
  });
  const lots = await prisma.smokeLot.findMany({ where: { runId } });
  assert.equal(lots.length, 2);
  assert.deepEqual(lots.map((l) => lotSchema.parse(l.data).plan.mode).sort(), [
    "COLD",
    "HOT",
  ]);
});
test("current venue and assignment access restrict both reads and writes", async () => {
  await assert.rejects(create(other), /assigned venue/);
  const outsider = await prisma.user.findUniqueOrThrow({
      where: { id: other },
    }),
    cook = await prisma.user.findUniqueOrThrow({ where: { id: staff } });
  assert.equal(await getSmokeRun(outsider, runId), null);
  assert.ok(await getSmokeRun(cook, runId));
  await assert.rejects(
    mutateSmoke(other, {
      action: "reading",
      operationId: op(),
      runId,
      lotId,
      revision: 0,
      readingId: null,
      readingRevision: null,
      data: checkpoint,
      reason: "Attempt",
    }),
    /not found/,
  );
  const cheese = await prisma.smokeLot.findFirstOrThrow({
    where: { runId, id: { not: lotId } },
  });
  await assert.rejects(
    mutateSmoke(staff, {
      action: "state",
      operationId: op(),
      runId,
      lotId: cheese.id,
      revision: 0,
      status: "SUBMITTED",
      reason: "Attempt",
    }),
    /Only the lot/,
  );
  const lot = await getLot();
  await assert.rejects(
    mutateSmoke(staff, {
      action: "saveLot",
      operationId: op(),
      runId,
      lotId,
      revision: lot.revision,
      plan: { ...lotSchema.parse(lot.data).plan, assignedUserId: other },
      actual: emptyActual(),
      reason: "Attempt reassign",
    }),
    /Managers assign/,
  );
});
test("checkpoint corrections preserve originals, require reasons and serialize concurrent changes", async () => {
  const body = {
    action: "reading",
    runId,
    lotId,
    revision: 0,
    readingId: null,
    readingRevision: null,
    data: checkpoint,
    reason: "Probe checked",
    operationId: op(),
  };
  const result = await mutateSmoke(staff, body);
  assert.deepEqual(await mutateSmoke(staff, body), result);
  assert.equal(await prisma.smokeReading.count({ where: { lotId } }), 1);
  const reading = await prisma.smokeReading.findUniqueOrThrow({
    where: { id: result.id },
  });
  await assert.rejects(
    mutateSmoke(staff, {
      ...body,
      operationId: op(),
      revision: 1,
      readingId: reading.id,
      readingRevision: 0,
      reason: "",
    }),
    /reason/,
  );
  const edits = await Promise.allSettled([
    mutateSmoke(staff, {
      ...body,
      operationId: op(),
      revision: 1,
      readingId: reading.id,
      readingRevision: 0,
      data: { ...checkpoint, temperature: 43 },
      reason: "Display corrected",
    }),
    mutateSmoke(staff, {
      ...body,
      operationId: op(),
      revision: 1,
      readingId: reading.id,
      readingRevision: 0,
      data: { ...checkpoint, temperature: 44 },
      reason: "Second correction",
    }),
  ]);
  assert.equal(edits.filter((e) => e.status === "fulfilled").length, 1);
  const audit = await prisma.smokeAudit.findMany({
    where: { entityType: "READING", entityId: reading.id },
    orderBy: { revision: "asc" },
  });
  assert.equal(audit.length, 2);
  assert.deepEqual(audit[1].before, checkpoint);
  await assert.rejects(
    prisma.smokeReading.update({
      where: { id: reading.id },
      data: { data: { ...checkpoint, temperature: 100 } },
    }),
    /revisions|audit/,
  );
  await assert.rejects(
    prisma.smokeReading.delete({ where: { id: reading.id } }),
    /retained/,
  );
  await assert.rejects(
    prisma.smokeAudit.update({
      where: { id: audit[0].id },
      data: { reason: "Tampered" },
    }),
    /immutable/,
  );
});
async function state(status: string, actor = admin) {
  const lot = await getLot();
  return mutateSmoke(actor, {
    action: "state",
    operationId: op(),
    runId,
    lotId,
    revision: lot.revision,
    status,
    reason: "Reviewed kitchen records",
  });
}
test("review is explicit, current-role checked and invalidated by new evidence", async () => {
  await assert.rejects(state("REVIEWED"), /Submit/);
  await state("SUBMITTED", staff);
  await assert.rejects(state("REVIEWED", staff), /Managers review/);
  await state("REVIEWED");
  assert.equal(lotSchema.parse((await getLot()).data).status, "REVIEWED");
  const lot = await getLot();
  await mutateSmoke(staff, {
    action: "reading",
    operationId: op(),
    runId,
    lotId,
    revision: lot.revision,
    readingId: null,
    readingRevision: null,
    data: { ...checkpoint, kind: "PULL", at: "2026-11-01T20:00:00Z" },
    reason: "Recorded pull",
  });
  assert.equal(lotSchema.parse((await getLot()).data).review, null);
  await state("SUBMITTED");
  await state("REVIEWED");
  const run = await prisma.smokeRun.findUniqueOrThrow({ where: { id: runId } });
  await mutateSmoke(admin, {
    action: "editRun",
    operationId: op(),
    runId,
    revision: run.revision,
    data: { ...runData, notes: "Smoker setting clarified" },
    reason: "Source correction",
  });
  assert.equal(lotSchema.parse((await getLot()).data).status, "OPEN");
  await prisma.user.update({ where: { id: admin }, data: { role: "STAFF" } });
  try {
    await assert.rejects(
      mutateSmoke(admin, {
        action: "profile",
        operationId: op(),
        profileId: null,
        revision: null,
        data: { ...newPlan("Chef"), name: "Preset" },
      }),
      /Managers/,
    );
  } finally {
    await prisma.user.update({ where: { id: admin }, data: { role: "ADMIN" } });
  }
});
test("source documents round trip legibly, deduplicate retries, preserve attribution and reopen review", async () => {
  const source = await sharp(
    Buffer.from(
      '<svg width="575" height="1280"><rect width="575" height="1280" fill="#111"/><text x="24" y="200" font-size="38" fill="white">Peak 144.8 F</text><path d="M30 1000 L200 800 L500 500" stroke="red" stroke-width="2"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const compact = await compactSmokeDocument(source);
  assert.equal(compact.mime, "image/png");
  assert.equal((await sharp(compact.data).metadata()).width, 575);
  await state("SUBMITTED");
  await state("REVIEWED");
  const input = {
      operationId: op(),
      runId,
      lotId,
      filename: "thermometer.png",
    },
    uploaded = await uploadSmokePhoto(staff, input, compact);
  assert.deepEqual(await uploadSmokePhoto(staff, input, compact), uploaded);
  assert.deepEqual(
    await uploadSmokePhoto(
      admin,
      { ...input, operationId: op(), lotId: null },
      compact,
    ),
    uploaded,
  );
  const stored = await prisma.smokePhoto.findUniqueOrThrow({
    where: { id: uploaded.id },
  });
  assert.equal(stored.createdById, staff);
  assert.equal(stored.lotId, lotId);
  assert.deepEqual(Buffer.from(stored.data), compact.data);
  assert.equal(await prisma.smokePhoto.count({ where: { runId } }), 1);
  assert.equal(lotSchema.parse((await getLot()).data).status, "OPEN");
  await assert.rejects(
    prisma.smokePhoto.update({
      where: { id: stored.id },
      data: { lotId: null },
    }),
    /immutable/,
  );
  const otherRun = await create(),
    otherLot = await mutateSmoke(admin, {
      action: "saveLot",
      operationId: op(),
      runId: otherRun.id,
      lotId: null,
      revision: null,
      plan: newPlan("Chef", admin),
      actual: emptyActual(),
    });
  await assert.rejects(
    uploadSmokePhoto(
      admin,
      { operationId: op(), runId, lotId: otherLot.id, filename: "wrong.png" },
      compact,
    ),
    /not found/,
  );
});
test("confirmed source transcription and actual yields stay separate from review; repeats reset facts", async () => {
  const before = {
    batches: await prisma.productionBatch.count(),
    transfers: await prisma.stockTransfer.count(),
    food: await prisma.operatingFoodExpense.count(),
  };
  const lot = await getLot(),
    data = lotSchema.parse(lot.data),
    photo = await prisma.smokePhoto.findFirstOrThrow({ where: { runId } }),
    summary = {
      sourceTitle: "Breast: Well Done",
      sourceDate: "2026-10-31",
      target: 165,
      peak: 144.8,
      temperatureUnit: "F",
      durationMinutes: 382,
      probeName: "T2",
      probeKind: "FOOD",
      photoId: photo.id,
      origin: "LOCAL_OCR",
      confirmed: true,
    };
  const edit = {
    action: "saveLot",
    operationId: op(),
    runId,
    lotId,
    revision: lot.revision,
    plan: data.plan,
    actual: {
      ...emptyActual(),
      raw: { quantity: 20, unit: "lb" },
      finished: { quantity: 12, unit: "lb" },
      summary,
    },
    reason: "Confirmed against photo",
  };
  await assert.rejects(
    mutateSmoke(staff, {
      ...edit,
      actual: { ...edit.actual, summary: { ...summary, confirmed: false } },
    }),
    /Confirm/,
  );
  await mutateSmoke(staff, edit);
  assert.equal(lotSchema.parse((await getLot()).data).status, "OPEN");
  const copied = await mutateSmoke(admin, {
    action: "createRun",
    operationId: op(),
    date: "2026-11-02",
    venueId,
    data: runData,
    copyId: runId,
  });
  const copy = await prisma.smokeRun.findUniqueOrThrow({
    where: { id: copied.id },
    include: { lots: { include: { readings: true } }, photos: true },
  });
  assert.equal(copy.lots.length, 2);
  assert.equal(copy.photos.length, 0);
  for (const l of copy.lots) {
    assert.deepEqual(lotSchema.parse(l.data).actual, emptyActual());
    assert.equal(l.readings.length, 0);
    assert.equal(lotSchema.parse(l.data).status, "OPEN");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin } });
  assert.ok(
    (
      await listSmokeRuns(user, {
        product: "cheddar",
        smoker: "offset",
        cook: "chef",
        from: "2026-11-01",
        to: "2026-11-02",
        venue: venueId,
      })
    ).length >= 2,
  );
  assert.equal(await prisma.productionBatch.count(), before.batches);
  assert.equal(await prisma.stockTransfer.count(), before.transfers);
  assert.equal(await prisma.operatingFoodExpense.count(), before.food);
});

test("reusable procedures and linked recipe/project captures preserve historical methods without duplicate timers", async () => {
  const recipe = await prisma.recipe.create({
    data: {
      name: "Smoke capture recipe",
      prodCode: "SC9",
      instructions: "Original method",
      yieldQty: 12,
      yieldUnit: "lb",
    },
  });
  const project = await prisma.productionJob.create({
    data: {
      targetKey: `smoke-${op()}`,
      kind: "PREP",
      businessDate: new Date("2026-11-01T00:00:00Z"),
      recipeId: recipe.id,
      recipeName: recipe.name,
      contextLabel: "Existing prep project",
      sourceRef: {},
      sourceSignature: "smoke-test",
      requestLineIds: [],
      expectedUnit: "lb",
      cookName: "Chef",
      startedByUserId: admin,
    },
  });
  const procedure = {
    product: "Brisket",
    mode: "HOT",
    procedure: "Original method",
    smokerSettings: "Kitchen setting",
    woodFuel: "Oak",
    seasoning: "House rub",
    targetTemperature: null,
    temperatureUnit: "F",
    name: "House brisket",
  };
  const profile = await mutateSmoke(admin, {
    action: "profile",
    operationId: op(),
    profileId: null,
    revision: null,
    data: procedure,
  });
  const linkedRun = await create(),
    linked = await mutateSmoke(admin, {
      action: "saveLot",
      operationId: op(),
      runId: linkedRun.id,
      lotId: null,
      revision: null,
      plan: {
        ...newPlan("Chef", admin),
        ...procedure,
        recipeId: recipe.id,
        projectId: project.id,
        profileId: profile.id,
        profileRevision: 0,
      },
      actual: emptyActual(),
    });
  await prisma.recipe.update({
    where: { id: recipe.id },
    data: { version: 2, instructions: "New method", name: "New name" },
  });
  await mutateSmoke(admin, {
    action: "profile",
    operationId: op(),
    profileId: profile.id,
    revision: 0,
    data: { ...procedure, procedure: "New procedure" },
    reason: "Template improved",
  });
  let row = await prisma.smokeLot.findUniqueOrThrow({
      where: { id: linked.id },
    }),
    data = lotSchema.parse(row.data);
  assert.equal(data.recipe?.instructions, "Original method");
  assert.equal(data.recipe?.version, 1);
  assert.equal(data.plan.procedure, "Original method");
  await mutateSmoke(admin, {
    action: "saveLot",
    operationId: op(),
    runId: linkedRun.id,
    lotId: row.id,
    revision: row.revision,
    plan: data.plan,
    actual: { ...data.actual, qualityNotes: "Quality noted" },
    reason: "Added quality notes",
  });
  row = await prisma.smokeLot.findUniqueOrThrow({ where: { id: linked.id } });
  data = lotSchema.parse(row.data);
  assert.equal(data.recipe?.version, 1);
  assert.equal(data.project?.id, project.id);
  assert.equal(
    (
      await prisma.productionJob.findUniqueOrThrow({
        where: { id: project.id },
      })
    ).finishedAt,
    null,
  );
  const copied = await mutateSmoke(admin, {
    action: "createRun",
    operationId: op(),
    date: "2026-11-03",
    venueId,
    data: runData,
    copyId: linkedRun.id,
  });
  const copy = lotSchema.parse(
    (await prisma.smokeLot.findFirstOrThrow({ where: { runId: copied.id } }))
      .data,
  );
  assert.equal(copy.recipe?.version, 1);
  assert.equal(copy.project, null);
  assert.equal(copy.plan.projectId, null);
  assert.equal(
    await prisma.productionJob.count({ where: { recipeId: recipe.id } }),
    1,
  );
  await assert.rejects(
    prisma.smokeProfile.delete({ where: { id: profile.id } }),
    /retained/,
  );
});
