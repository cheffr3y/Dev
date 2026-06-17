"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { UNIT_OPTIONS, unitLabel } from "@/lib/units";
import { money, num } from "@/lib/costing";
import { addSubRecipe } from "./actions";

type Option = { id: string; name: string; yieldQty: number; yieldUnit: string; cost: number };

// Add-sub-recipe form. Unlike a plain text field, the quantity unit is tied to
// the chosen recipe's yield unit: pick "Texas BBQ Sauce" (yields in gallons)
// and the unit snaps to gallons, so you enter "2.5 gal", not a free-form value
// the costing/scaling math can't interpret. Other convertible units are still
// selectable (e.g. enter quarts of a gallon-yield sauce) and get converted.
export function SubRecipeForm({ parentId, options }: { parentId: string; options: Option[] }) {
  const [childId, setChildId] = useState("");
  const [unit, setUnit] = useState("serving");

  const selected = options.find((o) => o.id === childId);

  // Unit dropdown: the recipe's own yield unit first (so it's the default and
  // always available even if it's a free-text unit like "servings"), then the
  // standard kitchen units.
  const unitGroups = useMemo(() => {
    const yieldUnit = selected?.yieldUnit;
    const groups = yieldUnit && !UNIT_OPTIONS.some((g) => g.units.includes(yieldUnit))
      ? [{ group: "Recipe yield", units: [yieldUnit] }, ...UNIT_OPTIONS]
      : UNIT_OPTIONS;
    return groups;
  }, [selected?.yieldUnit]);

  return (
    <div className="border-t border-zinc-100 p-4">
      <form action={addSubRecipe} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="parentId" value={parentId} />
        <div className="min-w-[180px] flex-1">
          <Field label="Add sub-recipe">
            <Select
              name="childId"
              required
              value={childId}
              onChange={(e) => {
                const id = e.target.value;
                setChildId(id);
                const opt = options.find((o) => o.id === id);
                if (opt) setUnit(opt.yieldUnit);
              }}
            >
              <option value="" disabled>
                Select recipe…
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({money(o.cost)} / {num(o.yieldQty)} {o.yieldUnit})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-24">
          <Field label="Qty">
            <Input name="quantity" type="number" step="0.01" min="0.01" defaultValue={1} required />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Unit">
            <Select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {unitGroups.map((g) => (
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
        <Button type="submit">Add</Button>
      </form>
      <p className="mt-2 text-xs text-zinc-400">
        {selected
          ? `Quantity is measured in ${selected.name}'s yield (${num(selected.yieldQty)} ${selected.yieldUnit} per batch). Cost is its full cost ÷ yield, times the amount above.`
          : "Quantity is measured in the chosen recipe's yield unit. Circular references are blocked."}
      </p>
    </div>
  );
}
