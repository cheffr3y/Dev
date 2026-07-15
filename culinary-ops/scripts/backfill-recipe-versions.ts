// One-time backfill: assign versions to existing RecipeChange rows and set
// each Recipe.version, using the same session rule as logChange in
// app/(app)/recipes/actions.ts — consecutive changes by the same user less
// than 30 minutes apart share a version; anything else starts a new one.
//
// Run once after `npm run db:push` adds the version columns:
//   npm run db:backfill-versions
//
// Idempotent: recomputes from createdAt/userId every run, so re-running is safe.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SESSION_WINDOW_MS = 30 * 60 * 1000;

async function main() {
  const recipes = await prisma.recipe.findMany({ select: { id: true, name: true } });

  for (const recipe of recipes) {
    const changes = await prisma.recipeChange.findMany({
      where: { recipeId: recipe.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, userId: true, version: true },
    });

    let version = 1;
    let prev: (typeof changes)[number] | null = null;
    const updates: { id: string; version: number }[] = [];

    for (const c of changes) {
      const sameSession =
        prev != null &&
        prev.userId === c.userId &&
        c.createdAt.getTime() - prev.createdAt.getTime() <= SESSION_WINDOW_MS;
      if (prev != null && !sameSession) version += 1;
      if (c.version !== version) updates.push({ id: c.id, version });
      prev = c;
    }

    await prisma.$transaction([
      ...updates.map((u) =>
        prisma.recipeChange.update({ where: { id: u.id }, data: { version: u.version } }),
      ),
      prisma.recipe.update({ where: { id: recipe.id }, data: { version } }),
    ]);

    console.log(
      `${recipe.name}: ${changes.length} change(s) → v${version}` +
        (updates.length ? ` (${updates.length} row(s) updated)` : ""),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
