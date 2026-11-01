import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { packageBasisConflict, planIngredientReplacement } from "./ingredient-cleanup";
import { parseAllergens, serializeAllergens } from "../recipes/allergens";

export const ingredientUsageSelect = { recipeItems: true, inventoryItems: true, orderGuideLines: true, festivalOnHand: true, purchaseLines: true } as const;

export async function ingredientReplacementPreview(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Choose two different ingredients.");
  const [source, target, lines] = await Promise.all([
    tx.item.findUnique({ where: { id: sourceId }, include: { vendor: true, _count: { select: ingredientUsageSelect } } }),
    tx.item.findUnique({ where: { id: targetId }, include: { vendor: true, _count: { select: ingredientUsageSelect } } }),
    tx.recipeItem.findMany({ where: { itemId: { in: [sourceId, targetId] } }, include: { recipe: { select: { name: true, version: true } } }, orderBy: { id: "asc" } }),
  ]);
  if (!source || !target) throw new Error("An ingredient no longer exists. Refresh the ingredient list.");
  const plan = planIngredientReplacement(source.unit, target.unit, lines.filter(line => line.itemId === sourceId), lines.filter(line => line.itemId === targetId));
  if (packageBasisConflict(source, target)) for (const line of plan) line.error = "Package measurements differ. Review the recipe quantities before replacing cases, bags or other package units.";
  const otherUses = source._count.inventoryItems + source._count.orderGuideLines + source._count.festivalOnHand + source._count.purchaseLines;
  const fingerprint = createHash("sha256").update(JSON.stringify({ source, target, lines })).digest("hex");
  return { source, target, plan, otherUses, fingerprint };
}

// Serializable + review fingerprint prevent stale comparisons, partial moves,
// and concurrent edits from silently changing the reviewed result.
export async function replaceIngredientRecipes(db: PrismaClient, input: {
  sourceId: string; targetId: string; fingerprint: string; removeSource: boolean; authorId: string;
}) {
  return db.$transaction(async tx => {
    const author = await tx.user.findUnique({ where: { id: input.authorId } });
    if (!author || !["ADMIN", "MANAGER"].includes(author.role)) throw new Error("Manager authorization required.");
    const preview = await ingredientReplacementPreview(tx, input.sourceId, input.targetId);
    if (preview.fingerprint !== input.fingerprint) throw new Error("Ingredient usage changed. Review the refreshed comparison before applying.");
    const conflict = preview.plan.find(line => line.error);
    if (conflict) throw new Error(`${conflict.source.recipe.name}: ${conflict.error}`);
    if (input.removeSource && preview.otherUses) throw new Error("Inventory, order guides, festival counts or invoice history still use this ingredient. Replace recipes only, or resolve those uses before consolidating.");
    for (const line of preview.plan) {
      if (line.target) {
        await tx.recipeItem.update({ where: { id: line.target.id }, data: { quantity: line.quantity, unit: line.unit, note: line.note } });
        await tx.recipeItem.delete({ where: { id: line.source.id } });
      } else {
        await tx.recipeItem.update({ where: { id: line.source.id }, data: { itemId: input.targetId } });
      }
      const recipe = await tx.recipe.update({ where: { id: line.source.recipeId }, data: { version: { increment: 1 } } });
      await tx.recipeChange.create({ data: { recipeId: recipe.id, version: recipe.version,
        summary: "Replaced ingredient", detail: `${preview.source.name} → ${preview.target.name}${line.target ? "; combined quantities and retained prep notes" : "; quantity, unit and prep note retained"}`,
        userId: author.id, userName: author.name } });
    }
    if (input.removeSource) {
      // Only confirmed duplicates union their tags. A product substitution
      // instead inherits the replacement ingredient's own allergen tags.
      const allergens = serializeAllergens([...parseAllergens(preview.source.allergens), ...parseAllergens(preview.target.allergens)]);
      await tx.item.update({ where: { id: input.targetId }, data: { allergens: allergens || null } });
      await tx.item.delete({ where: { id: input.sourceId } });
    }
    return { replaced: preview.plan.length, removed: input.removeSource };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
