import { createHash } from "node:crypto";
import { prisma } from "../db/prisma";
import { serializable, lockDay, json, type Tx } from "../prep/prep-workflow";
import { convertQty } from "../recipes/units";
import { jobSourceSchema, finishJobSchema, reviewedYieldSchema, type JobSource } from "./production-job-options";

const openStatuses = ["REQUESTED", "PRINTED", "IN_PROGRESS"];
const signature = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function productionTarget(tx: Tx, source: JobSource) {
  if (source.kind === "PREP") {
    const line = await tx.prepOrderLine.findUnique({ where: { id: source.lineId }, include: { prepOrder: true, recipe: true } });
    if (!line?.lot) throw new Error("This prep project needs a printed lot before work can start.");
    const lines = await tx.prepOrderLine.findMany({
      where: { lot: line.lot, recipeId: line.recipeId, prepOrder: { forDate: line.prepOrder.forDate } },
      include: { destinationVenue: { select: { name: true } } }, orderBy: { id: "asc" },
    });
    const quantities = lines.map(row => convertQty(row.requestedQty, row.requestedUnit, line.recipe.yieldUnit));
    return {
      targetKey: `PREP:${line.prepOrder.forDate.toISOString().slice(0, 10)}:${line.recipeId}:${line.lot}`,
      kind: "PREP" as const, businessDate: line.prepOrder.forDate, recipeId: line.recipeId, recipeName: line.recipe.name,
      contextLabel: `Prep · ${[...new Set(lines.map(row => row.destinationVenue.name))].join(" / ")}`,
      lot: line.lot, expectedQty: quantities.every(q => q != null) ? quantities.reduce<number>((sum, q) => sum + q!, 0) * source.scale : null,
      expectedUnit: line.recipe.yieldUnit, printScale: source.scale,
      requestLineIds: lines.map(row => row.id), sourceRef: source,
      sourceSignature: signature(lines.map(row => [row.id, row.recipeId, row.requestedQty, row.requestedUnit, row.lot])),
      available: lines.every(row => openStatuses.includes(row.status) && !row.productionBatchId),
    };
  }
  const line = await tx.banquetMenuItem.findUnique({ where: { id: source.lineId }, include: { banquet: { include: { venue: true } }, recipe: true } });
  if (!line) throw new Error("Banquet project not found.");
  return {
    targetKey: `BANQUET:${line.id}`, kind: "BANQUET" as const, businessDate: line.banquet.date,
    recipeId: line.recipeId, recipeName: line.recipe.name, contextLabel: `${line.banquet.name} · ${line.banquet.venue.name}`,
    lot: null, expectedQty: line.orderedQty, expectedUnit: line.unit, printScale: 1,
    requestLineIds: [] as string[], sourceRef: source,
    sourceSignature: signature([line.id, line.recipeId, line.orderedQty, line.unit, line.banquet.date]),
    available: ["PLANNED", "CONFIRMED"].includes(line.banquet.status),
  };
}

export async function startProductionJob(userId: string, input: unknown, cookName: string) {
  const source = jobSourceSchema.parse(input);
  const name = cookName.trim();
  if (!name || name.length > 120) throw new Error("Enter the cook's name or initials (up to 120 characters).");
  return serializable(async tx => {
    const actor = await tx.user.findUnique({ where: { id: userId } });
    if (!actor) throw new Error("Sign in again before starting work.");
    const target = await productionTarget(tx, source);
    const existing = await tx.productionJob.findUnique({ where: { targetKey: target.targetKey } });
    if (existing) return existing;
    if (target.kind === "PREP") await lockDay(tx, target.businessDate);
    const { available, ...facts } = target;
    if (!available) throw new Error("This project is completed or cancelled. Its records are read-only.");
    return tx.productionJob.create({ data: { ...facts, sourceRef: json(source), requestLineIds: json(facts.requestLineIds), cookName: name, startedByUserId: actor.id } });
  });
}

export async function finishProductionJob(userId: string, input: unknown) {
  const data = finishJobSchema.parse(input);
  return serializable(async tx => {
    const actor = await tx.user.findUnique({ where: { id: userId } });
    const job = await tx.productionJob.findUniqueOrThrow({ where: { id: data.jobId } });
    if (!actor || (actor.role === "STAFF" && actor.id !== job.startedByUserId)) throw new Error("Only the cook who started this project or a manager can finish it.");
    if (job.finishedAt) {
      if (job.actualQty === data.actualQty && job.actualUnit === data.actualUnit && (job.notes ?? "") === data.notes) return job;
      throw new Error("These results have already been submitted. Ask an admin to record a review note.");
    }
    if (job.kind === "PREP") await lockDay(tx, job.businessDate);
    if (convertQty(1, data.actualUnit, job.expectedUnit) == null) throw new Error(`Use a yield unit compatible with ${job.expectedUnit}.`);
    return tx.productionJob.update({ where: { id: job.id }, data: {
      actualQty: data.actualQty, actualUnit: data.actualUnit, notes: data.notes || null, labeledAndDated: true,
      finishedAt: new Date(), finishedByUserId: actor.id,
    } });
  });
}

export async function reviewProductionJob(userId: string, jobId: string, reviewNote: string, reviewedYield?: unknown) {
  if (reviewNote.trim().length > 5000) throw new Error("Keep review notes under 5000 characters.");
  return serializable(async tx => {
    const actor = await tx.user.findUnique({ where: { id: userId } });
    if (actor?.role !== "ADMIN") throw new Error("Admin authorization required.");
    const job = await tx.productionJob.findUniqueOrThrow({ where: { id: jobId } });
    if (!job.finishedAt) throw new Error("Finish the project and submit its yield before reviewing it.");
    if (job.reviewedAt) return job;
    const checked = reviewedYieldSchema.parse(reviewedYield ?? { quantity: job.actualQty, unit: job.actualUnit });
    if (convertQty(1, checked.unit, job.expectedUnit) == null) throw new Error(`Use a reviewed unit compatible with ${job.expectedUnit}.`);
    if ((checked.quantity !== job.actualQty || checked.unit !== job.actualUnit) && !reviewNote.trim()) throw new Error("Explain the yield correction in the review note.");
    return tx.productionJob.update({ where: { id: job.id }, data: { reviewedAt: new Date(), reviewedByUserId: actor.id, reviewNote: reviewNote.trim() || null, reviewedQty: checked.quantity, reviewedUnit: checked.unit } });
  });
}

export async function loadProductionTarget(source: JobSource) {
  return prisma.$transaction(tx => productionTarget(tx, source));
}
