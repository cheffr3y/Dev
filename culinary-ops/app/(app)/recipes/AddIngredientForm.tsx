"use client";

import { ingredientUnits } from "@/lib/ingredients/measurements";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ComboPicker, type ComboOption } from "@/components/ComboPicker";
import { Button, Field, Input, Select } from "@/components/ui";
import { defaultUnitFor, unitLabel } from "@/lib/recipes/units";
import { money } from "@/lib/recipes/costing";
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
  const [state, setState] = useState({ error: "" }), [pending, setPending] = useState(false), [pickerKey, setPickerKey] = useState(0);
  const form = useRef<HTMLFormElement>(null), submitting = useRef(false);

  useEffect(() => {
    if (pickerKey > 0 && !pending) form.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
  }, [pickerKey, pending]);

  const options: ComboOption[] = items.map((it) => ({
    id: it.id,
    label: it.name,
    meta: `${money(it.unitCost, 5)} / ${it.unit}`,
    keywords: `${it.category} ${it.vendor?.name ?? ""} ${it.sku ?? ""} ${it.gcode ?? ""}`,
  }));

  const units = picked ? ingredientUnits(picked) : [];

  return (
    <form ref={form} className="flex flex-wrap items-end gap-2" aria-label="Add recipe ingredients" onSubmit={async event => {
      event.preventDefault(); if (submitting.current || !picked) return;
      const data = new FormData(event.currentTarget); submitting.current = true; setPending(true); setState({ error: "" });
      try {
        const result = await addRecipeIngredientWithState({ error: "" }, data); setState(result);
        if (!result.error) {
          setPicked(null); setPickerKey(value => value + 1);
          const quantity = form.current?.elements.namedItem("quantity") as HTMLInputElement | null;
          const note = form.current?.elements.namedItem("note") as HTMLInputElement | null;
          const sort = form.current?.elements.namedItem("sortOrder") as HTMLInputElement | null;
          if (quantity) quantity.value = "1"; if (note) note.value = ""; if (sort) sort.value = String(Number(data.get("sortOrder")) + 1);
        }
      } catch { setState({ error: "Connection interrupted. Check the ingredient list before retrying; your entry is kept." }); }
      finally { submitting.current = false; setPending(false); }
    }}>
      <input type="hidden" name="recipeId" value={recipeId} />
      <div className="min-w-[180px] flex-1">
        <Field label="Add ingredient">
          <ComboPicker
            key={pickerKey}
            disabled={pending}
            selectOnTab ariaLabel="Add ingredient"
            options={options}
            name="itemId"
            placeholder="Search ingredients…"
            onSelect={(o) => setPicked(o ? items.find((it) => it.id === o.id) ?? null : null)}
          />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Qty">
          <Input name="quantity" onFocus={event => event.currentTarget.select()} type="number" step="any" min="0" required defaultValue={1} disabled={!picked || pending} />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Unit">
          {/* Remount on item change so the locked default unit applies. */}
          <Select
            key={picked?.id ?? "none"}
            name="unit"
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
            disabled={!picked || pending}
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
      <Button type="submit" disabled={!picked || pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      <details className="w-full text-xs text-zinc-500"><summary className="w-fit cursor-pointer py-1">Prep note, group & sort order</summary><div className="mt-2 flex flex-wrap items-end gap-2">
      <div className="min-w-[150px] flex-1">
        <Field label="Prep / note">
          <Input name="note" placeholder="diced, room temp… (optional)" disabled={!picked || pending} />
        </Field>
      </div>
      <div className="w-44"><Field label="Group (optional)"><Input aria-label="Group (optional)" name="groupName" list={`ingredient-groups-${recipeId}`} placeholder="Herb base, emulsion…" /><datalist id={`ingredient-groups-${recipeId}`}>{groupNames.map(name => <option key={name} value={name} />)}</datalist></Field></div>
      <div className="w-24"><Field label="Sort order"><Input name="sortOrder" type="number" min="0" step="1" defaultValue={nextSortOrder} /></Field></div>
      </div></details>
      {picked && <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500"><span>{picked.category} · {picked.vendor?.name ?? "No vendor"}</span><AllergenBadges allergens={picked.allergens} /><Link href={`/items/${picked.id}`} target="_blank" rel="noreferrer" className="text-gold hover:underline">Ingredient details ↗</Link></div>}
      {state.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
