"use client";

import { useActionState, useState } from "react";
import { ComboPicker } from "@/components/ComboPicker";
import { VenueOptions } from "@/components/VenueOptions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CUSTOM_MENU_SECTIONS, CUSTOM_MENU_STATUSES, rawItemUnits, type CustomMenuRawItem } from "@/lib/menus/custom-menu";
import { allowedUnitsFor, defaultUnitFor, unitLabel, UNIT_OPTIONS } from "@/lib/recipes/units";
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
export type CustomMenuIngredientOption = CustomMenuRawItem & { sku: string | null; gcode: string | null };
export type CustomMenuLineFields = {
  id: string; recipeId: string | null; itemId?: string | null; section: string; menuTitle: string | null; menuDescription: string | null;
  portionQty: number | null; portionUnit: string | null; totalQty: number | null; totalUnit: string | null; sortOrder: number;
};

const ALL_UNITS = UNIT_OPTIONS.flatMap((group) => group.units);

// Units a line may be measured in: a recipe's own yield family (a soup yielded
// in quarts can't be portioned by weight), or the units a raw ingredient can
// be costed in (its purchase unit, pack contents and reviewed each weight).
function unitsFor(source: { kind: "recipe"; yieldUnit: string } | { kind: "item"; item: CustomMenuRawItem } | null): string[] {
  if (!source) return [];
  return source.kind === "recipe" ? allowedUnitsFor(source.yieldUnit) : rawItemUnits(source.item, ALL_UNITS);
}
function defaultUnit(source: Parameters<typeof unitsFor>[0]): string {
  if (!source) return "";
  if (source.kind === "recipe") return defaultUnitFor(source.yieldUnit);
  const units = unitsFor(source);
  // Buns bought by the case are served by the piece.
  return units.find((unit) => unit === (source.item.eachLabel || "each")) ?? units.find((unit) => unit === "each") ?? units[0] ?? source.item.unit;
}

function UnitSelect({ name, label, units, value, onChange, placeholder }: { name: string; label: string; units: string[]; value: string; onChange: (value: string) => void; placeholder: string }) {
  const options = value && !units.includes(value) ? [value, ...units] : units;
  return <Select aria-label={label} name={name} value={value} onChange={(event) => onChange(event.target.value)} disabled={!units.length}>
    {!units.length && <option value="">{placeholder}</option>}
    {options.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
  </Select>;
}

export function CustomMenuItemForm({ customMenuId, line, recipes, ingredients, nextSortOrder = 0, guestCount }: {
  customMenuId: string; line?: CustomMenuLineFields; recipes: CustomMenuRecipeOption[]; ingredients: CustomMenuIngredientOption[]; nextSortOrder?: number; guestCount: number;
}) {
  const [state, action, pending] = useActionState(saveCustomMenuItem, initial);
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemById = new Map(ingredients.map((item) => [item.id, item]));
  const [kind, setKind] = useState<"recipe" | "item">(line && !line.recipeId ? "item" : "recipe");
  const [recipeId, setRecipeId] = useState(line?.recipeId ?? "");
  const [itemId, setItemId] = useState(line?.itemId ?? "");
  const recipe = kind === "recipe" ? recipeById.get(recipeId) ?? null : null;
  const item = kind === "item" ? itemById.get(itemId) ?? null : null;
  const source = recipe ? { kind: "recipe" as const, yieldUnit: recipe.yieldUnit } : item ? { kind: "item" as const, item } : null;
  const units = unitsFor(source);
  const [portionUnit, setPortionUnit] = useState(line?.portionUnit ?? defaultUnit(source));
  const [totalUnit, setTotalUnit] = useState(line?.totalUnit ?? defaultUnit(source));
  const formId = line ? `custom-line-${line.id}` : "new-custom-line";
  const picked = Boolean(recipe || item);

  function resetUnits(next: Parameters<typeof unitsFor>[0]) {
    setPortionUnit(defaultUnit(next));
    setTotalUnit(defaultUnit(next));
  }
  function chooseRecipe(id: string) {
    setRecipeId(id);
    const next = recipeById.get(id);
    resetUnits(next ? { kind: "recipe", yieldUnit: next.yieldUnit } : null);
  }
  function chooseItem(id: string) {
    setItemId(id);
    const next = itemById.get(id);
    resetUnits(next ? { kind: "item", item: next } : null);
  }
  function switchKind(next: "recipe" | "item") {
    setKind(next);
    resetUnits(next === "recipe" ? (recipeById.get(recipeId) ? { kind: "recipe", yieldUnit: recipeById.get(recipeId)!.yieldUnit } : null) : (itemById.get(itemId) ? { kind: "item", item: itemById.get(itemId)! } : null));
  }

  return <form id={formId} action={action} className="space-y-3">
    <input type="hidden" name="customMenuId" value={customMenuId} />
    <input type="hidden" name="id" value={line?.id ?? ""} />
    <input type="hidden" name="kind" value={kind} />
    {line ? <>
      <input type="hidden" name="recipeId" value={line.recipeId ?? ""} />
      <input type="hidden" name="itemId" value={line.itemId ?? ""} />
    </> : <>
      <div role="radiogroup" aria-label="Add a recipe or a raw ingredient" className="flex flex-wrap gap-2">
        {([["recipe", "+ Recipe / sub-recipe"], ["item", "+ Raw ingredient"]] as const).map(([value, text]) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => switchKind(value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${kind === value ? "border-primary bg-primary/15 font-medium text-ink" : "border-hairline text-zinc-500 hover:text-ink"}`}>{text}</button>
        ))}
      </div>
      {kind === "recipe" ? (
        <Field label="Recipe or sub-recipe">
          <ComboPicker key="recipe" name="recipeId" placeholder="Search recipes & sub-recipes…" defaultId={recipeId}
            options={recipes.map((r) => ({ id: r.id, label: r.name, meta: `${r.prodCode} · yields ${r.yieldQty} ${unitLabel(r.yieldUnit)}`, keywords: r.prodCode }))}
            onSelect={(option) => chooseRecipe(option?.id ?? "")} />
        </Field>
      ) : (
        <Field label="Raw ingredient (bought, not made — e.g. buns, chips, pickles)">
          <ComboPicker key="item" name="itemId" placeholder="Search ingredients, SKU or GCODE…" defaultId={itemId}
            options={ingredients.map((i) => ({ id: i.id, label: i.name, meta: `$${i.unitCost.toFixed(2)} / ${unitLabel(i.unit)} · ${i.category}`, keywords: [i.sku, i.gcode].filter(Boolean).join(" ") }))}
            onSelect={(option) => chooseItem(option?.id ?? "")} />
        </Field>
      )}
    </>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Portion per guest"><Input name="portionQty" type="number" min="0" step="any" defaultValue={line?.portionQty ?? ""} placeholder={kind === "item" ? "1" : "6"} /></Field>
      <Field label="Portion unit"><UnitSelect name="portionUnit" label="Portion unit" units={units} value={portionUnit} onChange={setPortionUnit} placeholder={kind === "item" ? "Pick an ingredient first" : "Pick a recipe first"} /></Field>
      <Field label="Or fixed total"><Input name="totalQty" type="number" min="0" step="any" defaultValue={line?.totalQty ?? ""} placeholder="Overrides per guest" /></Field>
      <Field label="Total unit"><UnitSelect name="totalUnit" label="Total unit" units={units} value={totalUnit} onChange={setTotalUnit} placeholder={kind === "item" ? "Pick an ingredient first" : "Pick a recipe first"} /></Field>
    </div>
    <p className="text-xs text-zinc-500">
      {recipe ? `Recipe yields ${recipe.yieldQty} ${unitLabel(recipe.yieldUnit)} per batch. ` : ""}
      {item ? `Bought at $${item.unitCost.toFixed(2)} per ${unitLabel(item.unit)}${item.packQty && item.packUnit ? ` (${item.packQty} ${unitLabel(item.packUnit)})` : ""}. ` : ""}
      Per guest × {guestCount} guests, unless a fixed total is entered (useful for sauces, bread or a carving station).
    </p>
    {item && units.length === 1 && units[0] === item.unit && !line && <p className="text-xs text-amber-700">This ingredient can only be measured by the {unitLabel(item.unit)}. To portion it by the piece or by weight, open it under Ingredients, set the pack size (e.g. 96 each) or each weight, and choose Apply reviewed measurements.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Section">
        <Input aria-label="Section" name="section" list={`${formId}-sections`} required defaultValue={line?.section ?? "Mains"} />
        <datalist id={`${formId}-sections`}>{CUSTOM_MENU_SECTIONS.map((section) => <option key={section} value={section} />)}</datalist>
      </Field>
      <Field label="Menu title (optional)"><Input name="menuTitle" maxLength={200} defaultValue={line?.menuTitle ?? ""} placeholder={recipe?.name ?? item?.name ?? "Uses the recipe or ingredient name"} /></Field>
      <Field label="Order on menu"><Input name="sortOrder" type="number" min="0" step="1" required defaultValue={line?.sortOrder ?? nextSortOrder} /></Field>
    </div>
    <Field label="Menu description (optional, prints on the menu page)"><Textarea name="menuDescription" rows={2} maxLength={2000} defaultValue={line?.menuDescription ?? ""} placeholder={kind === "item" ? "Toasted potato bun" : "Post oak smoked 14 hours, salt & coarse pepper bark"} /></Field>
    <Feedback state={state} savedText="Saved. Costs and packets are current." />
    <Button variant="secondary" disabled={pending || (!line && !picked)}>{pending ? "Saving…" : line ? "Save line" : "Add to menu"}</Button>
  </form>;
}
