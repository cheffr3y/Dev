// Only used by the disposable PostgreSQL browser harness.
import { prisma } from "../lib/prisma";
import { businessDate } from "../lib/prep-dates";
import { hash } from "bcryptjs";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
  if (
    process.env.PREP_DISPOSABLE_DB !== "1" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/prep_workflow_test"
  )
    throw new Error("Disposable database required.");
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@local.test" },
  });
  const venues = await prisma.venue.findMany({
    where: { code: { in: ["B", "F"] } },
  });
  const recipes = await prisma.recipe.findMany({
    where: { prodCode: { in: ["BEANS", "SCE"] } },
  });
  await prisma.user.updateMany({
    where: {
      email: {
        in: ["admin@local.test", "manager@local.test", "staff@local.test"],
      },
    },
    data: { passwordHash: await hash("local-smoke-only", 10) },
  });
  for (const venue of venues) {
    await prisma.prepOrder.create({
      data: {
        forDate: businessDate("2026-12-01"),
        submittedByUserId: admin.id,
        destinationVenueId: venue.id,
        notes: "Daily service prep",
        lines: {
          create: recipes.map((r) => ({
            recipeId: r.id,
            destinationVenueId: venue.id,
            requestedQty: 4,
            requestedUnit: "qt",
          })),
        },
      },
    });
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
