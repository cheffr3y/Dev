"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ComboPicker, type ComboOption } from "@/components/ComboPicker";
import { Button, Field, Input, Select } from "@/components/ui";
import { allowedUnitsFor, defaultUnitFor, unitLabel } from "@/lib/units";
import { money } from "@/lib/costing";
import { addRecipeIngredientWithState } from "./actions";
import type { IngredientOption } from "@/components/RecipeIngredientEditor";
import { AllergenBadges } from "@/components/AllergenBadges";

type Item = IngredientOption;

// Add an ingredient line to a recipe. Searchable item picker (shows unit cost)
// in place of the old long dropdown; qty/unit/Add stay disabled until an item
// is chosen. Once chosen, the unit dropdown is locked to units that convert
// within the item's purchase-unit family (a salt bought by the oz offers
// oz/lb/g/kg, not "each") so the line is always costable — cross-family lines
// can't be costed and would just flag.
export function AddIngredientForm({ recipeId, items, groupNames = [], nextSortOrder = 0 }: { recipeId: string; items: Item[]; groupNames?: string[]; nextSortOrder?: number }) {
  const [picked, setPicked] = useState<Item | null>(null);
  const [state, action, pending] = useActionState(addRecipeIngredientWithState, { error: "" });

  const options: ComboOption[] = items.map((it) => ({
    id: it.id,
    label: it.name,
    meta: `${money(it.unitCost, 5)} / ${it.unit}`,
    keywords: `${it.category} ${it.vendor?.name ?? ""} ${it.sku ?? ""} ${it.gcode ?? ""}`,
  }));

  const units = picked ? allowedUnitsFor(picked.unit) : [];

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
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
      <div className="min-w-[150px] flex-1">
        <Field label="Prep / note">
          <Input name="note" placeholder="diced, room temp… (optional)" disabled={!picked} />
        </Field>
      </div>
      <div className="w-44"><Field label="Group (optional)"><Input aria-label="Group (optional)" name="groupName" list={`ingredient-groups-${recipeId}`} placeholder="Herb base, emulsion…" /><datalist id={`ingredient-groups-${recipeId}`}>{groupNames.map(name => <option key={name} value={name} />)}</datalist></Field></div>
      <div className="w-24"><Field label="Sort order"><Input name="sortOrder" type="number" min="0" step="1" defaultValue={nextSortOrder} /></Field></div>
      <Button type="submit" disabled={!picked || pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {picked && <div className="w-full space-y-1 rounded-lg border border-hairline bg-cream p-3 text-xs text-zinc-500"><p>{picked.category} · {picked.vendor?.name ?? "No vendor"} · Item # {picked.sku ?? "—"} · GCODE {picked.gcode ?? "—"}</p><AllergenBadges allergens={picked.allergens} /><Link href={`/items/${picked.id}`} target="_blank" rel="noreferrer" className="inline-block text-blue-600 underline">Review ingredient details ↗</Link></div>}
      {state.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
