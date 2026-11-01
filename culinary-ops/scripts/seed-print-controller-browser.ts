// Synthetic print fixtures; never run against an application database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { businessDate } from "../lib/prep-dates";
import { freezePacket } from "../lib/prep-packets";
import { json } from "../lib/prep-workflow";
import { emptySetup } from "../lib/banquet-setup";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
  assert.equal(process.env.PREP_DISPOSABLE_DB, "1");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/prep_workflow_test");
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@local.test" } });
  const venue = await prisma.venue.create({ data: { id: "clipboard-venue", name: "Clipboard Kitchen", code: "CLIP" } });
  const vendor = await prisma.vendor.create({ data: { name: "Clipboard Supplier" } });
  const butter = await prisma.item.create({ data: { name: "Clipboard Butter", unit: "lb", unitCost: 8, vendorId: vendor.id, priceUpdatedAt: new Date(), allergens: "milk" } });
  const base = await prisma.recipe.create({ data: { id: "clipboard-base", name: "Clipboard Base", prodCode: "CLB", yieldQty: 2, yieldUnit: "qt", instructions: "Combine the measured ingredients.", items: { create: { itemId: butter.id, quantity: 1, unit: "lb" } } } });
  const sauce = await prisma.recipe.create({ data: { id: "clipboard-sauce", name: "Clipboard Sauce", prodCode: "CLS2", yieldQty: 1, yieldUnit: "qt", instructions: "Measure the prepared base.", components: { create: { childId: base.id, quantity: 0.5, unit: "qt" } } } });
  const dish = await prisma.recipe.create({ data: { id: "clipboard-dish", name: "Clipboard Nested Dish", prodCode: "CLD", yieldQty: 4, yieldUnit: "each", menuPrice: 10, holdLifeDays: 3, instructions: "Captured method: assemble components to the saved specification.", components: { create: { childId: sauce.id, quantity: 1, unit: "qt" } } } });
  const ingredients = await Promise.all(Array.from({ length: 80 }, (_, i) => prisma.item.create({ data: { name: `Clipboard ingredient ${String(i + 1).padStart(2, "0")} staged garnish`, unit: "lb", unitCost: 1, vendorId: vendor.id, category: "Produce" } })));
  for (const [id, count, name] of [["clipboard-24", 24, "Twenty-four line production sheet"], ["clipboard-long", 80, "Long production reference"]] as const) {
    await prisma.recipe.create({ data: { id, name, prodCode: id === "clipboard-24" ? "CL24" : "CL80", yieldQty: 24, yieldUnit: "each", instructions: "Arrange the mise en place by the listed order.\nCheck the saved quantities before assembly.\nComplete the planned production and record actual yield.", items: { create: ingredients.slice(0, count).map((item, index) => ({ itemId: item.id, quantity: 1, unit: "lb", sortOrder: index, note: "Trimmed and portioned before production." })) } } });
  }
  await prisma.prepOrder.create({ data: { id: "clipboard-order", forDate: businessDate("2026-12-10"), destinationVenueId: venue.id, submittedByUserId: admin.id, lines: { create: { recipeId: dish.id, destinationVenueId: venue.id, requestedQty: 8, requestedUnit: "each" } } } });
  await freezePacket(admin.id, randomUUID(), { orderId: "clipboard-order" });
  await prisma.recipe.update({ where: { id: dish.id }, data: { instructions: "Live method changed after freeze." } });
  const setup = emptySetup();
  setup.stations.push({ id: "cold", name: "Cold station", serviceTime: "5 pm", notes: "Verify the complete vessel pull.", resources: [{ id: "shared", category: "equipment", name: "Tray", qty: 2 }], items: [] });
  await prisma.banquet.create({ data: { id: "clipboard-banquet", name: "Clipboard Dinner", date: businessDate("2026-12-10"), venueId: venue.id, guestCount: 48, setupPlan: json(setup), menuItems: { create: { recipeId: dish.id, orderedQty: 8, unit: "each" } } } });
  await prisma.menuRollout.create({ data: { id: "clipboard-menu", name: "Clipboard Winter Menu", venueId: venue.id, status: "ACTIVE", items: { create: { recipeId: dish.id } } } });
  await prisma.toGoRollup.create({ data: { id: "clipboard-to-go", name: "Clipboard To-Go", venueId: venue.id, orderCutoff: "2026-12-10", items: { create: { name: dish.name, recipeId: dish.id, sellingUnit: "each", recipeQtyPerUnit: 1, recipeAmountUnit: "each", forecastQty: 8 } } } });
  for (let i = 0; i < 24; i++) await prisma.cook.create({ data: { name: `Clipboard Cook ${i + 1}`, venueId: venue.id, role: "Prep", sortOrder: i } });
  console.log("Clipboard fixtures ready: fractional/nested recipes, 24/80-line sheets, frozen packet, banquet setup, menu, to-go and 24-cook schedule.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
