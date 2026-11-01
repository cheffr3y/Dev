// Only used by the disposable PostgreSQL browser harness.
import { prisma } from "../lib/db/prisma";
import { businessDate } from "../lib/prep/prep-dates";
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
  await prisma.banquet.create({ data: {
    id: "banquet-setup-smoke", name: "Banquet setup review", venueId: venues[0].id,
    date: businessDate("2026-12-01"), guestCount: 150, timeLabel: "5–11 pm",
    areas: "Ballroom", setupNotes: "Use two rows of bowls. Confirm power drop with banquet captain.",
    menuItems: { create: recipes.map(r => ({ recipeId: r.id, orderedQty: 4, unit: "qt" })) },
  } });
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
  const cream = await prisma.item.create({ data: {
    name: "Allergen test cream", category: "Dairy", unit: "qt", unitCost: 2,
  } });
  const sauce = await prisma.recipe.create({ data: {
    name: "Allergen test sauce", prodCode: "ALS", yieldQty: 1, yieldUnit: "qt", allergens: "mustard",
    items: { create: { itemId: cream.id, quantity: 1, unit: "qt" } },
  } });
  await prisma.recipe.create({ data: {
    name: "Allergen test soup", prodCode: "ALP", yieldQty: 1, yieldUnit: "qt", allergens: "wheat",
    components: { create: { childId: sauce.id, quantity: 1, unit: "qt" } },
  } });
  const oldTomato = await prisma.item.create({ data: { name: "Roma Tomato", category: "Produce", unit: "lb", unitCost: 2, sku: "ROMA" } });
  const tomato = await prisma.item.create({ data: { name: "Tomato, Roma", category: "Produce", unit: "oz", unitCost: 0.1, sku: "ROMA", gcode: "ROMA-KEEP" } });
  await prisma.recipe.create({ data: { name: "Cleanup test salad", prodCode: "CLS", yieldQty: 1, yieldUnit: "each", items: { create: [
    { itemId: oldTomato.id, quantity: 1, unit: "lb", note: "diced" }, { itemId: tomato.id, quantity: 8, unit: "oz", note: "seeded" },
  ] } } });
  await prisma.recipe.create({ data: { name: "Cleanup test soup", prodCode: "CLP", yieldQty: 1, yieldUnit: "each", items: { create: { itemId: oldTomato.id, quantity: 2, unit: "oz", note: "diced" } } } });
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
