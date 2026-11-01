import { businessDate } from "./prep-dates";
import { convertQty } from "./units";
import type { ShoppingRecipeNode } from "./shopping";

export type PlanningLine = { id: string; recipeId: string | null; name: string; quantity: number | null; unit: string; notes: string; warning?: string };
export type PlanningSource = {
  id: string; kind: string; name: string; date: string | null; dateLabel: string; time: string;
  destination: string; venueId: string | null; notes: string; href: string; packetHref: string;
  lines: PlanningLine[]; recipes?: ShoppingRecipeNode[];
};
export type PurchasingItem = { id: string; name: string; category: string; unit: string; yieldFactor: number;
  packQty: number | null; packUnit: string | null; packSize: string | null; sku: string | null; vendor: { name: string } | null };
export function planningRange(from: string, to: string) {
  const start = businessDate(from), last = businessDate(to);
  if (last < start || last.getTime() - start.getTime() > 30 * 86400000) throw new Error("Choose an ordered date range of at most 31 days.");
  return { start, end: new Date(last.getTime() + 86400000) };
}

// Each source expands independently; compatible ingredient quantities combine
// only on the purchaser's list. No production work or ledger record is written.
export function buildPurchasingList(sources: PlanningSource[], recipes: ShoppingRecipeNode[], catalog: PurchasingItem[]) {
  const items = new Map(catalog.map(item => [item.id, item]));
  const warnings = new Set<string>();
  type Row = { key: string; itemId: string; name: string; category: string; vendor: string; unit: string; quantity: number; basis: string;
    packSize: string | null; sku: string | null; suggestedPacks: number | null; contributions: Array<{ sourceId: string; event: string; quantity: number }> };
  const rows: Row[] = [];
  const buckets = new Map<string, Row[]>();
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    const byId = new Map((source.recipes ?? recipes).map(recipe => [recipe.id, recipe]));
    for (const line of source.lines) {
      if (line.warning) { warnings.add(`${source.name} / ${line.name}: ${line.warning}`); continue; }
      if (line.quantity === 0) continue;
      const contributions: Array<{ itemId: string; name: string; category: string; quantity: number; unit: string }> = [];
      const visit = (id: string, quantity: number, unit: string, path: Set<string>) => {
        const recipe = byId.get(id);
        if (!recipe) throw new Error("Recipe contents are unavailable; excluded from purchasing totals.");
        if (path.has(id)) throw new Error("Circular sub-recipe link; excluded from purchasing totals.");
        const converted = convertQty(quantity, unit, recipe.yieldUnit);
        if (!unit.trim() || !recipe.yieldUnit.trim() || converted == null || !Number.isFinite(converted) || converted < 0 || !Number.isFinite(recipe.yieldQty) || recipe.yieldQty <= 0)
          throw new Error(`Cannot scale ${quantity} ${unit} to ${recipe.yieldUnit}; excluded from purchasing totals.`);
        if (!recipe.items.length && !recipe.components.length) throw new Error("Recipe build is empty; excluded from purchasing totals.");
        const factor = converted / recipe.yieldQty;
        for (const item of recipe.items) {
          if (!item.unit.trim() || !Number.isFinite(item.quantity) || item.quantity < 0) throw new Error("Ingredient quantity needs review; excluded from purchasing totals.");
          if (item.quantity > 0) contributions.push({ ...item, quantity: item.quantity * factor });
        }
        for (const component of recipe.components) {
          if (component.quantity === 0) continue;
          visit(component.childId, component.quantity * factor, component.unit, new Set(path).add(id));
        }
      };
      try {
        if (!line.recipeId || line.quantity == null || !Number.isFinite(line.quantity) || line.quantity < 0)
          throw new Error("Recipe link or production quantity is missing; excluded from purchasing totals.");
        visit(line.recipeId, line.quantity, line.unit, new Set());
      } catch (error) {
        warnings.add(`${source.name} / ${line.name}: ${(error as Error).message}`);
        continue; // Never publish a partial recipe as its full demand.
      }
      for (const c of contributions) {
        const item = items.get(c.itemId);
        const converted = item ? convertQty(c.quantity, c.unit, item.unit) : null;
        const validYield = item && Number.isFinite(item.yieldFactor) && item.yieldFactor > 0 && item.yieldFactor <= 1;
        const unit = converted != null && validYield ? item!.unit : c.unit;
        const quantity = converted != null && validYield ? converted / item!.yieldFactor : c.quantity;
        if (!item || converted == null || !validYield) warnings.add(`${c.name}: purchase-unit conversion or usable yield needs review; shown as recipe-use quantity in ${c.unit}, without a raw-purchase adjustment.`);
        const basis = converted != null && validYield ? "Raw purchase quantity" : "Recipe-use quantity — review";
        const match = buckets.get(c.itemId)?.find(row => row.basis === basis && convertQty(quantity, unit, row.unit) != null);
        const row = match ?? { key: `${c.itemId}:${rows.length}`, itemId: c.itemId, name: c.name, category: c.category,
          vendor: item?.vendor?.name ?? "Unassigned vendor", unit, basis, quantity: 0, packSize: item?.packSize ?? null, sku: item?.sku ?? null,
          suggestedPacks: null, contributions: [] };
        const added = convertQty(quantity, unit, row.unit)!;
        row.quantity += added;
        const contribution = row.contributions.find(part => part.sourceId === source.id);
        if (contribution) contribution.quantity += added;
        else row.contributions.push({ sourceId: source.id, event: `${source.name} · ${source.date ?? "Undated"} · ${source.destination}`, quantity: added });
        if (!match) { rows.push(row); buckets.set(c.itemId, [...(buckets.get(c.itemId) ?? []), row]); }
      }
    }
  }
  for (const row of rows) {
    const item = items.get(row.itemId);
    const packQty = row.basis === "Raw purchase quantity" && item?.packQty && item.packUnit ? convertQty(item.packQty, item.packUnit, row.unit) : null;
    row.suggestedPacks = packQty && packQty > 0 ? Math.ceil(Math.round(row.quantity / packQty * 1e9) / 1e9) : null;
    if ((buckets.get(row.itemId)?.length ?? 0) > 1) warnings.add(`${row.name}: incompatible unit families are listed separately; resolve before ordering.`);
  }
  rows.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
  return { rows, warnings: [...warnings].sort(), sourceCount: seen.size };
}
