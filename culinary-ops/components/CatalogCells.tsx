"use client";
import { InlineCell } from "./InlineCell";
import type { CatalogItem, EditValue } from "@/lib/workspace-options";
export const catalogColumns = [
  ["vendorId", "Vendor"], ["sku", "Item #"], ["gcode", "GCODE"], ["packSize", "Pack size"], ["unit", "Cost unit"], ["unitCost", "Unit cost"],
] as const;
export function CatalogCell({ item, field, vendors, onValue, onSaved }: { item: CatalogItem; field: typeof catalogColumns[number][0]; vendors: { id: string; name: string }[]; onValue?: (value: EditValue) => void; onSaved?: () => void }) {
  return <InlineCell entity="item" id={item.id} row={item.id} field={field} label={`${catalogColumns.find(([key]) => key === field)?.[1]} for ${item.name}`} value={item[field]} options={field === "vendorId" ? [{ id: "", name: "No vendor" }, ...vendors] : undefined} onValue={onValue} onSaved={onSaved} />;
}
