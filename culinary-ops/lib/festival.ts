// Festival plan-to-order engine. With no reliable sales history yet, a
// festival's demand is forecast from assumptions rather than measured:
//
//   forecast portions = attendance × food-capture-rate × per-item mix %
//
// A chef override wins over the forecast when entered, and a buffer % is added
// on top to get the portions actually prepped. Those final prep portions scale
// recipe builds (via lib/banquet's buildDayPlan) and roll up into a shopping
// list, which this module turns into a vendor-grouped order guide: raw need
// (÷ yield factor), less on-hand, rounded up to pack size, with est. cost.
//
// PERCENT CONVENTION: every percent here is a fraction 0–1 (captureRate 0.35,
// mixPct 0.20, bufferPct 0.10). The UI shows whole numbers — Zod divides by 100
// on the way in, and pages multiply by 100 on the way out. Keep this module in
// fractions so the arithmetic stays honest.
//
// Everything below is pure: no Prisma, no derived numbers persisted. Mirrors
// lib/banquet.ts in style — typed rows in, typed rows out.

import { convertQty } from "./units";
import type { ShoppingList } from "./shopping";

// --- Forecast --------------------------------------------------------------

// Festival-wide assumptions that drive every line's forecast.
export type ForecastAssumptions = {
  attendance: number;
  captureRate: number; // fraction 0–1
  bufferPct: number; // fraction 0–1, festival default
};

// One menu line reduced to what the forecast needs.
export type ForecastLine = {
  id: string;
  mixPct: number; // fraction 0–1
  price: number;
  chefOverride: number | null; // portions; wins over the computed forecast
  bufferPctOverride: number | null; // fraction 0–1; null = festival default
};

// Per-line forecast result, returned in input order.
export type ForecastRow = {
  id: string;
  forecastPortions: number; // round(attendance × capture × mix)
  chosenPortions: number; // chefOverride ?? forecastPortions
  overridden: boolean;
  finalPrepPortions: number; // ceil(chosen × (1 + buffer))
  projRevenue: number; // chosen × price
};

export type ForecastTotals = {
  portions: number; // sum of chosenPortions
  revenue: number; // sum of projRevenue
  mixPctSum: number; // sum of mixPct (fraction) — UI warns when ≠ 1
};

export type Forecast = {
  rows: ForecastRow[];
  totals: ForecastTotals;
};

// ceil that ignores float noise, so 400 × 1.1 = 440.00000000000006 preps 440
// portions, not 441.
function ceilSafe(x: number): number {
  return Math.ceil(Math.round(x * 1e9) / 1e9);
}

export function buildForecast(assumptions: ForecastAssumptions, lines: ForecastLine[]): Forecast {
  const covers = assumptions.attendance * assumptions.captureRate;
  const rows: ForecastRow[] = lines.map((l) => {
    const forecastPortions = Math.round(covers * l.mixPct);
    const chosenPortions = l.chefOverride ?? forecastPortions;
    const buffer = l.bufferPctOverride ?? assumptions.bufferPct;
    const finalPrepPortions = ceilSafe(chosenPortions * (1 + buffer));
    return {
      id: l.id,
      forecastPortions,
      chosenPortions,
      overridden: l.chefOverride != null,
      finalPrepPortions,
      projRevenue: chosenPortions * l.price,
    };
  });

  const totals = rows.reduce(
    (acc, r, i) => {
      acc.portions += r.chosenPortions;
      acc.revenue += r.projRevenue;
      acc.mixPctSum += lines[i].mixPct;
      return acc;
    },
    { portions: 0, revenue: 0, mixPctSum: 0 },
  );

  return { rows, totals };
}

// --- Order guide -----------------------------------------------------------

// Item purchasing metadata the order guide needs. Selected from Prisma via
// festivalItemMetaSelect below.
export type FestivalItemMeta = {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  packSize: string | null;
  packQty: number | null;
  packUnit: string | null;
  yieldFactor: number;
  vendor: { id: string; name: string } | null;
};

// One counted on-hand amount for the festival, keyed by itemId.
export type OnHandEntry = { quantity: number; unit: string };

export type OrderGuideRow = {
  itemId: string;
  name: string;
  unit: string;
  vendorName: string;
  need: number; // finished quantity required, in item.unit
  rawNeed: number; // need ÷ yieldFactor
  onHand: number; // on-hand converted to item.unit
  net: number; // max(0, rawNeed − onHand)
  packQty: number | null; // pack size in item.unit (converted), when known
  packLabel: string | null; // e.g. "40 lb" or legacy packSize string
  packCount: number | null; // whole packs to buy
  orderQty: number; // net rounded up (to pack, else whole units)
  unitCost: number;
  estCost: number; // orderQty × unitCost
  unconvertible: boolean; // a needed amount didn't convert to item.unit
  missingPack: boolean; // no usable packQty/packUnit — rounded to whole units
};

export type OrderGuideVendorGroup = {
  vendorName: string;
  rows: OrderGuideRow[];
  subtotal: number;
};

export type FestivalOrderGuide = {
  groups: OrderGuideVendorGroup[];
  grandTotal: number;
  warnings: string[];
};

const UNASSIGNED = "Unassigned";

// Turn a shopping list (raw items in display-measure units, all resolvable by
// lib/units) into a vendor-grouped, pack-rounded order guide. `onHandMap` is
// keyed by itemId; `extraWarnings` carries upstream notes (unscaled recipes,
// forecast-only menu items) to surface alongside conversion problems.
export function buildFestivalOrderGuide(
  shopping: ShoppingList,
  itemMeta: Map<string, FestivalItemMeta>,
  onHandMap: Map<string, OnHandEntry>,
  extraWarnings: string[] = [],
): FestivalOrderGuide {
  const warnings = [...extraWarnings];
  const rows: OrderGuideRow[] = [];

  for (const cat of shopping.categories) {
    for (const it of cat.items) {
      const meta = itemMeta.get(it.itemId);
      const unit = meta?.unit ?? (it.amounts[0]?.unit ?? "each");
      const name = meta?.name ?? it.name;

      // 1. Sum the display amounts back into item.unit.
      let need = 0;
      let unconvertible = false;
      for (const a of it.amounts) {
        const q = convertQty(a.qty, a.unit, unit);
        if (q == null) {
          unconvertible = true;
        } else {
          need += q;
        }
      }
      if (unconvertible) {
        warnings.push(`${name}: some amounts (${it.amounts.map((a) => a.unit).join(", ")}) don't convert to ${unit} — verify by hand.`);
      }

      // 2. Raw need accounts for cooking/trim loss.
      const yieldFactor = meta?.yieldFactor ?? 1;
      const rawNeed = need / Math.max(yieldFactor, 0.0001);

      // 3. Subtract on-hand (converted into item.unit).
      const oh = onHandMap.get(it.itemId);
      let onHand = 0;
      if (oh) {
        const conv = convertQty(oh.quantity, oh.unit, unit);
        if (conv == null) {
          warnings.push(`${name}: on-hand ${oh.unit} doesn't convert to ${unit} — ignored on-hand.`);
        } else {
          onHand = conv;
        }
      }
      const net = Math.max(0, rawNeed - onHand);

      // 4. Round up to pack size when we have usable structured pack data.
      const pack =
        meta?.packQty != null ? convertQty(meta.packQty, meta.packUnit ?? unit, unit) : null;
      let orderQty: number;
      let packCount: number | null;
      let packQtyInUnit: number | null;
      let packLabel: string | null;
      let missingPack = false;
      if (pack != null && pack > 0) {
        packCount = ceilSafe(net / pack);
        orderQty = packCount * pack;
        packQtyInUnit = pack;
        packLabel = `${trim(meta!.packQty!)} ${meta!.packUnit ?? unit}`;
      } else {
        packCount = null;
        packQtyInUnit = null;
        orderQty = ceilSafe(net);
        packLabel = meta?.packSize ?? null;
        missingPack = true;
      }

      // 5. Cost — unitCost is per item.unit (existing convention).
      const unitCost = meta?.unitCost ?? 0;
      const estCost = orderQty * unitCost;

      rows.push({
        itemId: it.itemId,
        name,
        unit,
        vendorName: meta?.vendor?.name ?? UNASSIGNED,
        need,
        rawNeed,
        onHand,
        net,
        packQty: packQtyInUnit,
        packLabel,
        packCount,
        orderQty,
        unitCost,
        estCost,
        unconvertible,
        missingPack,
      });
    }
  }

  // 6. Group by vendor, "Unassigned" bucket last.
  const byVendor = new Map<string, OrderGuideRow[]>();
  for (const r of rows) {
    const arr = byVendor.get(r.vendorName) ?? [];
    arr.push(r);
    byVendor.set(r.vendorName, arr);
  }
  const groups: OrderGuideVendorGroup[] = [...byVendor.entries()]
    .map(([vendorName, list]) => ({
      vendorName,
      rows: list.sort((a, b) => a.name.localeCompare(b.name)),
      subtotal: list.reduce((s, r) => s + r.estCost, 0),
    }))
    .sort((a, b) =>
      Number(a.vendorName === UNASSIGNED) - Number(b.vendorName === UNASSIGNED) ||
      a.vendorName.localeCompare(b.vendorName),
    );

  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);
  return { groups, grandTotal, warnings };
}

// Trim trailing zeros on a pack quantity for display (e.g. 40.0 → "40").
function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}

// Prisma `select` for the Item purchasing fields (+ vendor) the order guide
// needs. Reuse banquetRecipeSelect directly in pages for recipe rows.
export const festivalItemMetaSelect = {
  id: true,
  name: true,
  unit: true,
  unitCost: true,
  packSize: true,
  packQty: true,
  packUnit: true,
  yieldFactor: true,
  vendor: { select: { id: true, name: true } },
} as const;
