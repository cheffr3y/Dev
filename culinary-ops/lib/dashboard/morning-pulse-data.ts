import { prisma } from "../db/prisma";
import { Prisma } from "@prisma/client";
import { buildCloseoutQueue, buildMarginWatchlist, ingredientIntegrity, inUseIngredientWhere, pulseDates } from "./morning-pulse";

export async function loadMorningPulse(venueId: string | null, admin: boolean, now = new Date()) {
  const dates = pulseDates(now);
  const date = { gte: dates.start, lt: dates.end };
  const status = { in: ["PLANNED", "CONFIRMED"] as ("PLANNED" | "CONFIRMED")[] };
  const venue = venueId ? { venueId } : {};
  const sharedVenue = venueId ? { OR: [{ venueId }, { venueId: null }] } : {};
  const [ingredients, banquets, events, festivals, menus, recipes, queue] = await Promise.all([
    prisma.item.findMany({ where: inUseIngredientWhere, select: { unitCost: true, unit: true, vendorId: true } }),
    prisma.banquet.findMany({ where: { date, status, ...venue }, select: { id: true, name: true, date: true, guestCount: true, venue: { select: { code: true } } }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
    prisma.event.findMany({ where: { date, status, ...venue }, select: { id: true, name: true, date: true, guestCount: true, venue: { select: { code: true } } }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
    prisma.festival.findMany({ where: { date, status, ...sharedVenue }, select: { id: true, name: true, date: true, expectedAttendance: true }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
    prisma.menuRollout.findMany({ where: { status: "ACTIVE", ...sharedVenue }, select: { id: true, name: true, targetFcp: true, items: { select: { id: true, recipeId: true, menuTitle: true, menuPrice: true } } } }),
    prisma.recipe.findMany({ select: {
      id: true, name: true, yieldQty: true, yieldUnit: true, menuPrice: true,
      components: { select: { childId: true, quantity: true, unit: true } },
      items: { select: { quantity: true, unit: true, item: { select: { id: true, unit: true, unitCost: true, priceUpdatedAt: true } } } },
    } }),
    admin ? loadCloseoutQueue(dates.start) : Promise.resolve(null),
  ]);
  const integrity = ingredients.map(ingredientIntegrity);
  return {
    dates, banquets, events, festivals, queue,
    integrity: {
      total: integrity.filter(item => item.missingCost || item.missingUnit || item.missingVendor).length,
      missingCost: integrity.filter(item => item.missingCost).length,
      missingUnit: integrity.filter(item => item.missingUnit).length,
      missingVendor: integrity.filter(item => item.missingVendor).length,
      inUse: ingredients.length,
    },
    margins: buildMarginWatchlist(menus, recipes, now),
    activeMenus: menus.length,
  };
}

async function loadCloseoutQueue(today: Date) {
  const [requests, batches, transfers, closed] = await Promise.all([
    prisma.prepOrder.groupBy({ by: ["forDate"], where: { forDate: { lte: today }, lines: { some: { status: { in: ["REQUESTED", "PRINTED", "IN_PROGRESS"] } } } }, _count: true }),
    // Historical batches predate daily closeout; do not invent unfinished days
    // from records without a current-workflow costing snapshot.
    prisma.productionBatch.groupBy({ by: ["producedOn"], where: { producedOn: { lte: today }, status: "OPEN", finalizedAt: null, costingSnapshot: { not: Prisma.DbNull } }, _count: true }),
    prisma.stockTransfer.groupBy({ by: ["transferDate"], where: { transferDate: { lte: today }, finalizedAt: null, accountingState: { not: "LEGACY" } }, _count: true }),
    prisma.productionCloseout.findMany({ where: { businessDate: { lte: today }, finalizedAt: { not: null } }, select: { businessDate: true } }),
  ]);
  return buildCloseoutQueue(
    requests.map(row => ({ date: row.forDate, count: row._count })),
    batches.map(row => ({ date: row.producedOn, count: row._count })),
    transfers.map(row => ({ date: row.transferDate, count: row._count })),
    closed.map(row => row.businessDate),
  );
}
