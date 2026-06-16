/**
 * One-time, idempotent backfill to migrate an existing database onto the prep
 * module safely. The new `Recipe.prodCode` column is NOT NULL + UNIQUE, which
 * `prisma db push` cannot add to a populated table. This script:
 *
 *   1. Adds `prodCode` / `holdLifeDays` as NULLABLE columns (if missing).
 *   2. Generates a unique 3-char production code for every recipe that lacks
 *      one (respecting any codes already present).
 *
 * After running this, `npm run db:push` succeeds: it creates the PrepOrder /
 * PrepOrderLine tables and promotes `prodCode` to NOT NULL + UNIQUE, because
 * every row now holds a unique value.
 *
 * Usage (from the project root, with DATABASE_URL set):
 *   npx tsx scripts/backfill-prep-prodcodes.ts
 *
 * Safe to re-run — it only fills codes that are still NULL.
 */
import { PrismaClient } from "@prisma/client";
import { generateProdCode } from "../lib/prep";

const prisma = new PrismaClient();

async function main() {
  // 1. Ensure the columns exist as nullable so we can populate before db push.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "prodCode" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "holdLifeDays" INTEGER;`);

  // 2. Read raw (the column may still be NULL, which the typed client dislikes).
  const recipes = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; prodCode: string | null }>>(
    `SELECT id, name, "prodCode" FROM "Recipe" ORDER BY "createdAt" ASC;`,
  );

  const taken = new Set<string>();
  for (const r of recipes) if (r.prodCode) taken.add(r.prodCode);

  let filled = 0;
  for (const r of recipes) {
    if (r.prodCode) continue;
    const code = generateProdCode(r.name ?? "", taken);
    taken.add(code);
    await prisma.$executeRawUnsafe(`UPDATE "Recipe" SET "prodCode" = $1 WHERE id = $2;`, code, r.id);
    filled++;
  }

  console.log(`Recipes: ${recipes.length} · codes backfilled: ${filled} · already set: ${recipes.length - filled}`);
  console.log("Now run:  npm run db:push");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
