import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { convertQty, unitFamily } from "../recipes/units";
import { buildCostMap, buildPriceGapMap } from "../recipes/costing";
import { affectedRecipes } from "./measurement-impact";
import { convertIngredientQty, ingredientPurchaseQuantity } from "./measurements";

export const measurementSchema = z.object({
  unit: z.string().trim().min(1).max(40), packQty: z.number().finite().positive().max(1e8).nullable(), packUnit: z.string().trim().min(1).max(40).nullable(),
  eachLabel: z.string().trim().min(1).max(30).refine(label => unitFamily(label) == null || convertQty(1, label, "each") === 1, "Each label must describe one item, such as head or each."),
  eachWeightOz: z.number().finite().positive().max(1e7).nullable(), densityGPerMl: z.number().finite().positive().max(1000).nullable(),
  yieldFactor: z.number().finite().positive().max(1), usableCosting: z.boolean(),
}).strict().refine(data => (data.packQty == null) === (data.packUnit == null), "Provide both purchasing pack quantity and unit, or leave both blank.");
export type MeasurementSettings = z.infer<typeof measurementSchema>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function measurementPreview(tx: Prisma.TransactionClient, id: string, input: unknown) {
  const settings = measurementSchema.parse(input);
  const [item, recipes] = await Promise.all([
    tx.item.findUniqueOrThrow({ where: { id } }),
    tx.recipe.findMany({ include: { items: { include: { item: true }, orderBy: { id: "asc" } }, components: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
  ]);
  const affected = affectedRecipes(recipes, [id]);
  const conversion = settings.unit === item.unit ? 1 : convertIngredientQty(1, item.unit, settings.unit, { ...item, ...settings, unit: item.unit, packQty: item.packQty, packUnit: item.packUnit });
  if (conversion == null || conversion <= 0) throw new Error("The old cost unit cannot convert to the proposed unit. Confirm each weight, density or pack contents first.");
  const proposedItem = { ...item, ...settings, unitCost: item.unitCost / conversion, measurementReviewedAt: new Date(0) };
  const before = buildCostMap(recipes), after = buildCostMap(recipes.map(recipe => ({ ...recipe, items: recipe.items.map(line => line.itemId === id ? { ...line, item: proposedItem } : line) })));
  const gaps=buildPriceGapMap(recipes.map(recipe=>({id:recipe.id,components:recipe.components,items:recipe.items.map(({item})=>({itemId:item.id,unitCost:item.unitCost,priceUpdatedAt:item.priceUpdatedAt}))})));
  const rows = affected.map(recipe => ({ id: recipe.id, name: recipe.name,
    pricePending:!!gaps.get(recipe.id)?.unpriced.size,
    before: !gaps.get(recipe.id)?.unpriced.size && Number.isFinite(before.get(recipe.id)) ? before.get(recipe.id)! : null,
    after: !gaps.get(recipe.id)?.unpriced.size && Number.isFinite(after.get(recipe.id)) ? after.get(recipe.id)! : null,
    lines: recipe.items.filter(line => line.itemId === id).map(line => ({ id: line.id, quantity: line.quantity, unit: line.unit, purchased: ingredientPurchaseQuantity(line.quantity, line.unit, proposedItem) })) }));
  const dependencies = new Set(affected.map(recipe=>recipe.id)), queue=[...dependencies], byId=new Map(recipes.map(recipe=>[recipe.id,recipe]));
  for(let i=0;i<queue.length;i++)for(const component of byId.get(queue[i])?.components??[])if(!dependencies.has(component.childId)){dependencies.add(component.childId);queue.push(component.childId);}
  // Include every dependency of an affected parent, while allowing unrelated kitchen work.
  const token = createHash("sha256").update(JSON.stringify({ item, recipes:recipes.filter(recipe=>dependencies.has(recipe.id)), settings })).digest("hex");
  return { item, settings, proposedItem, token, rows, blocked: rows.some(row => !Number.isFinite(after.get(row.id)) || row.lines.some(line => line.purchased == null)) };
}
export async function applyMeasurements(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ id: z.string().min(1), operationId: z.string().uuid(), token: z.string().length(64), settings: measurementSchema, confirmedBasis: z.literal(true) }).strict().parse(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (!actor || actor.role === "STAFF") throw new Error("Manager access required.");
        const receipt = await tx.ingredientMeasurementChange.findUnique({ where: { id: input.operationId } });
        if (receipt) { if (receipt.actorId !== actorId || receipt.requestHash !== requestHash) throw new Error("This review key belongs to a different change."); return { ok: true as const }; }
        const preview = await measurementPreview(tx, input.id, input.settings);
        if (preview.token !== input.token) throw new Error("Ingredient or recipe data changed. Preview the latest impact before applying.");
        if (preview.blocked) throw new Error("Resolve unknown recipe costs or conversions before applying this change.");
        const saved=await tx.item.update({ where: { id: input.id }, data: { ...input.settings, unitCost: preview.proposedItem.unitCost, ...(preview.item.unit !== input.settings.unit ? { priceUpdatedAt: new Date() } : {}), measurementReviewedAt: new Date(), measurementRevision:{increment:1} } });
        await tx.ingredientMeasurementChange.create({ data: { id: input.operationId, itemId: input.id, actorId, requestHash, before: json(preview.item), after: json(saved), impact: json(preview.rows) } });
        return { ok: true as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue; throw error; }
  }
  throw new Error("The ingredient is busy. Retry this reviewed change.");
}
