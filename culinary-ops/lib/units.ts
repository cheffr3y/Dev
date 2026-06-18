// Kitchen unit families and conversions. Items are purchased in bulk units
// (gal, qt, lb, case) while recipes call for cooking units (tbsp, tsp, oz).
// Quantities convert automatically within a family (volume, weight, count);
// cross-family conversions (e.g. cups of something bought by the lb) are not
// attempted — callers get null and should flag the line instead.

export type UnitFamily = "volume" | "weight" | "count";

type UnitDef = { family: UnitFamily; factor: number; label: string };

// factor = how many base units this unit equals.
// Base units: volume = fl oz, weight = oz, count = each.
const UNITS: Record<string, UnitDef> = {
  // Volume
  tsp: { family: "volume", factor: 1 / 6, label: "tsp" },
  tbsp: { family: "volume", factor: 1 / 2, label: "tbsp" },
  "fl oz": { family: "volume", factor: 1, label: "fl oz" },
  cup: { family: "volume", factor: 8, label: "cup" },
  pint: { family: "volume", factor: 16, label: "pt" },
  quart: { family: "volume", factor: 32, label: "qt" },
  gallon: { family: "volume", factor: 128, label: "gal" },
  ml: { family: "volume", factor: 0.033814, label: "mL" },
  liter: { family: "volume", factor: 33.814, label: "L" },
  // Weight
  oz: { family: "weight", factor: 1, label: "oz" },
  lb: { family: "weight", factor: 16, label: "lb" },
  gram: { family: "weight", factor: 0.035274, label: "g" },
  kg: { family: "weight", factor: 35.274, label: "kg" },
  // Count
  each: { family: "count", factor: 1, label: "each" },
  dozen: { family: "count", factor: 12, label: "dozen" },
};

const ALIASES: Record<string, string> = {
  // volume — note: bare "t"/"T" is intentionally not aliased; the tsp/tbsp
  // distinction relies on case, which normalization discards.
  teaspoon: "tsp",
  tbs: "tbsp",
  tbl: "tbsp",
  tablespoon: "tbsp",
  floz: "fl oz",
  "fluid oz": "fl oz",
  "fluid ounce": "fl oz",
  c: "cup",
  pt: "pint",
  qt: "quart",
  gal: "gallon",
  milliliter: "ml",
  millilitre: "ml",
  cc: "ml",
  l: "liter",
  litre: "liter",
  // weight
  ounce: "oz",
  "#": "lb",
  lbs: "lb",
  pound: "lb",
  g: "gram",
  gr: "gram",
  kilo: "kg",
  kilogram: "kg",
  // count
  ea: "each",
  ct: "each",
  count: "each",
  pc: "each",
  piece: "each",
  dz: "dozen",
  doz: "dozen",
};

function resolve(raw: string): UnitDef | null {
  let u = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (ALIASES[u]) u = ALIASES[u];
  if (UNITS[u]) return UNITS[u];
  // try singular ("cups" -> "cup", "gallons" -> "gallon")
  if (u.endsWith("s")) {
    let s = u.slice(0, -1);
    if (ALIASES[s]) s = ALIASES[s];
    if (UNITS[s]) return UNITS[s];
  }
  return null;
}

// Pretty label for a unit string, falling back to the raw value.
export function unitLabel(raw: string): string {
  return resolve(raw)?.label ?? raw;
}

// Pick a natural display unit for a recipe quantity when pulling/printing.
// Volume rolls up into fl oz → qt → gal (anything under a quart stays fl oz);
// weight rolls into g → oz → lb (under an ounce drops to grams). Count and
// unrecognized units pass through unchanged. This is display-only — the stored
// quantity/unit (and any costing that depends on it) are left untouched.
export function displayMeasure(qty: number, unit: string): { qty: number; label: string } {
  const def = resolve(unit);
  if (!def) return { qty, label: unit };

  if (def.family === "volume") {
    const flOz = qty * def.factor; // base unit = fl oz
    if (flOz >= UNITS.gallon.factor) return { qty: flOz / UNITS.gallon.factor, label: UNITS.gallon.label };
    if (flOz >= UNITS.quart.factor) return { qty: flOz / UNITS.quart.factor, label: UNITS.quart.label };
    return { qty: flOz, label: UNITS["fl oz"].label };
  }

  if (def.family === "weight") {
    const oz = qty * def.factor; // base unit = oz
    if (oz >= UNITS.lb.factor) return { qty: oz / UNITS.lb.factor, label: UNITS.lb.label };
    if (oz < UNITS.oz.factor) return { qty: oz / UNITS.gram.factor, label: UNITS.gram.label };
    return { qty: oz, label: UNITS.oz.label };
  }

  return { qty, label: def.label };
}

// Convert a quantity between units. Returns null when the conversion is
// unknown (unrecognized unit or different families) — unless the two unit
// strings are literally the same (e.g. "case" -> "case"), which is a no-op.
export function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const fromNorm = fromUnit.trim().toLowerCase();
  const toNorm = toUnit.trim().toLowerCase();
  if (fromNorm === toNorm) return qty;
  const from = resolve(fromUnit);
  const to = resolve(toUnit);
  if (!from || !to || from.family !== to.family) return null;
  return (qty * from.factor) / to.factor;
}

export function canConvert(fromUnit: string, toUnit: string): boolean {
  return convertQty(1, fromUnit, toUnit) != null;
}

// Grouped options for unit dropdowns. Values are stored as-is on the row;
// anything outside these lists (legacy free-text units) still round-trips.
export const UNIT_OPTIONS: Array<{ group: string; units: string[] }> = [
  { group: "Volume", units: ["tsp", "tbsp", "fl oz", "cup", "pint", "quart", "gallon", "ml", "liter"] },
  { group: "Weight", units: ["oz", "lb", "gram", "kg"] },
  { group: "Count", units: ["each", "dozen", "case", "can", "bottle", "bunch"] },
];

// The measurement family of a unit string ("volume" | "weight" | "count"), or
// null when the unit isn't recognized (e.g. free-text "servings", "batch").
export function unitFamily(raw: string): UnitFamily | null {
  return resolve(raw)?.family ?? null;
}

// Units a prep line may be ordered in, given the recipe's base (yield) unit.
// Selection is locked to the same family so liquids order in volume and dry
// goods in weight — you can't request 5 lb of a soup yielded in quarts.
// Unrecognized base units lock to themselves (the only convertible choice).
export function allowedUnitsFor(yieldUnit: string): string[] {
  const fam = unitFamily(yieldUnit);
  if (!fam) return [yieldUnit];
  const group = UNIT_OPTIONS.find((g) => g.group.toLowerCase() === fam);
  // Keep only units that actually convert within the family (drops count
  // packaging like "case"/"can" that share the group but have no factor).
  const units = (group?.units ?? []).filter((u) => unitFamily(u) === fam);
  return units.length ? units : [yieldUnit];
}

// Best default unit to request a recipe in: its own yield unit when that is a
// real, convertible unit, otherwise the first allowed unit in the family.
export function defaultUnitFor(yieldUnit: string): string {
  const allowed = allowedUnitsFor(yieldUnit);
  const canonical = resolve(yieldUnit);
  if (canonical) {
    const match = allowed.find((u) => resolve(u)?.label === canonical.label);
    if (match) return match;
  }
  return allowed.includes(yieldUnit) ? yieldUnit : allowed[0];
}
