import { z } from "zod";
import { prisma } from "../db/prisma";
import { json, serializable, type Tx } from "../prep/prep-workflow";
import { effectiveAllergens, parseAllergens, serializeAllergens } from "../recipes/allergens";
import { preservationCatalogCost, preservationCreateSchema, preservationFactsSchema, preservationFinishSchema, preservationMetrics, type PreservationFacts } from "./preservation";

const target = { id: z.string().uuid(), revision: z.number().int().positive() };
export const preservationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: preservationCreateSchema }).strict(),
  z.object({ action: z.literal("finish"), ...target, data: preservationFinishSchema }).strict(),
  z.object({ action: z.literal("post"), ...target, expectedCost: z.number().finite(), expectedUnit: z.string().min(1).max(40) }).strict(),
  z.object({ action: z.literal("void"), ...target, reason: z.string().trim().min(1).max(1000) }).strict(),
]);
async function actor(tx: Pick<Tx, "user">, id: string) {
  const user = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, homeVenueId: true } });
  if (!user) throw new Error("Sign in again.");
  return user;
}
const future = (at: string) => new Date(at).getTime() > Date.now() + 5 * 60000;
export async function mutatePreservation(userId: string, raw: unknown) {
  const command = preservationCommandSchema.parse(raw);
  return serializable(async tx => {
    const user = await actor(tx, userId);
    const manager = user.role !== "STAFF";
    if (command.action === "create") {
      const input = command.data;
      if (!manager && input.venueId !== user.homeVenueId) throw new Error("Create batches only for your assigned venue.");
      const existing = await tx.preservationBatch.findUnique({ where: { id: input.id } });
      if (existing) {
        if (existing.createdById !== user.id || JSON.stringify(preservationFactsSchema.parse(existing.facts).input) !== JSON.stringify(input)) throw new Error("This batch key was already used for a different entry.");
        return existing;
      }
      if (future(input.startedAt)) throw new Error("Start time cannot be in the future.");
      const venue = await tx.venue.findUniqueOrThrow({ where: { id: input.venueId } });
      const recipe = input.recipeId ? await tx.recipe.findUnique({ where: { id: input.recipeId } }) : null;
      const item = input.itemId ? await tx.item.findUnique({ where: { id: input.itemId } }) : null;
      if (input.recipeId && !recipe || input.itemId && !item) throw new Error("A selected recipe or ingredient was removed. Reload before creating this batch.");
      const recipes = recipe ? await tx.recipe.findMany({ select: { id: true, allergens: true, items: { select: { item: { select: { allergens: true } } } }, components: { select: { childId: true } } } }) : [];
      const tags = new Set([...input.allergens, ...parseAllergens(item?.allergens), ...(recipe ? effectiveAllergens(recipe.id, new Map(recipes.map(row => [row.id, row]))) : [])]);
      const facts: PreservationFacts = { version: 1, input, venueName: venue.name,
        recipe: recipe ? { id: recipe.id, name: recipe.name, version: recipe.version } : null,
        item: item ? { id: item.id, name: item.name, unit: item.unit } : null,
        allergens: serializeAllergens(tags), finished: null, posting: null, void: null };
      preservationMetrics(input, null);
      const batch = await tx.preservationBatch.create({ data: { id: input.id, venueId: venue.id, createdById: user.id, facts: json(facts) } });
      await tx.preservationAudit.create({ data: { batchId: batch.id, actorId: user.id, actorName: user.name, action: "CREATE", detail: json({ revision: 1, facts }) } });
      return batch;
    }
    const batch = await tx.preservationBatch.findUniqueOrThrow({ where: { id: command.id } });
    if (!manager && batch.createdById !== user.id) throw new Error("Only the batch creator or a manager can finish this batch.");
    const facts = preservationFactsSchema.parse(batch.facts);
    if (["post", "void"].includes(command.action) && !manager) throw new Error("Manager access required.");
    if (command.action === "post" && facts.posting) return batch;
    if (command.action === "finish" && batch.status === "FINISHED" && JSON.stringify(facts.finished) === JSON.stringify(command.data)) return batch;
    if (command.action === "void" && batch.status === "VOID" && facts.void?.reason === command.reason) return batch;
    if (batch.status === "VOID") throw new Error("This batch is void and remains read-only.");
    if (batch.revision !== command.revision) throw new Error("This batch changed in another session. Reload before continuing.");
    let status = batch.status;
    if (command.action === "finish") {
      if (batch.status !== "RUNNING") throw new Error("Finished results cannot be replaced. Ask a manager to void and recreate the batch.");
      if (future(command.data.finishedAt)) throw new Error("Finish time cannot be in the future.");
      const metrics = preservationMetrics(facts.input, command.data);
      if (metrics.yieldPct! > 100 && !command.data.notes) throw new Error("Explain the weight gain in the finish notes.");
      facts.finished = command.data; status = "FINISHED";
    } else if (command.action === "post") {
      if (batch.status !== "FINISHED" || !facts.finished || !facts.item) throw new Error("Finish the batch and link an output ingredient before posting a cost.");
      const item = await tx.item.findUnique({ where: { id: facts.item.id } });
      if (!item) throw new Error("The linked ingredient was removed. This batch's historical facts are preserved.");
      if (item.unit !== command.expectedUnit || item.unitCost !== command.expectedCost) throw new Error("The catalog price or cost unit changed. Reload and review the new cost proposal.");
      const cost = preservationCatalogCost(facts, item.unit);
      if (cost === null) throw new Error("A positive finished weight and a compatible weight-based catalog unit are required.");
      const changed = await tx.item.updateMany({ where: { id: item.id, unit: command.expectedUnit, unitCost: command.expectedCost }, data: { unitCost: cost, priceUpdatedAt: new Date() } });
      if (!changed.count) throw new Error("Catalog price changed. Reload before posting.");
      facts.posting = { at: new Date().toISOString(), actorName: user.name, previousCost: item.unitCost, cost, unit: item.unit };
    } else {
      if (facts.posting) throw new Error("A posted batch remains a cost reference. Correct catalog prices through the ingredient editor.");
      facts.void = { at: new Date().toISOString(), actorName: user.name, reason: command.reason }; status = "VOID";
    }
    const updated = await tx.preservationBatch.updateMany({ where: { id: batch.id, revision: command.revision }, data: { facts: json(facts), status, revision: { increment: 1 } } });
    if (!updated.count) throw new Error("This batch changed in another session. Reload before continuing.");
    await tx.preservationAudit.create({ data: { batchId: batch.id, actorId: user.id, actorName: user.name, action: command.action.toUpperCase(), detail: json({ revision: command.revision + 1, facts }) } });
    return tx.preservationBatch.findUniqueOrThrow({ where: { id: batch.id } });
  });
}

export async function getPreservationBatch(userId: string, id: string) {
  const user = await actor(prisma, userId);
  const batch = await prisma.preservationBatch.findUnique({ where: { id }, include: { audits: { orderBy: { createdAt: "asc" }, select: { id: true, action: true, actorName: true, createdAt: true } } } });
  if (!batch || user.role === "STAFF" && batch.createdById !== user.id && batch.venueId !== user.homeVenueId) return null;
  return batch;
}
export async function listPreservationBatches(userId: string, status?: "RUNNING" | "FINISHED" | "VOID") {
  const user = await actor(prisma, userId);
  return prisma.preservationBatch.findMany({ where: { ...(user.role === "STAFF" ? { OR: [{ createdById: user.id }, ...(user.homeVenueId ? [{ venueId: user.homeVenueId }] : [])] } : {}), ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
}
