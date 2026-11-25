"use client";

import { useActionState, useState } from "react";
import { ComboPicker } from "@/components/ComboPicker";
import { VenueOptions } from "@/components/VenueOptions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CUSTOM_MENU_SECTIONS, CUSTOM_MENU_STATUSES } from "@/lib/menus/custom-menu";
import { allowedUnitsFor, defaultUnitFor, unitLabel } from "@/lib/recipes/units";
import type { VenueChoice } from "@/lib/venues/venue-directory";
import { saveCustomMenu, saveCustomMenuItem, type CustomMenuFormState } from "./actions";

const initial: CustomMenuFormState = { error: "", saved: false };

function Feedback({ state, savedText }: { state: CustomMenuFormState; savedText: string }) {
  return <>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {state.saved && <p role="status" className="text-xs text-sage">{savedText}</p>}
  </>;
}

export type CustomMenuHeaderFields = {
  id: string; name: string; subtitle: string | null; date: Date | null; serviceTime: string | null;
  venueId: string | null; venue?: VenueChoice | null; guestCount: number; pricePerGuest: number | null;
  targetFcp: number; status: string; notes: string | null; serviceNotes: string | null;
};

function dateValue(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function CustomMenuForm({ menu, venues, defaultVenueId }: { menu?: CustomMenuHeaderFields; venues: VenueChoice[]; defaultVenueId?: string | null }) {
  const [state, action, pending] = useActionState(saveCustomMenu, initial);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="id" value={menu?.id ?? ""} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Menu name"><Input name="name" required maxLength={200} defaultValue={menu?.name} placeholder="Staff Appreciation BBQ" /></Field>
      <Field label="Subtitle (optional)"><Input name="subtitle" maxLength={200} defaultValue={menu?.subtitle ?? ""} placeholder="Internal event · Texas-style" /></Field>
      <Field label="Venue"><Select aria-label="Venue" name="venueId" defaultValue={menu ? menu.venueId ?? "" : defaultVenueId ?? ""}><option value="">No venue</option><VenueOptions venues={venues} current={menu?.venue} /></Select></Field>
      <Field label="Date (optional)"><Input name="date" type="date" defaultValue={dateValue(menu?.date)} /></Field>
      <Field label="Service time (optional)"><Input name="serviceTime" maxLength={100} defaultValue={menu?.serviceTime ?? ""} placeholder="5:30 pm buffet" /></Field>
      <Field label="Guests"><Input name="guestCount" type="number" min="0" step="1" required defaultValue={menu?.guestCount ?? 0} /></Field>
      <Field label="Price per guest ($, optional)"><Input name="pricePerGuest" type="number" min="0" step="0.01" defaultValue={menu?.pricePerGuest ?? ""} placeholder="Leave blank for cost only" /></Field>
      <Field label="Target food cost %"><Input name="targetFcp" type="number" min="0.1" max="100" step="0.1" required defaultValue={menu?.targetFcp ?? 30} /></Field>
      <Field label="Status"><Select aria-label="Status" name="status" defaultValue={menu?.status ?? "DRAFT"}>{CUSTOM_MENU_STATUSES.map((status) => <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>)}</Select></Field>
    </div>
    <Field label="Service notes (print on every copy)"><Textarea name="serviceNotes" rows={2} defaultValue={menu?.serviceNotes ?? ""} placeholder="Buffet, two lines. Brisket carved to order. Sauces in squeeze bottles." /></Field>
    <Field label="Internal notes (costed copy only)"><Textarea name="notes" rows={2} defaultValue={menu?.notes ?? ""} placeholder="Charge to marketing budget. Cost with current invoice prices." /></Field>
    <Feedback state={state} savedText="Saved. Costs and packets are current." />
    <Button disabled={pending}>{pending ? "Saving…" : menu ? "Save menu details" : "Create custom menu →"}</Button>
  </form>;
}

export type CustomMenuRecipeOption = { id: string; name: string; prodCode: string; yieldQty: number; yieldUnit: string };
export type CustomMenuLineFields = {
  id: string; recipeId: string; section: string; menuTitle: string | null; menuDescription: string | null;
  portionQty: number | null; portionUnit: string | null; totalQty: number | null; totalUnit: string | null; sortOrder: number;
};

// Units a dish may be measured in: the recipe's own family, so a soup yielded
// in quarts can't be portioned by weight.
function UnitSelect({ name, label, yieldUnit, value, onChange }: { name: string; label: string; yieldUnit: string | null; value: string; onChange: (value: string) => void }) {
  const units = yieldUnit ? allowedUnitsFor(yieldUnit) : [];
  const options = value && !units.includes(value) ? [value, ...units] : units;
  return <Select aria-label={label} name={name} value={value} onChange={(event) => onChange(event.target.value)} disabled={!yieldUnit}>
    {!yieldUnit && <option value="">Pick a recipe first</option>}
    {options.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
  </Select>;
}

export function CustomMenuItemForm({ customMenuId, line, recipes, nextSortOrder = 0, guestCount }: {
  customMenuId: string; line?: CustomMenuLineFields; recipes: CustomMenuRecipeOption[]; nextSortOrder?: number; guestCount: number;
}) {
  const [state, action, pending] = useActionState(saveCustomMenuItem, initial);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const [recipeId, setRecipeId] = useState(line?.recipeId ?? "");
  const recipe = byId.get(recipeId) ?? null;
  const yieldUnit = recipe?.yieldUnit ?? null;
  const [portionUnit, setPortionUnit] = useState(line?.portionUnit ?? (yieldUnit ? defaultUnitFor(yieldUnit) : ""));
  const [totalUnit, setTotalUnit] = useState(line?.totalUnit ?? (yieldUnit ? defaultUnitFor(yieldUnit) : ""));
  const formId = line ? `custom-line-${line.id}` : "new-custom-line";

  function choose(id: string) {
    setRecipeId(id);
    const next = byId.get(id);
    if (next) {
      setPortionUnit(defaultUnitFor(next.yieldUnit));
      setTotalUnit(defaultUnitFor(next.yieldUnit));
    }
  }

  return <form id={formId} action={action} className="space-y-3">
    <input type="hidden" name="customMenuId" value={customMenuId} />
    <input type="hidden" name="id" value={line?.id ?? ""} />
    {line ? <input type="hidden" name="recipeId" value={line.recipeId} /> : (
      <Field label="Recipe or sub-recipe">
        <ComboPicker name="recipeId" placeholder="Search recipes & sub-recipes…"
          options={recipes.map((r) => ({ id: r.id, label: r.name, meta: `${r.prodCode} · yields ${r.yieldQty} ${unitLabel(r.yieldUnit)}`, keywords: r.prodCode }))}
          onSelect={(option) => choose(option?.id ?? "")} />
      </Field>
    )}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Portion per guest"><Input name="portionQty" type="number" min="0" step="any" defaultValue={line?.portionQty ?? ""} placeholder="6" /></Field>
      <Field label="Portion unit"><UnitSelect name="portionUnit" label="Portion unit" yieldUnit={yieldUnit} value={portionUnit} onChange={setPortionUnit} /></Field>
      <Field label="Or fixed total"><Input name="totalQty" type="number" min="0" step="any" defaultValue={line?.totalQty ?? ""} placeholder="Overrides per guest" /></Field>
      <Field label="Total unit"><UnitSelect name="totalUnit" label="Total unit" yieldUnit={yieldUnit} value={totalUnit} onChange={setTotalUnit} /></Field>
    </div>
    <p className="text-xs text-zinc-500">
      {recipe ? `Recipe yields ${recipe.yieldQty} ${unitLabel(recipe.yieldUnit)} per batch. ` : ""}
      Per guest × {guestCount} guests, unless a fixed total is entered (useful for sauces, bread or a carving station).
    </p>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Section">
        <Input aria-label="Section" name="section" list={`${formId}-sections`} required defaultValue={line?.section ?? "Mains"} />
        <datalist id={`${formId}-sections`}>{CUSTOM_MENU_SECTIONS.map((section) => <option key={section} value={section} />)}</datalist>
      </Field>
      <Field label="Menu title (optional)"><Input name="menuTitle" maxLength={200} defaultValue={line?.menuTitle ?? ""} placeholder={recipe?.name ?? "Uses the recipe name"} /></Field>
      <Field label="Order on menu"><Input name="sortOrder" type="number" min="0" step="1" required defaultValue={line?.sortOrder ?? nextSortOrder} /></Field>
    </div>
    <Field label="Menu description (optional, prints on the menu page)"><Textarea name="menuDescription" rows={2} maxLength={2000} defaultValue={line?.menuDescription ?? ""} placeholder="Post oak smoked 14 hours, salt & coarse pepper bark" /></Field>
    <Feedback state={state} savedText="Saved. Costs and packets are current." />
    <Button variant="secondary" disabled={pending || (!line && !recipeId)}>{pending ? "Saving…" : line ? "Save dish" : "Add to menu"}</Button>
  </form>;
}
