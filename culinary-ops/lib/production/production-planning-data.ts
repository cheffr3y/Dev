import { prisma } from "../db/prisma";
import { buildForecast } from "../menus/festival";
import { buildToGoRollup } from "../menus/to-go-rollup";
import { menuRecipeInclude } from "../menus/menu-rollout-data";
import { loadFrozenPacket } from "../prep/prep-packets";
import { planningRange, type PlanningSource, type PurchasingItem } from "./production-planning";
import type { ShoppingRecipeNode } from "../purchasing/shopping";

export async function loadProductionPlanning(from: string, to: string, includeUndated = false) {
  const { start, end } = planningRange(from, to);
  const [banquets, festivals, prep, retail, recipes, items] = await Promise.all([
    prisma.banquet.findMany({ where: { date: { gte: start, lt: end }, status: { in: ["PLANNED", "CONFIRMED"] } }, include: { venue: true, menuItems: { include: { recipe: { select: { name: true } } }, orderBy: { createdAt: "asc" } } }, take: 1001 }),
    prisma.festival.findMany({ where: { date: { gte: start, lt: end }, status: { in: ["PLANNED", "CONFIRMED"] } }, include: { venue: true, menuItems: { include: { recipe: { select: { name: true, yieldUnit: true } } }, orderBy: { sortOrder: "asc" } } }, take: 1001 }),
    prisma.prepOrder.findMany({ where: { forDate: { gte: start, lt: end }, lines: { some: { status: { in: ["REQUESTED", "PRINTED", "IN_PROGRESS"] } } } }, include: { destinationVenue: true, lines: { where: { status: { in: ["REQUESTED", "PRINTED", "IN_PROGRESS"] } }, include: { recipe: { select: { name: true } }, destinationVenue: true } } }, take: 1001 }),
    prisma.toGoRollup.findMany({ where: { status: { in: ["DRAFT", "REVIEW", "ACTIVE"] }, OR: [{ orderCutoff: { gte: from, lte: to } }, ...(includeUndated ? [{ orderCutoff: null }, { orderCutoff: "" }] : [])] }, include: { venue: true, items: { orderBy: { sortOrder: "asc" } } }, take: 1001 }),
    prisma.recipe.findMany({ include: menuRecipeInclude, orderBy: { id: "asc" } }),
    prisma.item.findMany({ select: { id: true, name: true, category: true, unit: true, yieldFactor: true, packQty: true, packUnit: true, packSize: true, sku: true, vendor: { select: { name: true } } } }),
  ]);
  if ([banquets, festivals, prep, retail].some(rows => rows.length > 1000)) throw new Error("Too many source jobs. Narrow the date range.");
  const shoppingRecipes: ShoppingRecipeNode[] = recipes.map(r => ({ id: r.id, yieldQty: r.yieldQty, yieldUnit: r.yieldUnit,
    items: r.items.map(ri => ({ itemId: ri.item.id, name: ri.item.name, category: ri.item.category, quantity: ri.quantity, unit: ri.unit })), components: r.components }));
  const sources: PlanningSource[] = banquets.map(b => ({ id: `banquet:${b.id}`, kind: "Banquet", name: b.name, date: b.date.toISOString().slice(0, 10), dateLabel: "Service date", time: b.timeLabel || "Service time to confirm", destination: [b.venue.name, b.location, b.areas].filter(Boolean).join(" · "), venueId: b.venueId,
    notes: [b.specialInstructions, b.notes].filter(Boolean).join("\n"), href: `/banquets/${b.id}`, packetHref: `/banquets/${b.id}/packet`,
    lines: b.menuItems.map(l => ({ id: l.id, recipeId: l.recipeId, name: l.recipe.name, quantity: l.orderedQty, unit: l.unit, notes: l.description || "" })) }));
  for (const f of festivals) {
    const forecast = buildForecast({ attendance: f.expectedAttendance, captureRate: f.captureRate, bufferPct: f.bufferPct }, f.menuItems);
    const portions = new Map(forecast.rows.map(row => [row.id, row.finalPrepPortions]));
    sources.push({ id: `festival:${f.id}`, kind: "Festival", name: f.name, date: f.date.toISOString().slice(0, 10), dateLabel: "Festival date", time: "Service time to confirm", destination: f.venue?.name || "Off-site / destination to confirm", venueId: f.venueId, notes: f.notes || "", href: `/festivals/${f.id}`, packetHref: `/festivals/${f.id}/builds`,
      lines: f.menuItems.map(l => ({ id: l.id, recipeId: l.recipeId, name: l.name, quantity: portions.get(l.id) ?? 0, unit: l.recipe?.yieldUnit || "", notes: l.note || "", warning: l.recipe ? undefined : "Link a recipe; forecast-only line excluded." })) });
  }
  for (const r of retail) {
    const plan = buildToGoRollup(r, recipes);
    sources.push({ id: `to-go:${r.id}`, kind: "To-Go", name: r.name, date: r.orderCutoff || null, dateLabel: "Order cutoff (service date unspecified)", time: r.pickupNotes || "Pickup / production deadline to confirm", destination: r.venue?.name || "Company-wide / destination to confirm", venueId: r.venueId, notes: r.notes || "", href: `/to-go/${r.id}`, packetHref: `/to-go/${r.id}/packet?mode=packing`,
      lines: plan.rows.map(l => ({ id: l.id, recipeId: l.recipeId, name: l.name, quantity: l.productionYield, unit: l.recipe?.yieldUnit || "", notes: [l.packingNotes, l.notes].filter(Boolean).join("\n"), warning: l.productionYield == null ? "Production quantity or package mapping is missing; excluded from purchasing totals." : undefined })) });
  }
  for (const p of prep) {
    let frozen = p.lines.some(l => l.lot) ? await loadFrozenPacket(p.id) : null;
    if (!frozen && p.lines.some(l => l.lot)) {
      const daily = await prisma.prepPacketSnapshot.findFirst({ where: {
        scope: { startsWith: `day-${p.forDate.toISOString().slice(0, 10)}-` },
        contents: { path: ["order", "lines"], array_contains: p.lines.filter(l => l.lot).map(l => ({ id: l.id, lot: l.lot })) },
      }, orderBy: { createdAt: "asc" }, select: { scope: true } });
      if (daily) frozen = await loadFrozenPacket(daily.scope);
    }
    const frozenLines = new Map(frozen?.order.lines.map(l => [l.id, l]));
    // Printed lots use frozen contents; never silently substitute today's recipe.
    const unprinted = p.lines.filter(l => !l.lot);
    const printed = p.lines.filter(l => l.lot);
    for (const [suffix, lines] of [["requested", unprinted], ["printed", printed]] as const) {
      if (!lines.length) continue;
      const date = p.forDate.toISOString().slice(0, 10);
      sources.push({ id: `prep:${p.id}:${suffix}`, kind: "Daily Prep", name: `Prep ${p.destinationVenue?.name || "Request"} · ${p.id.slice(-6)} · ${suffix}`, date, dateLabel: "Production date", time: "Prep deadline to confirm", destination: [...new Set(lines.map(l => l.destinationVenue.name))].join(" / "), venueId: p.destinationVenueId, notes: p.notes || "", href: `/prep-orders/${p.id}`, packetHref: frozen && suffix === "printed" ? `/prep-orders/${frozen.order.id}/packet` : `/prep-orders?date=${date}`,
        ...(suffix === "printed" && frozen ? { recipes: frozen.shoppingRecipes.map(r => ({ id: r.id, yieldQty: r.yieldQty, yieldUnit: r.yieldUnit,
          items: r.items.map(i => ({ itemId: i.item.id, name: i.item.name, category: i.item.category, quantity: i.quantity, unit: i.unit })), components: r.components })) } : {}),
        lines: lines.map(l => { const saved = frozenLines.get(l.id); return { id: l.id, recipeId: l.recipeId, name: saved?.recipe.name || l.recipe.name, quantity: saved?.requestedQty ?? l.requestedQty, unit: saved?.requestedUnit || l.requestedUnit, notes: [l.notes, l.lot ? `Lot ${l.lot}` : "Not yet printed"].filter(Boolean).join(" · "), warning: l.lot && !saved ? "Frozen request packet is unavailable; open the original daily packet. Excluded from purchasing totals." : undefined }; }) });
    }
  }
  sources.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { sources, recipes: shoppingRecipes, items: items as PurchasingItem[] };
}
