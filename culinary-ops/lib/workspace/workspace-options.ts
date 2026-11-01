import { z } from "zod";
import { convertQty } from "../recipes/units";

export type EditEntity = "item" | "guideLine" | "recipe";
export type EditValue = string | number | null;
export type EditResult = { ok: true; value: EditValue } | { ok: false; error: string; current?: EditValue };
export const editSchema = z.object({
  entity: z.enum(["item", "guideLine", "recipe"]), id: z.string().min(1).max(200),
  field: z.string(), expected: z.union([z.string(), z.number().finite(), z.null()]), value: z.string().max(500),
}).strict();

export function parseCellValue(entity: EditEntity, field: string, value: string): EditValue {
  const text = value.trim();
  const numeric = entity === "item" ? ["unitCost"] : entity === "recipe" ? ["yieldQty"] : ["par"];
  const required = entity === "item" ? ["unit"] : entity === "recipe" ? ["yieldUnit"] : ["unit"];
  const optional = entity === "item" ? ["packSize", "vendorId", "sku", "gcode"] : [];
  if (numeric.includes(field)) {
    if (!text) throw new Error("Enter a number; use 0 for an unpriced item or zero par.");
    const quantity = Number(text);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000000 || (field === "yieldQty" && quantity === 0)) throw new Error(field === "yieldQty" ? "Yield must be greater than 0 and at most 100,000,000." : "Enter a number from 0 to 100,000,000.");
    return quantity;
  }
  if (required.includes(field)) {
    if (!text || text.length > 40) throw new Error("Enter a unit of up to 40 characters.");
    return text;
  }
  if (optional.includes(field)) {
    if (text.length > 200) throw new Error("Keep this field under 200 characters.");
    return text || null;
  }
  throw new Error("This field cannot be edited here.");
}

export type CatalogItem = {
  id: string; name: string; category: string; allergens: string | null; unitCost: number; unit: string;
  packSize: string | null; vendorId: string | null; sku: string | null; gcode: string | null;
};
export type GuideRow = { id: string; par: number; unit: string; item: CatalogItem; stock: { quantity: number; unit: string } | null };
export function guideAmounts(row: GuideRow) {
  const have = row.stock ? convertQty(row.stock.quantity, row.stock.unit, row.unit) : 0;
  const need = have == null ? null : Math.max(0, row.par - have);
  const pricedQty = need == null ? null : convertQty(need, row.unit, row.item.unit);
  const cost = need === 0 ? 0 : pricedQty == null || row.item.unitCost <= 0 ? null : pricedQty * row.item.unitCost;
  return { have, need, cost };
}
