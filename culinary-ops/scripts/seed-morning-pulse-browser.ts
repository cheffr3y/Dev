// Dedicated fixtures and data assertions for the disposable browser harness.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { pulseDates } from "../lib/morning-pulse";
import { loadMorningPulse } from "../lib/morning-pulse-data";
import { addDays, isoDate } from "../lib/banquet-week";
import { recordPickup, closeDay } from "../lib/prep-workflow";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
  assert.equal(process.env.PREP_DISPOSABLE_DB, "1");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/prep_workflow_test");
  const { start, day, end } = pulseDates();
  const venue = await prisma.venue.create({ data: { id: "pulse-venue", name: "Pulse Kitchen", code: "PULSE" } });
  const other = await prisma.venue.create({ data: { id: "pulse-other-venue", name: "Other Kitchen", code: "POTHER" } });
  await prisma.user.updateMany({ where: { email: { in: ["admin@local.test", "manager@local.test", "staff@local.test"] } }, data: { homeVenueId: venue.id } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@local.test" } });
  const vendor = await prisma.vendor.create({ data: { name: "Pulse Supplier" } });
  const butter = await prisma.item.create({ data: { name: "Pulse Butter", unit: "lb", unitCost: 8, vendorId: vendor.id, priceUpdatedAt: new Date(), gcode: "PULSE-BUTTER" } });
  const missing = await prisma.item.create({ data: { name: "Pulse Missing Details", unit: " ", unitCost: 0 } });
  await prisma.item.create({ data: { name: "Pulse Unused Missing", unitCost: 0 } });
  const base = await prisma.recipe.create({ data: { name: "Pulse Base", prodCode: "PBASE", yieldQty: 2, yieldUnit: "qt", items: { create: { itemId: butter.id, quantity: 16, unit: "oz" } } } });
  const recipe = await prisma.recipe.create({ data: { name: "Pulse Dinner Dish", prodCode: "PDISH", yieldQty: 4, yieldUnit: "each", menuPrice: 4, productionPersonMinutes: 0, components: { create: { childId: base.id, quantity: 2, unit: "qt" } } } });
  const incomplete = await prisma.recipe.create({ data: { name: "Pulse Incomplete Dish", prodCode: "PINC", menuPrice: 10, items: { create: { itemId: missing.id, quantity: 1, unit: "each" } } } });
  for (const [id, status, venueId] of [["pulse-menu", "ACTIVE", venue.id], ["pulse-draft", "DRAFT", venue.id], ["pulse-other", "ACTIVE", other.id]] as const) {
    await prisma.menuRollout.create({ data: { id, name: id === "pulse-menu" ? "Pulse Dinner Menu" : id, status, venueId, targetFcp: 28, items: { create: [recipe, incomplete].map(r => ({ recipeId: r.id })) } } });
  }
  await prisma.menuRollout.create({ data: { id: "pulse-shared", name: "Pulse Shared Menu", status: "ACTIVE", items: { create: { recipeId: recipe.id, menuPrice: 100 } } } });
  for (const [name, date, status, venueId] of [
    ["Pulse Today Banquet", start, "CONFIRMED", venue.id],
    ["Pulse Last Day Banquet", addDays(end, -1), "PLANNED", venue.id],
    ["Pulse Excluded Past", addDays(start, -1), "PLANNED", venue.id],
    ["Pulse Excluded Boundary", end, "PLANNED", venue.id],
    ["Pulse Excluded Cancelled", start, "CANCELLED", venue.id],
    ["Pulse Excluded Completed", start, "COMPLETED", venue.id],
    ["Pulse Excluded Venue", start, "CONFIRMED", other.id],
  ] as const) {
    await prisma.banquet.create({ data: { name, date, status, venueId, guestCount: 50, menuItems: { create: { recipeId: recipe.id, orderedQty: 4, unit: "each" } } } });
  }
  await prisma.event.create({ data: { name: "Pulse Today Event", venueId: venue.id, date: start, guestCount: 25 } });
  await prisma.festival.create({ data: { name: "Pulse Shared Festival", date: start, expectedAttendance: 100 } });
  for (const date of [start, addDays(start, 1)]) await prisma.prepOrder.create({ data: { submittedByUserId: admin.id, destinationVenueId: venue.id, forDate: date, lines: { create: { recipeId: recipe.id, destinationVenueId: venue.id, requestedQty: 4, requestedUnit: "each" } } } });
  const closed = isoDate(addDays(start, -2));
  for (const date of [day, closed]) await recordPickup(admin.id, randomUUID(), { date, recipeId: recipe.id, quantity: 1, unit: "each", venueId: venue.id, dishwasherMinutes: 0 });
  await closeDay(admin.id, randomUUID(), { date: closed });

  const pulse = await loadMorningPulse(venue.id, true);
  assert.deepEqual(pulse.banquets.map(b => b.name), ["Pulse Today Banquet", "Pulse Last Day Banquet"]);
  assert.deepEqual(pulse.events.map(e => e.name), ["Pulse Today Event"]);
  assert.equal(pulse.festivals.some(f => f.name === "Pulse Shared Festival"), true);
  assert.equal(pulse.activeMenus, 2);
  assert.deepEqual(pulse.margins.rows.map(row => [row.title, row.fcp]), [["Pulse Dinner Dish", 50]]);
  assert.equal(pulse.margins.needsReview, 1);
  assert.equal(pulse.queue?.find(row => row.day === day)?.transfers, 1);
  assert.equal(pulse.queue?.some(row => row.day === closed), false);
  assert.equal(pulse.queue?.some(row => row.day === "2025-01-01"), false);
  assert.equal(pulse.queue?.some(row => row.day === isoDate(addDays(start, 1))), false);
  assert.equal((await loadMorningPulse(venue.id, false)).queue, null);
  const inUse = await prisma.item.count({ where: { OR: [{ recipeItems: { some: {} } }, { inventoryItems: { some: {} } }, { orderGuideLines: { some: {} } }, { festivalOnHand: { some: {} } }] } });
  assert.equal(pulse.integrity.inUse, inUse);
  console.log("Morning Pulse database checks passed: dates, statuses, venue/shared scope, nested margins, in-use counts, closeouts, and restricted queue.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
