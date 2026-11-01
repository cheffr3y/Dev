// Uses the isolated cluster from test-prep-postgres.sh; never the app database.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/prep_workflow_test");
const p = new PrismaClient();
const output = await mkdtemp(join(tmpdir(), "annex-repair-test-"));
function run(...args) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/archive/repair-annex-launch.ts", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}
try {
  const nuts = await p.item.create({ data: { name: "Nut, Hazelnut", sku: "06481", gcode: "G000000512", allergens: "milk", unit: "oz" } });
  await p.item.create({ data: { name: "Nut, Hazelnut", sku: "06481", gcode: "G000000512", unit: "oz" } });
  const caviar = await p.item.create({ data: { name: "Caviar, Paddlefish", unit: "g", unitCost: .85 } });
  const specs = [
    ["BSA", "Plated, Lobster Louie", "Chef's existing Louie method"],
    ["PPF", "Plated, 6 piece", null], ["PBG", "Plated, Blistered Carrot", null],
    ["PCB", "Plated, Corned Beef Steak Frites", null], ["CAW", "Carrot Top Pesto", null],
    ["GCS", "Golden Chicken Stock", "Roast bones — Roast at 425°F.\n— Migrated notes —\nRecipe type: batch"],
    ["SVC", "Sous Vide Carrots", "Peel carrots – 5 min\nBag carrots – 2 min\n— Migrated notes —\nRecipe type: batch"],
    ["GRG", "Green Goddess", "Blend — Blend mayonnaise and crème fraîche until smooth."],
  ];
  const recipes = new Map();
  for (const [prodCode, name, instructions] of specs) recipes.set(prodCode, await p.recipe.create({ data: { prodCode, name, instructions, yieldQty: 1, yieldUnit: "serving", ...(prodCode === "BSA" ? { prepMinutes: 99 } : {}) } }));
  await p.recipeItem.create({ data: { recipeId: recipes.get("CAW").id, itemId: nuts.id, quantity: 2.8, unit: "oz" } });
  await p.recipeItem.create({ data: { recipeId: recipes.get("PPF").id, itemId: caviar.id, quantity: 2.1, unit: "g", note: ".35g per nugget" } });
  await p.recipeComponent.create({ data: { parentId: recipes.get("PBG").id, childId: recipes.get("CAW").id, quantity: 2, unit: "fl oz" } });
  const rollout = await p.menuRollout.create({ data: { name: "Annex Small Plates", items: { create: ["BSA", "PPF", "PBG", "PCB"].map(code => ({ recipeId: recipes.get(code).id, menuDescription: "Old copy" })) } } });
  assert.match(run(), /"mode": "preview"/);
  assert.equal((await p.item.findUniqueOrThrow({ where: { id: nuts.id } })).allergens, "milk");
  const snapshot = join(output, "before.json");
  assert.match(run("--apply", `--snapshot=${snapshot}`), /Applied and verified/);
  const backup = JSON.parse(await readFile(snapshot, "utf8"));
  assert.equal(backup.recipes.length, 8);
  assert.equal(backup.hazelnuts.length, 2);
  assert.equal((await p.item.findUniqueOrThrow({ where: { id: nuts.id } })).allergens, "milk,tree_nuts");
  const updated = await p.recipe.findMany({ where: { id: { in: [...recipes.values()].map(recipe => recipe.id) } } });
  for (const recipe of updated) {
    assert.doesNotMatch(recipe.instructions || "", /Migrated notes|Recipe type: batch|crème fraîche/);
    if (["PPF", "PBG", "PCB", "CAW"].includes(recipe.prodCode)) assert.ok(recipe.prepMinutes > 0 && recipe.cookMinutes > 0);
    if (recipe.prodCode === "BSA") { assert.equal(recipe.instructions, "Chef's existing Louie method"); assert.equal(recipe.prepMinutes, 99); assert.equal(recipe.version, 1); }
  }
  assert.equal((await p.recipeItem.findUniqueOrThrow({ where: { recipeId_itemId: { recipeId: recipes.get("PPF").id, itemId: caviar.id } } })).quantity, 3.5);
  assert.match((await p.menuRolloutItem.findUniqueOrThrow({ where: { rolloutId_recipeId: { rolloutId: rollout.id, recipeId: recipes.get("PPF").id } } })).menuDescription, /^Luxury/);
  assert.match((await p.menuRolloutItem.findUniqueOrThrow({ where: { rolloutId_recipeId: { rolloutId: rollout.id, recipeId: recipes.get("PCB").id } } })).menuDescription, /Chuck Flap \/ Boneless Short Rib/);
  const count = await p.recipeChange.count();
  const second = run("--apply", `--snapshot=${join(output, "second.json")}`);
  assert.match(second, /"recipes": \[\]/);
  assert.match(second, /"allergens": \[\]/);
  assert.equal(await p.recipeChange.count(), count);
  await p.menuRollout.delete({ where: { id: rollout.id } });
  await p.recipeComponent.deleteMany({ where: { parentId: { in: [...recipes.values()].map(recipe => recipe.id) } } });
  await p.recipe.deleteMany({ where: { id: { in: [...recipes.values()].map(recipe => recipe.id) } } });
  await p.item.deleteMany({ where: { OR: [{ name: "Nut, Hazelnut", sku: "06481", gcode: "G000000512" }, { id: caviar.id }] } });
  console.log("Annex record repair preview, backup, inheritance, preservation, versioning, and idempotence passed.");
} finally { await p.$disconnect(); await rm(output, { recursive: true, force: true }); }
