"use client";

import { useActionState, useState } from "react";
import { VenueOptions } from "@/components/VenueOptions";
import type { VenueChoice } from "@/lib/venues/venue-directory";
import { ComboPicker } from "@/components/ComboPicker";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SELLING_UNITS, TO_GO_STATUSES } from "@/lib/menus/to-go-options";
import { convertQty, unitFamily } from "@/lib/recipes/units";
import type { ToGoLine } from "@/lib/menus/to-go-rollup";
import { copyHmrRollout, saveToGoItem, saveToGoRollup, type ToGoFormState } from "./actions";

const initial: ToGoFormState = { error: "", saved: false };
function Feedback({ state }: { state: ToGoFormState }) {
  return <>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.saved && <p role="status" className="text-xs text-sage">Saved. HMR rollout and print book updated.</p>}</>;
}
type Header = { venue?: VenueChoice | null; id: string; name: string; venueId: string | null; status: string; notes: string | null; orderCutoff: string | null; pickupNotes: string | null };
export function ToGoHeaderForm({ rollup, venues }: { rollup?: Header; venues: VenueChoice[] }) {
  const [state, action, pending] = useActionState(saveToGoRollup, initial);
  return <form action={action} className="space-y-4" id={rollup ? "to-go-settings" : "new-to-go-rollup"}>
    <input type="hidden" name="id" value={rollup?.id ?? ""} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><Input name="name" required maxLength={200} defaultValue={rollup?.name} placeholder="November 2026 HMR" /></Field>
      <Field label="Venue"><Select aria-label="Venue" name="venueId" defaultValue={rollup?.venueId ?? ""}><option value="">Company-wide</option><VenueOptions venues={venues} current={rollup?.venue} /></Select></Field>
      {!rollup && <Field label="Start with"><Select aria-label="Start with" name="starter" defaultValue="blank"><option value="blank">Blank menu</option><option value="thanksgiving">Butchershop Thanksgiving menu · 11 items</option></Select></Field>}
    </div>
    <Feedback state={state} /><Button disabled={pending}>{pending ? "Saving…" : rollup ? "Save rollout settings" : "Create HMR rollout"}</Button>
    <details className="border-t border-hairline pt-3"><summary className="cursor-pointer text-sm text-gold">Dates, pickup & planning notes (optional)</summary><div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status"><Select aria-label="Status" name="status" defaultValue={rollup?.status ?? "DRAFT"}>{TO_GO_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></Field>
        <Field label="Order cutoff"><Input name="orderCutoff" type="date" defaultValue={rollup?.orderCutoff ?? ""} /></Field>
      </div>
      <Field label="Pickup dates and details"><Textarea name="pickupNotes" rows={2} defaultValue={rollup?.pickupNotes ?? ""} placeholder="Add when pickup plans are ready" /></Field>
      <Field label="Planning notes"><Textarea name="notes" rows={2} defaultValue={rollup?.notes ?? ""} /></Field>
    </div></details>
  </form>;
}

export function CopyHmrForm({ rollout }: { rollout: { id: string; name: string } }) {
  const [state, action, pending] = useActionState(copyHmrRollout, initial);
  return <form action={action} id="copy-hmr-rollout" className="space-y-3">
    <input type="hidden" name="sourceId" value={rollout.id} />
    <Field label="New rollout name"><Input name="name" required maxLength={200} placeholder="December 2026 HMR" defaultValue={`${rollout.name.slice(0, 193)} — copy`} /></Field>
    <p className="text-sm text-zinc-500">Keeps menu descriptions, recipes, proposed prices and reheating notes. The new rollout starts as a fresh draft with no old dates or sales figures.</p>
    <Feedback state={state} /><Button variant="secondary" disabled={pending}>{pending ? "Copying…" : "Create new rollout from this menu"}</Button>
  </form>;
}

type RecipeOption = { id: string; name: string; prodCode: string; yieldQty: number; yieldUnit: string };
export function ToGoItemForm({ rollupId, line, recipes, nextSortOrder = 0 }: {
  rollupId: string; line?: ToGoLine; recipes: RecipeOption[]; nextSortOrder?: number;
}) {
  const [state, action, pending] = useActionState(saveToGoItem, initial);
  const [name, setName] = useState(line?.name ?? "");
  const [unit, setUnit] = useState(line?.sellingUnit ?? "");
  const [recipeId, setRecipeId] = useState(line?.recipeId ?? "");
  const [resetMapping, setResetMapping] = useState(false);
  const recipe = recipes.find(recipe => recipe.id === recipeId);
  const originalUnit = unit === (line?.sellingUnit ?? "");
  const originalRecipe = recipeId === (line?.recipeId ?? "");
  const mappingUnit = !resetMapping && originalRecipe && line?.recipeQtyPerUnit != null && line.recipeAmountUnit
    ? line.recipeAmountUnit : recipe?.yieldUnit ?? "";
  const mappingNeeded = !!recipe && !!unit && convertQty(1, unit, recipe.yieldUnit) == null;
  function selectRecipe(id: string) {
    setRecipeId(id);
    const selected = recipes.find(recipe => recipe.id === id);
    if (!selected) return;
    if (!name.trim()) setName(selected.name);
    if (!unit) {
      const family = unitFamily(selected.yieldUnit);
      if (family) setUnit(family === "weight" ? "lb" : family === "volume" ? "quart" : "each");
    }
  }
  return <form id={line ? `to-go-line-${line.id}` : "new-to-go-line"} action={action} className="space-y-4">
    <input type="hidden" name="rollupId" value={rollupId} /><input type="hidden" name="id" value={line?.id ?? ""} />
    <input type="hidden" name="recipeAmountUnit" value={mappingUnit} />
    <input type="hidden" name="sortOrder" value={line?.sortOrder ?? nextSortOrder} />
    <input type="hidden" name="confidence" value={line?.confidence ?? "NEW"} />
    <input type="hidden" name="packagingCost" value={originalUnit ? line?.packagingCost ?? "" : ""} />
    <input type="hidden" name="packingNotes" value={line?.packingNotes ?? ""} />
    <input type="hidden" name="productionQty" value={originalUnit ? line?.productionQty ?? "" : ""} />
    <input type="hidden" name="actualSoldQty" value={originalUnit ? line?.actualSoldQty ?? "" : ""} />
    <Field label="Recipe (optional)"><ComboPicker name="recipeId" defaultId={line?.recipeId ?? ""} options={recipes.map(recipe => ({ id: recipe.id, label: recipe.name, meta: `${recipe.yieldQty} ${recipe.yieldUnit} · ${recipe.prodCode}` }))} placeholder="Search recipes or leave unlinked…" onSelect={option => selectRecipe(option?.id ?? "")} /></Field>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Item name"><Input name="name" required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="Mashed Potatoes" /></Field>
      <Field label="Selling unit"><Select aria-label="Selling unit" name="sellingUnit" value={unit} onChange={event => setUnit(event.target.value)}><option value="">Still deciding</option>{["Weight", "Liquid volume", "Small bites / packages"].map(group => <optgroup key={group} label={group}>{SELLING_UNITS.filter(option => option.group === group).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</Select></Field>
      <Field label={`Proposed price ($ / ${unit || "unit"})`}><Input key={unit} aria-label={`Proposed price ($ / ${unit || "unit"})`} name="price" type="number" min="0" step="0.01" defaultValue={originalUnit ? line?.price ?? "" : ""} /></Field>
    </div>
    <Field label="Menu description"><Textarea name="description" rows={2} defaultValue={line?.description ?? ""} placeholder="How you would describe this dish on the proposed menu" /></Field>
    <Field label="Storage & reheating notes"><Textarea name="customerInstructions" rows={2} defaultValue={line?.customerInstructions ?? ""} placeholder="How the customer should store and reheat it — add when ready" /></Field>
    {line && !originalUnit && <p role="status" className="text-sm text-amber-800">Selling unit changed. Re-enter the proposed price in the new unit before saving.</p>}
    {recipe && unit ? <details key={`${recipeId}-${unit}`} open={mappingNeeded} data-hmr-section="recipe-amount" className="border-t border-hairline pt-3"><summary className="cursor-pointer text-sm text-gold">{mappingNeeded ? "Recipe amount needed to estimate food cost" : "Recipe amount (optional)"}</summary><div className="mt-3 space-y-3">
      <Field label={`${mappingUnit} per ${unit}`} hint={mappingNeeded ? `How much of the recipe goes in one ${unit}? The saved batch yields ${recipe.yieldQty} ${recipe.yieldUnit}.` : "Weight and volume convert automatically. Enter an override only when you need one."}><Input key={`${recipeId}-${unit}-${resetMapping}`} name="recipeQtyPerUnit" type="number" min="0.000001" step="any" defaultValue={originalUnit && originalRecipe && !resetMapping ? line?.recipeQtyPerUnit ?? "" : ""} /></Field>
      {mappingUnit !== recipe.yieldUnit && <button type="button" className="text-xs text-gold underline" onClick={() => setResetMapping(true)}>Use current recipe yield unit ({recipe.yieldUnit}) and clear the custom amount</button>}
    </div></details> : <input type="hidden" name="recipeQtyPerUnit" value="" />}
    <Feedback state={state} /><Button variant="secondary" disabled={pending}>{pending ? "Saving…" : line ? "Save item" : "Add item"}</Button>
    <details data-hmr-section="item-details" className="border-t border-hairline pt-3"><summary className="cursor-pointer text-sm text-gold">Section & planning notes (optional)</summary><div className="mt-3 space-y-3">
      <Field label="Section"><Input name="section" maxLength={100} defaultValue={line?.section ?? "Meals"} list="to-go-sections" /></Field>
      <Field label="Planning notes"><Textarea name="notes" rows={2} defaultValue={line?.notes ?? ""} /></Field>
    </div></details>
    <details data-hmr-section="estimate"><summary className="cursor-pointer text-sm text-gold">Estimated demand (optional)</summary><div className="mt-3">
      <Field label={`Estimated sales (${unit || "unit undecided"})`} hint="A rough quantity for ingredient planning; leave blank if you’re only proposing the menu."><Input key={unit} aria-label={`Estimated sales (${unit || "unit undecided"})`} name="forecastQty" type="number" min="0" step="any" defaultValue={originalUnit ? line?.forecastQty ?? "" : ""} /></Field>
    </div></details>
  </form>;
}
