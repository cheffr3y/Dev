import type { Item } from "@prisma/client";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredients/ingredient-fields";
import { parseAllergens } from "@/lib/recipes/allergens";
import { allergenReview } from "@/lib/recipes/costing";
import { AllergenPicker } from "./AllergenPicker";
import { Field, Input, Select } from "./ui";

export function IngredientFields({ item, vendors }: { item?: Item; vendors: { id: string; name: string }[] }) {
  const categories = [...new Set([...(item ? [item.category] : []), ...INGREDIENT_CATEGORIES])];
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Field label="Name"><Input name="name" required defaultValue={item?.name} placeholder="Tomato, Roma" /></Field>
    <Field label="Category"><Select name="category" defaultValue={item?.category ?? "Other"}>{categories.map(category => <option key={category}>{category}</option>)}</Select></Field>
    <Field label="Vendor"><Select name="vendorId" defaultValue={item?.vendorId ?? ""}><option value="">— none —</option>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></Field>
    <Field label="Cost / count unit" hint="The measurement basis for this ingredient’s unit cost."><Input name="unit" readOnly={!!item?.measurementReviewedAt} required defaultValue={item?.unit ?? "each"} placeholder="oz, fl oz, lb, each…" /></Field>
    <Field label="Unit Cost ($)"><Input name="unitCost" type="number" step="0.00001" min="0" defaultValue={item?.unitCost ?? 0} /></Field>
    <Field label="Pack Size"><Input name="packSize" defaultValue={item?.packSize ?? ""} placeholder="6 x #10 can" /></Field>
    <Field label="Pack quantity"><Input name="packQty" readOnly={!!item?.measurementReviewedAt} type="number" min="0.00001" step="0.00001" defaultValue={item?.packQty ?? ""} placeholder="Optional" /></Field>
    <Field label="Pack unit"><Input name="packUnit" readOnly={!!item?.measurementReviewedAt} defaultValue={item?.packUnit ?? ""} placeholder="lb, gal, each…" /></Field>
    <Field label="Usable yield factor" hint={item?.measurementReviewedAt ? "Use Purchase → prep → recipe below to review measurement changes." : "Usable / purchased quantity; 1 means no trim loss."}><Input name="yieldFactor" readOnly={!!item?.measurementReviewedAt} type="number" min="0.00001" step="0.00001" defaultValue={item?.yieldFactor ?? 1} /></Field>
    <Field label="Item #"><Input name="sku" defaultValue={item?.sku ?? ""} placeholder="Vendor item / SKU #" /></Field>
    <Field label="Acumatica GCODE"><Input name="gcode" defaultValue={item?.gcode ?? ""} placeholder="GCODE" /></Field>
    <div className="col-span-full border-t border-hairline pt-4"><AllergenPicker selected={parseAllergens(item?.allergens)} /><p className="mt-2 text-xs text-zinc-500">Tag allergens from the product information. Recipes inherit these tags automatically.</p></div>
    <Field label="Diet" hint="From the product label. Recipes work out vegan / vegetarian from these.">
      <Select name="diet" defaultValue={item?.diet ?? ""}>
        <option value="">Not tagged yet</option>
        <option value="vegan">Vegan (no animal products)</option>
        <option value="vegetarian">Vegetarian, not vegan (dairy, eggs, honey…)</option>
        <option value="neither">Neither (meat, fish, gelatin, animal fat…)</option>
      </Select>
    </Field>
    <div className="col-span-full sm:col-span-1 lg:col-span-2">
      <p className="mb-1.5 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Label review</p>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="allergenReviewed" value="1" className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300" />
        <span>I checked the allergens and diet against the current product label</span>
      </label>
      <p className="mt-1 text-xs text-zinc-500">{reviewStatus(item?.allergenReviewedAt ?? null)} Reviews are due every 6 months.</p>
    </div>
  </div>;
}

function reviewStatus(reviewedAt: Date | null) {
  if (!reviewedAt) return "Never reviewed.";
  const review = allergenReview(reviewedAt);
  const on = reviewedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  return review.stale ? `Last reviewed ${on}, over 6 months ago.` : `Last reviewed ${on}.`;
}
