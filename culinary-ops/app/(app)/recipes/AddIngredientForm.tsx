"use client";

import { useState } from "react";
import { ComboPicker, type ComboOption } from "@/components/ComboPicker";
import { Button, Field, Input, Select } from "@/components/ui";
import { UNIT_OPTIONS, unitLabel } from "@/lib/units";
import { money } from "@/lib/costing";
import { addRecipeItem } from "./actions";

type Item = { id: string; name: string; unitCost: number; unit: string };

// Add an ingredient line to a recipe. Searchable item picker (shows unit cost)
// in place of the old long dropdown; qty/unit/Add stay disabled until an item
// is chosen.
export function AddIngredientForm({ recipeId, items }: { recipeId: string; items: Item[] }) {
  const [picked, setPicked] = useState(false);

  const options: ComboOption[] = items.map((it) => ({
    id: it.id,
    label: it.name,
    meta: `${money(it.unitCost)} / ${it.unit}`,
  }));

  return (
    <form action={addRecipeItem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="recipeId" value={recipeId} />
      <div className="min-w-[180px] flex-1">
        <Field label="Add ingredient">
          <ComboPicker options={options} name="itemId" placeholder="Search ingredients…" onSelect={(o) => setPicked(!!o)} />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Qty">
          <Input name="quantity" type="number" step="0.01" min="0" defaultValue={1} disabled={!picked} />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Unit">
          <Select name="unit" defaultValue="each" disabled={!picked}>
            {UNIT_OPTIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={!picked}>
        Add
      </Button>
    </form>
  );
}
