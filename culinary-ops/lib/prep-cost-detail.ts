import { componentBatchFactor, lineCost } from "./costing";
import { convertQty } from "./units";

export type CostDetailRecipeNode = {
  id: string;
  yieldQty: number;
  yieldUnit: string;
  items: Array<{
    itemId: string;
    quantity: number;
    unit: string;
    item: {
      name: string;
      category: string;
      unit: string;
      unitCost: number;
      sku: string | null;
      gcode: string | null;
    };
  }>;
  components: Array<{ childId: string; quantity: number; unit: string }>;
};

export type PrepCostDetailSnapshot = {
  version: 1;
  capturedAt: string;
  historical: true;
  rows: PrepCostDetailRow[];
};

export type PrepCostDetailRow = {
  itemId: string;
  itemName: string;
  category: string;
  gcode: string | null;
  sku: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  extendedCost: number;
  converted: boolean;
};

type Accumulator = PrepCostDetailRow;

function walk(
  recipeId: string,
  factor: number,
  byId: Map<string, CostDetailRecipeNode>,
  stack: Set<string>,
  rows: Map<string, Accumulator>,
) {
  const recipe = byId.get(recipeId);
  if (!recipe || stack.has(recipeId)) return;
  stack.add(recipeId);

  for (const ri of recipe.items) {
    const scaled = { ...ri, quantity: ri.quantity * factor };
    const convertedQty = convertQty(scaled.quantity, scaled.unit, ri.item.unit);
    const quantity = convertedQty ?? scaled.quantity;
    const unit = convertedQty == null ? scaled.unit : ri.item.unit;
    const detail: PrepCostDetailRow = {
      itemId: ri.itemId,
      itemName: ri.item.name,
      category: ri.item.category,
      gcode: ri.item.gcode,
      sku: ri.item.sku,
      quantity,
      unit,
      unitCost: ri.item.unitCost,
      extendedCost: lineCost(scaled).cost,
      converted: convertedQty != null,
    };
    // Keep incompatible units in separate rows; compatible quantities are
    // already normalized to the item's catalog/cost unit.
    const key = `${detail.itemId}|${detail.unit}|${detail.converted}`;
    const existing = rows.get(key);
    if (existing) {
      existing.quantity += detail.quantity;
      existing.extendedCost += detail.extendedCost;
    } else {
      rows.set(key, detail);
    }
  }

  for (const component of recipe.components) {
    const child = byId.get(component.childId);
    if (!child) continue;
    const { batches } = componentBatchFactor(
      component.quantity,
      component.unit,
      child.yieldQty,
      child.yieldUnit,
    );
    walk(component.childId, factor * batches, byId, stack, rows);
  }

  stack.delete(recipeId);
}

export function buildPrepCostDetail(
  recipeId: string,
  actualQty: number,
  actualUnit: string,
  recipes: CostDetailRecipeNode[],
): PrepCostDetailRow[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const root = byId.get(recipeId);
  if (!root) return [];
  const inYieldUnit = convertQty(actualQty, actualUnit, root.yieldUnit);
  const factor = inYieldUnit == null || root.yieldQty <= 0 ? 1 : inYieldUnit / root.yieldQty;
  const rows = new Map<string, Accumulator>();
  walk(recipeId, factor, byId, new Set(), rows);
  return [...rows.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.itemName.localeCompare(b.itemName),
  );
}

export function makePrepCostDetailSnapshot(
  rows: PrepCostDetailRow[],
  capturedAt: Date = new Date(),
): PrepCostDetailSnapshot {
  return { version: 1, capturedAt: capturedAt.toISOString(), historical: true, rows };
}

export function readPrepCostDetailSnapshot(value: unknown): PrepCostDetailSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PrepCostDetailSnapshot>;
  if (candidate.version !== 1 || !Array.isArray(candidate.rows)) return null;
  return candidate as PrepCostDetailSnapshot;
}
