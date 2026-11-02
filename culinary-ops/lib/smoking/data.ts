import { randomUUID, createHash } from "node:crypto";
import { Prisma, type SmokeRun, type SmokeLot } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma";
import type { AppUser } from "../auth/session";
import {
  actualSchema,
  freshLotFromSetup,
  lotSchema,
  planSchema,
  profileSchema,
  readingSchema,
  referenceId,
  runSchema,
  smokeDate,
  type SmokeLotData,
} from "./smoking";
import type { compactSmokeDocument } from "./storage";

type Tx = Prisma.TransactionClient;
type Actor = Pick<AppUser, "id" | "name" | "role" | "homeVenueId">;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const revision = z.number().int().nonnegative();
const base = {
  operationId: z.string().uuid(),
  reason: z.string().trim().max(2000).default(""),
};
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    ...base,
    action: z.literal("createRun"),
    date: smokeDate,
    venueId: referenceId,
    data: runSchema,
    copyId: referenceId.nullable().default(null),
  }),
  z.object({
    ...base,
    action: z.literal("editRun"),
    runId: referenceId,
    revision,
    data: runSchema,
  }),
  z.object({
    ...base,
    action: z.literal("saveLot"),
    runId: referenceId,
    lotId: referenceId.nullable(),
    revision: revision.nullable(),
    plan: planSchema,
    actual: actualSchema,
  }),
  z.object({
    ...base,
    action: z.literal("state"),
    runId: referenceId,
    lotId: referenceId,
    revision,
    status: z.enum(["OPEN", "SUBMITTED", "REVIEWED", "VOID"]),
  }),
  z.object({
    ...base,
    action: z.literal("reading"),
    runId: referenceId,
    lotId: referenceId,
    revision,
    readingId: referenceId.nullable(),
    readingRevision: revision.nullable(),
    data: readingSchema,
  }),
  z.object({
    ...base,
    action: z.literal("profile"),
    profileId: referenceId.nullable(),
    revision: revision.nullable(),
    data: profileSchema,
  }),
]);
export type SmokeCommand = z.infer<typeof commandSchema>;
export class SmokeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const fail = (message: string, status = 400): never => {
  throw new SmokeError(message, status);
};
export const isSmokeManager = (user: Pick<Actor, "role">) =>
  user.role !== "STAFF";
export function smokeScope(user: Actor): Prisma.SmokeRunWhereInput {
  return isSmokeManager(user)
    ? {}
    : {
        OR: [
          ...(user.homeVenueId ? [{ venueId: user.homeVenueId }] : []),
          { createdById: user.id },
          {
            lots: {
              some: {
                data: { path: ["plan", "assignedUserId"], equals: user.id },
              },
            },
          },
        ],
      };
}
export function canEditSmokeLot(
  user: Actor,
  lot: Pick<SmokeLot, "createdById" | "data">,
) {
  return (
    isSmokeManager(user) ||
    lot.createdById === user.id ||
    lotSchema.parse(lot.data).plan.assignedUserId === user.id
  );
}
async function current(tx: Tx, actorId: string): Promise<Actor> {
  return (
    (await tx.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, role: true, homeVenueId: true },
    })) ?? fail("Sign in again.", 401)
  );
}
async function accessible(tx: Tx, user: Actor, runId: string) {
  return (
    (await tx.smokeRun.findFirst({
      where: { id: runId, ...smokeScope(user) },
    })) ?? fail("Smoking run not found.", 404)
  );
}
function expectRevision(actual: number, expected: number | null) {
  if (actual !== expected)
    fail("This record changed. Refresh before saving your correction.", 409);
}
function correction(reason: string) {
  if (!reason) fail("Enter a reason for the correction or review.");
}
async function audit(
  tx: Tx,
  user: Actor,
  type: string,
  id: string,
  rev: number,
  before: unknown,
  after: unknown,
  reason: string,
  action = "SAVE",
) {
  await tx.smokeAudit.create({
    data: {
      id: randomUUID(),
      entityType: type,
      entityId: id,
      revision: rev,
      actorId: user.id,
      actorName: user.name,
      before: before === null ? Prisma.DbNull : json(before),
      after: json(after),
      action,
      reason,
    },
  });
}
async function writeLot(
  tx: Tx,
  user: Actor,
  lot: SmokeLot,
  next: SmokeLotData,
  reason: string,
) {
  correction(reason);
  await audit(
    tx,
    user,
    "LOT",
    lot.id,
    lot.revision + 1,
    lot.data,
    next,
    reason,
  );
  return tx.smokeLot.update({
    where: { id: lot.id },
    data: { data: json(next), revision: { increment: 1 } },
  });
}
async function reopen(
  tx: Tx,
  user: Actor,
  runId: string,
  reason: string,
  lotId?: string,
) {
  const lots = await tx.smokeLot.findMany({
    where: {
      runId,
      ...(lotId ? { id: lotId } : {}),
      OR: ["SUBMITTED", "REVIEWED"].map((status) => ({
        data: { path: ["status"], equals: status },
      })),
    },
  });
  for (const lot of lots)
    await writeLot(
      tx,
      user,
      lot,
      { ...lotSchema.parse(lot.data), status: "OPEN", review: null },
      reason,
    );
}
async function createLot(
  tx: Tx,
  user: Actor,
  runId: string,
  data: SmokeLotData,
) {
  const id = randomUUID();
  await audit(tx, user, "LOT", id, 0, null, data, "Created lot", "CREATE");
  return tx.smokeLot.create({
    data: { id, runId, createdById: user.id, data: json(data) },
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
// A durable receipt makes a retry safe even when the successful response was lost.
async function operation(
  actorId: string,
  operationId: string,
  payload: unknown,
  runId: string | null,
  execute: (tx: Tx, user: Actor) => Promise<{ id: string }>,
) {
  const hash = createHash("sha256").update(canonical(payload)).digest("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const user = await current(tx, actorId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${operationId}, 0))`;
          const previous = await tx.smokeAudit.findUnique({
            where: { operationId },
          });
          if (previous) {
            if (previous.actorId !== actorId || previous.requestHash !== hash)
              fail(
                "This request identifier was already used for different data.",
                409,
              );
            return previous.result as { id: string };
          }
          if (runId) {
            await tx.$queryRaw`SELECT id FROM "SmokeRun" WHERE id = ${runId} FOR UPDATE`;
            await accessible(tx, user, runId);
          }
          const result = await execute(tx, user);
          await tx.smokeAudit.create({
            data: {
              id: randomUUID(),
              entityType: "REQUEST",
              entityId: operationId,
              revision: 0,
              action: "RECEIPT",
              actorId,
              actorName: user.name,
              reason: "Request receipt",
              after: {},
              operationId,
              requestHash: hash,
              result,
            },
          });
          return result;
        },
        { timeout: 15000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
}

export async function mutateSmoke(actorId: string, raw: unknown) {
  const command = commandSchema.parse(raw);
  return operation(
    actorId,
    command.operationId,
    command,
    "runId" in command
      ? command.runId
      : command.action === "createRun"
        ? command.copyId
        : null,
    async (tx, user) => {
      const c = command;
      if (c.action === "createRun") {
        if (!isSmokeManager(user) && c.venueId !== user.homeVenueId)
          fail("Create runs at your assigned venue.", 403);
        if (!(await tx.venue.findUnique({ where: { id: c.venueId } })))
          fail("Choose an existing venue.");
        const source = c.copyId
          ? await tx.smokeLot.findMany({ where: { runId: c.copyId } })
          : [];
        const id = randomUUID();
        await audit(
          tx,
          user,
          "RUN",
          id,
          0,
          null,
          c.data,
          "Created run",
          "CREATE",
        );
        await tx.smokeRun.create({
          data: {
            id,
            businessDate: new Date(`${c.date}T00:00:00Z`),
            venueId: c.venueId,
            createdById: user.id,
            data: json(c.data),
          },
        });
        for (const old of source) {
          const next = freshLotFromSetup(lotSchema.parse(old.data));
          next.plan.cookName = c.data.cookName;
          next.plan.assignedUserId = user.id;
          await createLot(tx, user, id, next);
        }
        return { id };
      }
      if (c.action === "profile") {
        if (!isSmokeManager(user))
          fail("Managers maintain reusable procedures.", 403);
        if (!c.profileId) {
          const id = randomUUID();
          await audit(
            tx,
            user,
            "PROFILE",
            id,
            0,
            null,
            c.data,
            "Created procedure",
            "CREATE",
          );
          await tx.smokeProfile.create({
            data: { id, createdById: user.id, data: json(c.data) },
          });
          return { id };
        }
        await tx.$queryRaw`SELECT id FROM "SmokeProfile" WHERE id = ${c.profileId} FOR UPDATE`;
        const old =
          (await tx.smokeProfile.findUnique({ where: { id: c.profileId } })) ??
          fail("Procedure not found.", 404);
        expectRevision(old.revision, c.revision);
        correction(c.reason);
        await audit(
          tx,
          user,
          "PROFILE",
          old.id,
          old.revision + 1,
          old.data,
          c.data,
          c.reason,
        );
        await tx.smokeProfile.update({
          where: { id: old.id },
          data: { data: json(c.data), revision: { increment: 1 } },
        });
        return { id: old.id };
      }
      const run = await accessible(tx, user, c.runId);
      if (c.action === "editRun") {
        if (!isSmokeManager(user) && run.createdById !== user.id)
          fail(
            "Only the run creator or a manager can change run details.",
            403,
          );
        expectRevision(run.revision, c.revision);
        correction(c.reason);
        await audit(
          tx,
          user,
          "RUN",
          run.id,
          run.revision + 1,
          run.data,
          c.data,
          c.reason,
        );
        await tx.smokeRun.update({
          where: { id: run.id },
          data: { data: json(c.data), revision: { increment: 1 } },
        });
        await reopen(tx, user, run.id, `Run correction: ${c.reason}`);
        return { id: run.id };
      }
      const lot = c.lotId
        ? ((await tx.smokeLot.findFirst({
            where: { id: c.lotId, runId: run.id },
          })) ?? fail("Lot not found.", 404))
        : null;
      if (lot && !canEditSmokeLot(user, lot))
        fail(
          "Only the lot creator, assigned cook or a manager can change this lot.",
          403,
        );
      if (lot) expectRevision(lot.revision, c.revision);
      if (c.action === "saveLot") {
        const old = lot ? lotSchema.parse(lot.data) : null;
        if (
          !isSmokeManager(user) &&
          c.plan.assignedUserId !== (old?.plan.assignedUserId ?? user.id)
        )
          fail("Managers assign other cooks.", 403);
        if (
          c.plan.assignedUserId &&
          !(await tx.user.findUnique({ where: { id: c.plan.assignedUserId } }))
        )
          fail("Assigned cook not found.");
        let recipe = old?.recipe ?? null,
          project = old?.project ?? null;
        if (c.plan.recipeId !== old?.plan.recipeId) {
          const row = c.plan.recipeId
            ? await tx.recipe.findUnique({
                where: { id: c.plan.recipeId },
                select: {
                  id: true,
                  name: true,
                  version: true,
                  instructions: true,
                  yieldQty: true,
                  yieldUnit: true,
                },
              })
            : null;
          if (c.plan.recipeId && !row) fail("Recipe not found.");
          recipe = row;
        }
        if (c.plan.projectId !== old?.plan.projectId) {
          const row = c.plan.projectId
            ? await tx.productionJob.findUnique({
                where: { id: c.plan.projectId },
                select: {
                  id: true,
                  recipeId: true,
                  recipeName: true,
                  contextLabel: true,
                },
              })
            : null;
          if (c.plan.projectId && !row) fail("Production project not found.");
          project = row;
        }
        if (project && c.plan.recipeId && project.recipeId !== c.plan.recipeId)
          fail("The selected recipe does not match the production project.");
        if (
          c.plan.profileId &&
          (c.plan.profileId !== old?.plan.profileId ||
            c.plan.profileRevision !== old?.plan.profileRevision)
        ) {
          const profile = await tx.smokeProfile.findUnique({
            where: { id: c.plan.profileId },
          });
          if (!profile || profile.revision !== c.plan.profileRevision)
            fail("Refresh the reusable procedure before applying it.", 409);
        }
        if (
          c.actual.summary?.photoId &&
          !(await tx.smokePhoto.findFirst({
            where: { id: c.actual.summary.photoId, runId: run.id },
          }))
        )
          fail("Choose a source photo from this run.");
        const data: SmokeLotData = {
          plan: c.plan,
          actual: c.actual,
          recipe,
          project,
          status: "OPEN",
          review: null,
        };
        if (lot) {
          await writeLot(tx, user, lot, data, c.reason);
          return { id: lot.id };
        }
        return { id: (await createLot(tx, user, run.id, data)).id };
      }
      if (!lot) throw new SmokeError("Choose a lot.");
      const data = lotSchema.parse(lot.data);
      correction(c.reason);
      if (c.action === "state") {
        if (c.status === "REVIEWED" && !isSmokeManager(user))
          fail("Managers review smoking records.", 403);
        if (c.status === "REVIEWED" && data.status !== "SUBMITTED")
          fail("Submit the lot before manager review.");
        const next = {
          ...data,
          status: c.status,
          review:
            c.status === "REVIEWED"
              ? {
                  actorId: user.id,
                  actorName: user.name,
                  at: new Date().toISOString(),
                  note: c.reason,
                }
              : null,
        };
        await writeLot(tx, user, lot, next, c.reason);
        return { id: lot.id };
      }
      const prior = c.readingId
        ? ((await tx.smokeReading.findFirst({
            where: { id: c.readingId, lotId: lot.id },
          })) ?? fail("Reading not found.", 404))
        : null;
      if (prior) expectRevision(prior.revision, c.readingRevision);
      const id = prior?.id ?? randomUUID(),
        rev = prior ? prior.revision + 1 : 0;
      await audit(
        tx,
        user,
        "READING",
        id,
        rev,
        prior?.data ?? null,
        c.data,
        c.reason,
        prior ? "CORRECT" : "CREATE",
      );
      if (prior)
        await tx.smokeReading.update({
          where: { id },
          data: { data: json(c.data), revision: rev },
        });
      else
        await tx.smokeReading.create({
          data: { id, lotId: lot.id, createdById: user.id, data: json(c.data) },
        });
      await writeLot(
        tx,
        user,
        lot,
        { ...data, status: "OPEN", review: null },
        `Checkpoint: ${c.reason}`,
      );
      return { id };
    },
  );
}

export async function uploadSmokePhoto(
  actorId: string,
  input: {
    operationId: string;
    runId: string;
    lotId: string | null;
    filename: string;
  },
  file: Awaited<ReturnType<typeof compactSmokeDocument>>,
) {
  const fields = z
    .object({
      operationId: z.string().uuid(),
      runId: referenceId,
      lotId: referenceId.nullable(),
      filename: z.string().min(1).max(200),
    })
    .parse(input);
  return operation(
    actorId,
    fields.operationId,
    { ...fields, hash: file.fileHash },
    fields.runId,
    async (tx, user) => {
      const run = await accessible(tx, user, fields.runId);
      if (fields.lotId) {
        const lot =
          (await tx.smokeLot.findFirst({
            where: { id: fields.lotId, runId: run.id },
          })) ?? fail("Lot not found.", 404);
        if (!canEditSmokeLot(user, lot))
          fail("You cannot attach documents to this lot.", 403);
      } else if (!isSmokeManager(user) && run.createdById !== user.id)
        fail("Attach the photo to your assigned lot.", 403);
      const existing = await tx.smokePhoto.findUnique({
        where: { runId_fileHash: { runId: run.id, fileHash: file.fileHash } },
      });
      if (existing) return { id: existing.id };
      const id = randomUUID(),
        metadata = {
          filename: fields.filename,
          mime: file.mime,
          pages: file.pages,
          originalBytes: file.originalBytes,
          storedBytes: file.storedBytes,
          uploadedBy: user.name,
        };
      await audit(
        tx,
        user,
        "PHOTO",
        id,
        0,
        null,
        metadata,
        "Source document uploaded",
        "CREATE",
      );
      await tx.smokePhoto.create({
        data: {
          id,
          runId: run.id,
          lotId: fields.lotId,
          createdById: user.id,
          fileHash: file.fileHash,
          metadata,
          data: new Uint8Array(file.data),
          preview: new Uint8Array(file.preview),
        },
      });
      await reopen(
        tx,
        user,
        run.id,
        "New source document requires review",
        fields.lotId ?? undefined,
      );
      return { id };
    },
  );
}
export async function getSmokeRun(user: Actor, id: string) {
  const run = await prisma.smokeRun.findFirst({
    where: { id, ...smokeScope(user) },
    include: {
      venue: { select: { name: true } },
      lots: {
        orderBy: { createdAt: "asc" },
        include: { readings: { orderBy: { createdAt: "asc" } } },
      },
      photos: {
        select: { id: true, lotId: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!run) return null;
  const ids = [
    run.id,
    ...run.lots.flatMap((lot) => [lot.id, ...lot.readings.map((r) => r.id)]),
    ...run.photos.map((p) => p.id),
  ];
  const history = await prisma.smokeAudit.findMany({
    where: { entityId: { in: ids }, entityType: { not: "REQUEST" } },
    orderBy: { createdAt: "desc" },
  });
  return { ...run, history };
}
export async function listSmokeRuns(
  user: Actor,
  filters: {
    from?: string;
    to?: string;
    venue?: string;
    product?: string;
    smoker?: string;
    cook?: string;
  },
) {
  const contains = (path: string[], value: string): Prisma.JsonFilter => ({
    path,
    string_contains: value.slice(0, 160),
    mode: "insensitive",
  });
  const date = (value: string | undefined) =>
    value && smokeDate.safeParse(value).success
      ? new Date(`${value}T00:00:00Z`)
      : undefined;
  return prisma.smokeRun.findMany({
    where: {
      AND: [
        smokeScope(user),
        { businessDate: { gte: date(filters.from), lte: date(filters.to) } },
        ...(filters.venue ? [{ venueId: filters.venue }] : []),
        ...(filters.product
          ? [
              {
                lots: {
                  some: {
                    data: contains(["plan", "product"], filters.product),
                  },
                },
              },
            ]
          : []),
        ...(filters.smoker
          ? [{ data: contains(["smoker"], filters.smoker) }]
          : []),
        ...(filters.cook
          ? [
              {
                OR: [
                  { data: contains(["cookName"], filters.cook) },
                  {
                    lots: {
                      some: {
                        data: contains(["plan", "cookName"], filters.cook),
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      venue: { select: { name: true } },
      lots: { orderBy: { createdAt: "asc" } },
    },
  });
}
export type SmokeRunView = NonNullable<Awaited<ReturnType<typeof getSmokeRun>>>;
export type SmokeRunRow = SmokeRun & { data: Prisma.JsonValue };
