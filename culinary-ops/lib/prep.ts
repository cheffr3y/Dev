// Prep-order / production-ledger helpers: status metadata, the auto-generated
// 3-char production code, and lot-number formatting. Cost math reuses
// lib/costing; unit math reuses lib/units.

import type { BadgeColor } from "./event-status";
import { convertQty } from "./units";

// --- Status ---------------------------------------------------------------

export const PREP_STATUSES = [
  "REQUESTED",
  "PRINTED",
  "IN_PROGRESS",
  "MADE",
  "SHORT",
  "NOT_MADE",
] as const;

export type PrepStatus = (typeof PREP_STATUSES)[number];

// Statuses a person can choose during back-entry.
export const BACK_ENTRY_STATUSES = ["MADE", "SHORT", "NOT_MADE"] as const;

export const PREP_STATUS_COLOR: Record<PrepStatus, BadgeColor> = {
  REQUESTED: "gray",
  PRINTED: "blue",
  IN_PROGRESS: "amber",
  MADE: "green",
  SHORT: "amber",
  NOT_MADE: "red",
};

export function prepStatusLabel(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// A line counts as "open" (still to be produced) until it's been resolved.
export function isOpenStatus(s: string): boolean {
  return s === "REQUESTED" || s === "PRINTED" || s === "IN_PROGRESS";
}

// --- Production code (Recipe.prodCode) ------------------------------------
//
// Pure autogen, hands-off. From the recipe name we propose a 3-char code,
// ban the ambiguous characters O/I/L (confused with 0/1 when hand-copied),
// then enforce uniqueness by deriving the next sensible candidate from the
// name rather than falling back to numbers.

// A–Z minus the ambiguous trio.
const ALLOWED = "ABCDEFGHJKMNPQRSTUVWXYZ".split("");
const ALLOWED_SET = new Set(ALLOWED);

// Ordered preference of letters to draw from, given the recipe name:
//   • one word  → its letters in order (Demi → D,E,M,I → "DEM")
//   • 2+ words  → first two of word one, then one from each subsequent word
//                 (Smoked Salmon → S,M + S → "SMS"; Au Jus → A,U + J → "AUJ")
// Banned letters drop out, so the "next letter from the source word" emerges
// for free. The pool is then padded with the allowed alphabet for safety.
function letterPool(name: string): string[] {
  const words = (name.toUpperCase().match(/[A-Z]+/g) ?? []).filter(Boolean);
  const ordered: string[] = [];
  if (words.length <= 1) {
    ordered.push(...(words[0] ?? "").split(""));
  } else {
    ordered.push(...words[0].slice(0, 2).split(""));
    for (let i = 1; i < words.length; i++) ordered.push(words[i][0]);
    // remaining letters of every word, for short first words / heavy banning
    for (const w of words) ordered.push(...w.split(""));
  }
  ordered.push(...ALLOWED); // guarantee at least 3 usable letters
  return ordered.filter((c) => ALLOWED_SET.has(c));
}

// The first, most-obvious 3-char proposal.
function baseCode(name: string): string {
  const pool = letterPool(name);
  return (pool[0] + pool[1] + pool[2]).slice(0, 3);
}

// Generate a unique 3-char code for a recipe, avoiding everything in `taken`.
// On collision we advance the last character through the allowed alphabet,
// then the middle, then the first — a deterministic, number-free walk.
export function generateProdCode(name: string, taken: Set<string>): string {
  const base = baseCode(name);
  if (!taken.has(base)) return base;

  const [a, b, c] = base.split("");
  for (let pos = 2; pos >= 0; pos--) {
    for (const ch of ALLOWED) {
      const cand =
        pos === 2 ? a + b + ch : pos === 1 ? a + ch + c : ch + b + c;
      if (!taken.has(cand)) return cand;
    }
  }
  // Exhaustive fallback over the whole 3-char allowed space.
  for (const x of ALLOWED)
    for (const y of ALLOWED)
      for (const z of ALLOWED) {
        const cand = x + y + z;
        if (!taken.has(cand)) return cand;
      }
  return base; // ~12k combinations — unreachable in practice
}

// --- Lot numbers ----------------------------------------------------------
//
// Format: MMDD-XXX-N
//   MMDD  month/day of production (target date)
//   XXX   recipe prodCode
//   N     sequence digit, increments only if the same recipe is produced
//         more than once that day (almost always 1).

// forDate comes from a date-only input (stored at UTC midnight), so read its
// parts in UTC — otherwise a non-UTC server could stamp the wrong day.
export function lotDatePrefix(forDate: Date): string {
  const mm = String(forDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(forDate.getUTCDate()).padStart(2, "0");
  return `${mm}${dd}`;
}

export function formatLot(forDate: Date, prodCode: string, seq: number): string {
  return `${lotDatePrefix(forDate)}-${prodCode}-${seq}`;
}

// Given the lots already assigned for a recipe on a date, return the next
// sequence number. Existing lots that match the MMDD-XXX- prefix are scanned
// for their trailing digit; the max + 1 is returned (1 when none exist).
export function nextLotSeq(
  existingLots: string[],
  forDate: Date,
  prodCode: string,
): number {
  const prefix = `${lotDatePrefix(forDate)}-${prodCode}-`;
  let max = 0;
  for (const lot of existingLots) {
    if (!lot.startsWith(prefix)) continue;
    const n = parseInt(lot.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

// --- Cost snapshot --------------------------------------------------------
//
// unitCost = full recipe cost (ingredients + sub-recipes) per yield unit.
// allocatedCost = unitCost × produced qty, converted into the yield unit so a
// batch made in qt costs correctly against a recipe yielded in gal. When the
// conversion is unknown we fall back to a raw multiply and flag it.

export function lineCostSnapshot(opts: {
  recipeTotalCost: number;
  yieldQty: number;
  yieldUnit: string;
  qty: number;
  unit: string;
}): { unitCostSnapshot: number; allocatedCost: number; converted: boolean } {
  const { recipeTotalCost, yieldQty, yieldUnit, qty, unit } = opts;
  const unitCostSnapshot = yieldQty > 0 ? recipeTotalCost / yieldQty : recipeTotalCost;
  const inYieldUnit = convertQty(qty, unit, yieldUnit);
  if (inYieldUnit == null) {
    return { unitCostSnapshot, allocatedCost: qty * unitCostSnapshot, converted: false };
  }
  return { unitCostSnapshot, allocatedCost: inYieldUnit * unitCostSnapshot, converted: true };
}

// Is a requested batch a non-clean multiple of base yield? Flags entries the
// cook should sanity-check (linear scaling only in v1).
export function batchScaleFlag(
  requestedQty: number,
  requestedUnit: string,
  yieldQty: number,
  yieldUnit: string,
): { scale: number; clean: boolean } | null {
  const inYield = convertQty(requestedQty, requestedUnit, yieldUnit);
  if (inYield == null || yieldQty <= 0) return null;
  const scale = inYield / yieldQty;
  // "clean" = within 1% of a whole or half multiple.
  const nearest = Math.round(scale * 2) / 2;
  const clean = Math.abs(scale - nearest) < 0.01 * Math.max(1, scale);
  return { scale, clean };
}
