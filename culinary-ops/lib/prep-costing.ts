import { convertQty } from "./units";
import {
  DEFAULT_PRODUCTION_LABOR_RATE,
  DEFAULT_DISHWASHER_LABOR_RATE,
} from "./production";

export type CapturedRecipe = {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  productionPersonMinutes: number | null;
  items: {
    id: string;
    itemId: string;
    quantity: number;
    unit: string;
    item: {
      name: string;
      unit: string;
      unitCost: number | null;
      gcode: string | null;
    };
  }[];
  components: { id: string; childId: string; quantity: number; unit: string }[];
};
export type Supply = {
  itemId: string;
  quantity: number;
  unit: string;
  venueId: string;
  note: string;
  shared: boolean;
};
export type Capture = {
  version: 2;
  capturedAt: string;
  recipeId: string;
  recipes: CapturedRecipe[];
  quantity: number;
  unit: string;
  weights: number[];
  share: number;
  productionMinutes: number | null;
  productionSource: string;
  productionRate: number;
  dishwasherMinutes: number | null;
  dishwasherRate: number;
  // Explicit conversion factors fill ONLY incompatible captured edges.
  conversions: Record<string, number>;
  supplies: Supply[];
};
export type IngredientCharge = {
  key: string;
  itemId: string;
  name: string;
  gcode: string | null;
  quantity: number | null;
  unit: string;
  price: number | null;
  gross: number | null;
  excluded: number | null;
  net: number | null;
};
export type Charge = {
  gross: number | null;
  excluded: number | null;
  net: number | null;
  production: number | null;
  dishwasher: number | null;
  total: number | null;
  issues: string[];
  ingredients: IngredientCharge[];
};
export type CostSnapshot = {
  capture: Capture;
  charge: Charge;
  productionSupplies?: Supply[];
};
export const cents = (dollars: number) =>
  Math.round((dollars + Number.EPSILON) * 100);
export function allocateCents(total: number, weights: number[]) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    weights.some((n) => !Number.isFinite(n) || n < 0)
  )
    throw new Error("Invalid cents allocation.");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("Allocation needs a positive quantity.");
  const exact = weights.map((n) => (total * n) / sum),
    result = exact.map(Math.floor);
  const order = exact
    .map((n, i) => ({ i, remainder: n - result[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (
    let i = 0, left = total - result.reduce((a, b) => a + b, 0);
    i < left;
    i++
  )
    result[order[i].i]++;
  return result;
}
export function captureCost(
  input: Omit<
    Capture,
    | "version"
    | "capturedAt"
    | "conversions"
    | "productionSource"
    | "productionRate"
    | "dishwasherRate"
  > & {
    productionOverride?: number | null;
    productionRate?: number;
    dishwasherRate?: number;
  },
): Capture {
  const root = input.recipes.find((r) => r.id === input.recipeId);
  if (!root) throw new Error("Recipe not found.");
  const qty = convertQty(input.quantity, input.unit, root.yieldUnit);
  if (qty == null || root.yieldQty <= 0)
    throw new Error("Output must use a compatible recipe yield unit.");
  const standard =
    root.productionPersonMinutes == null
      ? null
      : (root.productionPersonMinutes * qty) / root.yieldQty;
  return {
    ...input,
    version: 2,
    capturedAt: new Date().toISOString(),
    conversions: {},
    productionMinutes: input.productionOverride ?? standard,
    productionSource:
      input.productionOverride == null ? "STANDARD" : "MANAGER_OVERRIDE",
    productionRate: input.productionRate ?? DEFAULT_PRODUCTION_LABOR_RATE,
    dishwasherRate: input.dishwasherRate ?? DEFAULT_DISHWASHER_LABOR_RATE,
  };
}
export function calculateCharge(c: Capture): Charge {
  // Only an explicit zero-quantity correction reaches this case. It cancels
  // the remaining delivery and therefore has a known zero charge.
  if (c.quantity === 0)
    return {
      gross: 0,
      excluded: 0,
      net: 0,
      production: 0,
      dishwasher: 0,
      total: 0,
      issues: [],
      ingredients: [],
    };
  const issues: string[] = [],
    rows: IngredientCharge[] = [];
  const byId = new Map(c.recipes.map((r) => [r.id, r]));
  const root = byId.get(c.recipeId)!;
  const ratio = c.weights[c.share] / c.weights.reduce((a, b) => a + b, 0);
  const share = (total: number) => allocateCents(total, c.weights)[c.share];
  function converted(q: number, from: string, to: string, key: string) {
    const result = convertQty(q, from, to);
    if (result != null) return result;
    if (c.conversions[key] != null) return q * c.conversions[key];
    issues.push(`UNIT:${key}: ${from} → ${to}`);
    return null;
  }
  function walk(id: string, factor: number | null, stack: Set<string>) {
    const r = byId.get(id);
    if (!r || stack.has(id) || r.yieldQty <= 0) {
      issues.push(`RECIPE:${id}: missing, cyclic or invalid recipe`);
      return;
    }
    const next = new Set(stack).add(id);
    for (const ri of [...r.items].sort((a, b) => a.id.localeCompare(b.id))) {
      const q =
        factor == null
          ? null
          : converted(ri.quantity * factor, ri.unit, ri.item.unit, ri.id);
      const price = ri.item.unitCost;
      if (price == null) issues.push(`PRICE:${ri.id}: ${ri.item.name}`);
      if (!ri.item.gcode?.trim())
        issues.push(`GCODE:${ri.id}: ${ri.item.name}`);
      const gross = q == null || price == null ? null : share(cents(q * price));
      rows.push({
        key: ri.id,
        itemId: ri.itemId,
        name: ri.item.name,
        gcode: ri.item.gcode,
        quantity: q == null ? null : q * ratio,
        unit: ri.item.unit,
        price,
        gross,
        excluded: 0,
        net: gross,
      });
    }
    for (const edge of [...r.components].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const child = byId.get(edge.childId);
      if (!child) {
        issues.push(`RECIPE:${edge.childId}: missing sub-recipe`);
        continue;
      }
      const q = converted(edge.quantity, edge.unit, child.yieldUnit, edge.id);
      walk(
        child.id,
        q == null || factor == null ? null : (factor * q) / child.yieldQty,
        next,
      );
    }
  }
  const output = convertQty(c.quantity, c.unit, root.yieldUnit)!;
  walk(c.recipeId, output / root.yieldQty, new Set());
  // Aggregate repeated ingredients before applying the destination's exclusion.
  const merged = new Map<string, IngredientCharge>();
  for (const row of rows) {
    const key = `${row.itemId}|${row.unit}`,
      old = merged.get(key);
    if (!old) merged.set(key, { ...row });
    else {
      old.quantity =
        old.quantity == null || row.quantity == null
          ? null
          : old.quantity + row.quantity;
      old.gross =
        old.gross == null || row.gross == null ? null : old.gross + row.gross;
      old.net = old.gross;
    }
  }
  const ingredients = [...merged.values()];
  if (!ingredients.length)
    issues.push(`RECIPE:${c.recipeId}: no ingredients captured`);
  const used = new Map<string, number>();
  for (const supply of c.supplies) {
    if (supply.shared) {
      issues.push(
        `SHARED:${supply.itemId}: supplied ingredients shared across venues need review — ${supply.note}`,
      );
      continue;
    }
    const row = ingredients.find((r) => r.itemId === supply.itemId);
    if (!row)
      throw new Error("Supplied ingredient is not in the captured recipe.");
    const q = convertQty(supply.quantity, supply.unit, row.unit);
    if (q == null) {
      issues.push(`SUPPLY_UNIT:${supply.itemId}: incompatible supplied unit`);
      row.excluded = null;
      row.net = null;
      continue;
    }
    const total = (used.get(row.itemId) ?? 0) + q;
    used.set(row.itemId, total);
    if (row.quantity != null && total > row.quantity + 1e-8)
      throw new Error(
        "Supplied quantity exceeds this delivery's ingredient share.",
      );
    row.excluded =
      row.price == null || row.quantity == null || row.gross == null
        ? null
        : Math.min(row.gross, cents(total * row.price));
    row.net =
      row.gross == null || row.excluded == null
        ? null
        : row.gross - row.excluded;
  }
  const sum = (field: "gross" | "excluded" | "net") =>
    ingredients.some((r) => r[field] == null)
      ? null
      : ingredients.reduce((n, r) => n + r[field]!, 0);
  let gross = sum("gross"),
    net = sum("net");
  if (issues.some((i) => i.startsWith("RECIPE:"))) {
    gross = null;
    net = null;
  }
  const excluded = sum("excluded");
  const production =
    c.productionMinutes == null
      ? null
      : share(cents((c.productionMinutes * c.productionRate) / 60));
  const dishwasher =
    c.dishwasherMinutes == null
      ? null
      : share(cents((c.dishwasherMinutes * c.dishwasherRate) / 60));
  if (production == null)
    issues.push("LABOR:production: production person-minutes are missing");
  if (dishwasher == null)
    issues.push("LABOR:dishwasher: dishwasher minutes are missing");
  return {
    gross,
    excluded,
    net,
    production,
    dishwasher,
    total:
      issues.length || net == null || production == null || dishwasher == null
        ? null
        : net + production + dishwasher,
    issues: [...new Set(issues)],
    ingredients,
  };
}
export function snapshot(capture: Capture): CostSnapshot {
  return { capture, charge: calculateCharge(capture) };
}
export function readCost(value: unknown): CostSnapshot | null {
  if (!value || typeof value !== "object" || !("capture" in value)) return null;
  const s = value as CostSnapshot;
  return s.capture?.version === 2 ? s : null;
}
export type Completion = {
  prices?: Record<string, number>;
  gcodes?: Record<string, string>;
  conversions?: Record<string, number>;
  productionMinutes?: number;
  dishwasherMinutes?: number;
};
export function completeCost(
  original: CostSnapshot,
  patch: Completion,
): CostSnapshot {
  const c = structuredClone(original.capture);
  const valid = new Set(c.recipes.flatMap((r) => r.items.map((i) => i.id)));
  for (const key of [
    ...Object.keys(patch.prices ?? {}),
    ...Object.keys(patch.gcodes ?? {}),
  ])
    if (!valid.has(key)) throw new Error("Unknown ingredient field.");
  for (const r of c.recipes)
    for (const ri of r.items) {
      if (patch.prices?.[ri.id] != null) {
        if (ri.item.unitCost != null)
          throw new Error(
            "Captured prices cannot be changed by cost completion.",
          );
        ri.item.unitCost = patch.prices[ri.id];
      }
      if (patch.gcodes?.[ri.id] != null) {
        if (ri.item.gcode?.trim())
          throw new Error(
            "Captured GCODEs cannot be changed by cost completion.",
          );
        ri.item.gcode = patch.gcodes[ri.id];
      }
    }
  for (const [key, factor] of Object.entries(patch.conversions ?? {})) {
    if (
      !original.charge.issues.some((i) => i.startsWith(`UNIT:${key}:`)) ||
      c.conversions[key] != null
    )
      throw new Error("Only missing unit conversions can be completed.");
    c.conversions[key] = factor;
  }
  for (const field of ["productionMinutes", "dishwasherMinutes"] as const)
    if (patch[field] != null) {
      if (c[field] != null)
        throw new Error("Captured labor cannot be changed by cost completion.");
      c[field] = patch[field]!;
      if (field === "productionMinutes") c.productionSource = "COST_COMPLETION";
    }
  return snapshot(c);
}
/** Cumulative rounded entitlements guarantee full returns refund every penny. */
export function returnCredit(
  charge: Charge,
  delivered: number,
  returnedBefore: number,
  quantity: number,
): Charge {
  if (charge.total == null)
    throw new Error("Complete costs before crediting a return.");
  if (quantity <= 0 || returnedBefore + quantity > delivered + 1e-8)
    throw new Error("Returns exceed the delivered quantity.");
  const refund = (n: number | null) =>
    n == null
      ? null
      : Math.round(n * Math.min(1, (returnedBefore + quantity) / delivered)) -
        Math.round((n * returnedBefore) / delivered);
  const net = refund(charge.net),
    production = refund(charge.production),
    dishwasher = refund(charge.dishwasher);
  return {
    gross:
      net == null || charge.excluded == null
        ? null
        : net + refund(charge.excluded)!,
    excluded: refund(charge.excluded),
    net,
    production,
    dishwasher,
    total: net! + production! + dishwasher!,
    issues: [],
    ingredients: [],
  };
}
