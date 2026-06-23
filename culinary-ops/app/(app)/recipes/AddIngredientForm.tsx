"use client";

import { useState } from "react";
import { ComboPicker, type ComboOption } from "@/components/ComboPicker";
import { Button, Field, Input, Select } from "@/components/ui";
import { allowedUnitsFor, defaultUnitFor, unitLabel } from "@/lib/units";
import { money } from "@/lib/costing";
import { addRecipeItem } from "./actions";

type Item = { id: string; name: string; unitCost: number; unit: string };

// Add an ingredient line to a recipe. Searchable item picker (shows unit cost)
// in place of the old long dropdown; qty/unit/Add stay disabled until an item
// is chosen. Once chosen, the unit dropdown is locked to units that convert
// within the item's purchase-unit family (a salt bought by the oz offers
// oz/lb/g/kg, not "each") so the line is always costable — cross-family lines
// can't be costed and would just flag.
export function AddIngredientForm({ recipeId, items }: { recipeId: string; items: Item[] }) {
  const [picked, setPicked] = useState<Item | null>(null);

  const options: ComboOption[] = items.map((it) => ({
    id: it.id,
    label: it.name,
    meta: `${money(it.unitCost)} / ${it.unit}`,
  }));

  const units = picked ? allowedUnitsFor(picked.unit) : [];

  return (
    <form action={addRecipeItem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="recipeId" value={recipeId} />
      <div className="min-w-[180px] flex-1">
        <Field label="Add ingredient">
          <ComboPicker
            options={options}
            name="itemId"
            placeholder="Search ingredients…"
            onSelect={(o) => setPicked(o ? items.find((it) => it.id === o.id) ?? null : null)}
          />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Qty">
          <Input name="quantity" type="number" step="0.01" min="0" defaultValue={1} disabled={!picked} />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Unit">
          {/* Remount on item change so the locked default unit applies. */}
          <Select
            key={picked?.id ?? "none"}
            name="unit"
            disabled={!picked}
            defaultValue={picked ? defaultUnitFor(picked.unit) : ""}
          >
            {picked ? (
              units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={!picked}>
        Add
      </Button>
    </form>
  );
}
