import type { Item } from "@prisma/client";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredient-fields";
import { parseAllergens } from "@/lib/allergens";
import { AllergenPicker } from "./AllergenPicker";
import { Field, Input, Select } from "./ui";

export function IngredientFields({ item, vendors }: { item?: Item; vendors: { id: string; name: string }[] }) {
  const categories = [...new Set([...(item ? [item.category] : []), ...INGREDIENT_CATEGORIES])];
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Field label="Name"><Input name="name" required defaultValue={item?.name} placeholder="Tomato, Roma" /></Field>
    <Field label="Category"><Select name="category" defaultValue={item?.category ?? "Other"}>{categories.map(category => <option key={category}>{category}</option>)}</Select></Field>
    <Field label="Vendor"><Select name="vendorId" defaultValue={item?.vendorId ?? ""}><option value="">— none —</option>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></Field>
    <Field label="Cost / count unit" hint="The measurement basis for this ingredient’s unit cost."><Input name="unit" required defaultValue={item?.unit ?? "each"} placeholder="oz, fl oz, lb, each…" /></Field>
    <Field label="Unit Cost ($)"><Input name="unitCost" type="number" step="0.00001" min="0" defaultValue={item?.unitCost ?? 0} /></Field>
    <Field label="Pack Size"><Input name="packSize" defaultValue={item?.packSize ?? ""} placeholder="6 x #10 can" /></Field>
    <Field label="Pack quantity"><Input name="packQty" type="number" min="0.00001" step="0.00001" defaultValue={item?.packQty ?? ""} placeholder="Optional" /></Field>
    <Field label="Pack unit"><Input name="packUnit" defaultValue={item?.packUnit ?? ""} placeholder="lb, gal, each…" /></Field>
    <Field label="Usable yield factor" hint="Usable / purchased quantity; 1 means no trim loss."><Input name="yieldFactor" type="number" min="0.00001" step="0.00001" defaultValue={item?.yieldFactor ?? 1} /></Field>
    <Field label="Item #"><Input name="sku" defaultValue={item?.sku ?? ""} placeholder="Vendor item / SKU #" /></Field>
    <Field label="Acumatica GCODE"><Input name="gcode" defaultValue={item?.gcode ?? ""} placeholder="GCODE" /></Field>
    <div className="col-span-full border-t border-hairline pt-4"><AllergenPicker selected={parseAllergens(item?.allergens)} /><p className="mt-2 text-xs text-zinc-500">Tag allergens from the product information. Recipes inherit these tags automatically.</p></div>
  </div>;
}
