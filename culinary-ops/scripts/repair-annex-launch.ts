// Preview by default. --apply requires a new --snapshot=/absolute/path.json.
// Run against the intended database only after reviewing the printed changes.
import { PrismaClient, Prisma } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { ANNEX_METHODS, ANNEX_SERVICE_COPY, cleanedAnnexInstructions, missingAnnexMethod } from "../lib/annex-launch-repairs";
import { parseAllergens, serializeAllergens, effectiveAllergens } from "../lib/allergens";
import { convertQty } from "../lib/units";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const snapshotPath = process.argv.find(arg => arg.startsWith("--snapshot="))?.slice(11);

async function main() {
  const rollout = await prisma.menuRollout.findFirstOrThrow({ where: { name: "Annex Small Plates" }, include: { items: true } });
  const recipes = await prisma.recipe.findMany({ include: { items: { include: { item: true } }, components: true } });
  const targets = [
    ...Object.entries(ANNEX_METHODS).map(([prodCode, spec]) => ({ prodCode, name: spec.name })),
    { prodCode: "GCS", name: "Golden Chicken Stock" },
    { prodCode: "SVC", name: "Sous Vide Carrots" },
    { prodCode: "GRG", name: "Green Goddess" },
  ].map(target => {
    const matches = recipes.filter(recipe => recipe.name === target.name && (recipe.prodCode === target.prodCode || (target.prodCode === "PB6" && recipe.prodCode === "PBG")));
    if (matches.length !== 1) throw new Error(`Expected one ${target.name}; found ${matches.length}.`);
    return { code: target.prodCode, recipe: matches[0] };
  });
  const hazelnuts = await prisma.item.findMany({ where: { name: "Nut, Hazelnut", sku: "06481", gcode: "G000000512" } });
  if (!hazelnuts.length) throw new Error("Hazelnut SKU 06481 / G000000512 was not found.");
  const pesto = targets.find(target => target.code === "CAW")!.recipe;
  const carrot = targets.find(target => target.code === "PB6")!.recipe;
  if (!pesto.items.some(line => hazelnuts.some(item => item.id === line.itemId)) || !carrot.components.some(line => line.childId === pesto.id)) {
    throw new Error("Verify the hazelnut → pesto → plated carrot links before applying repairs.");
  }
  const recipePatches = targets.flatMap(({ code, recipe }) => {
    const data: Prisma.RecipeUpdateInput = {};
    const missing = missingAnnexMethod(code, recipe.instructions);
    if (missing) {
      data.instructions = missing.instructions;
      if (recipe.prepMinutes == null) data.prepMinutes = missing.prepMinutes;
      if (recipe.cookMinutes == null) data.cookMinutes = missing.cookMinutes;
    } else {
      const instructions = cleanedAnnexInstructions(code, recipe.instructions);
      if (instructions !== (recipe.instructions ?? "")) data.instructions = instructions;
    }
    return Object.keys(data).length ? [{ recipe, data }] : [];
  });
  const allergenPatches = hazelnuts.flatMap(item => {
    const allergens = serializeAllergens([...parseAllergens(item.allergens), "tree_nuts"]);
    return allergens !== item.allergens ? [{ item, allergens }] : [];
  });
  const copyPatches = rollout.items.flatMap(line => {
    const target = targets.find(target => target.recipe.id === line.recipeId);
    const menuDescription = target && ANNEX_SERVICE_COPY[target.code as keyof typeof ANNEX_SERVICE_COPY];
    return menuDescription && menuDescription !== line.menuDescription ? [{ line, menuDescription }] : [];
  });
  const sixPiece = targets.find(target => target.code === "PPF")!.recipe;
  const caviarLines = sixPiece.items.filter(line => line.item.name === "Caviar, Paddlefish");
  if (caviarLines.length !== 1) throw new Error("Expected exactly one Paddlefish Caviar line on the six-piece recipe.");
  const caviar = caviarLines[0];
  const caviarQty = convertQty(3.5, "g", caviar.unit);
  if (caviarQty == null) throw new Error("Caviar quantity requires a supported weight unit.");
  const caviarNote = "Approximately 3.5 g total per six-piece order";
  const caviarChanged = caviar.quantity !== caviarQty || caviar.note !== caviarNote;
  const preview = {
    mode: apply ? "apply" : "preview", rollout: rollout.name,
    recipes: recipePatches.map(({ recipe, data }) => ({ id: recipe.id, code: recipe.prodCode, name: recipe.name, before: { instructions: recipe.instructions, prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes }, after: data })),
    allergens: allergenPatches.map(({ item, allergens }) => ({ id: item.id, name: item.name, before: item.allergens, after: allergens })),
    serviceCopy: copyPatches.map(({ line, menuDescription }) => ({ id: line.id, before: line.menuDescription, after: menuDescription })),
    caviar: caviarChanged ? { id: caviar.id, before: { quantity: caviar.quantity, unit: caviar.unit, note: caviar.note }, after: { quantity: caviarQty, unit: caviar.unit, note: caviarNote } } : null,
  };
  console.log(JSON.stringify(preview, null, 2));
  if (!apply) return;
  if (!snapshotPath?.startsWith("/")) throw new Error("--apply requires --snapshot=/absolute/new-file.json to preserve the original records.");
  await writeFile(snapshotPath, JSON.stringify({ savedAt: new Date(), rollout, recipes: targets.map(target => target.recipe), hazelnuts }, null, 2), { flag: "wx", mode: 0o600 });
  await prisma.$transaction(async tx => {
    // Reject concurrent recipe/catalog changes after preview instead of overwriting them.
    for (const { recipe } of targets) {
      const current = await tx.recipe.findUniqueOrThrow({ where: { id: recipe.id } });
      if (current.updatedAt.getTime() !== recipe.updatedAt.getTime()) throw new Error(`Recipe changed during review: ${recipe.name}`);
    }
    for (const { item, allergens } of allergenPatches) {
      const result = await tx.item.updateMany({ where: { id: item.id, updatedAt: item.updatedAt }, data: { allergens } });
      if (result.count !== 1) throw new Error(`Catalog item changed during review: ${item.name}`);
    }
    if (caviarChanged) {
      const result = await tx.recipeItem.updateMany({ where: { id: caviar.id, quantity: caviar.quantity, unit: caviar.unit, note: caviar.note }, data: { quantity: caviarQty, note: caviarNote } });
      if (result.count !== 1) throw new Error("Caviar line changed during review.");
    }
    for (const { line, menuDescription } of copyPatches) {
      const result = await tx.menuRolloutItem.updateMany({ where: { id: line.id, menuDescription: line.menuDescription }, data: { menuDescription } });
      if (result.count !== 1) throw new Error("Service description changed during review.");
    }
    const changed = new Set(recipePatches.map(patch => patch.recipe.id));
    if (caviarChanged) changed.add(sixPiece.id);
    for (const id of changed) {
      const patch = recipePatches.find(patch => patch.recipe.id === id);
      const updated = await tx.recipe.update({ where: { id }, data: { ...patch?.data, version: { increment: 1 } } });
      await tx.recipeChange.create({ data: { recipeId: id, version: updated.version, summary: "Annex launch book recipe corrections", detail: JSON.stringify({ fields: patch?.data ?? {}, caviar: id === sixPiece.id && caviarChanged ? preview.caviar : undefined }) } });
    }
    const graph = await tx.recipe.findMany({ include: { items: { include: { item: true } }, components: true } });
    const byId = new Map(graph.map(recipe => [recipe.id, recipe]));
    if (!effectiveAllergens(pesto.id, byId).includes("tree_nuts") || !effectiveAllergens(carrot.id, byId).includes("tree_nuts")) throw new Error("Tree Nuts inheritance verification failed.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  console.log("Applied and verified Annex recipe, catalog, and service-copy corrections.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
