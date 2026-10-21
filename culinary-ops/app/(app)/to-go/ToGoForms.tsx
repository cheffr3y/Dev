"use client";

import { VenueOptions } from "@/components/VenueOptions";


import { useActionState, useState } from "react";
import { ComboPicker } from "@/components/ComboPicker";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SELLING_UNITS, TO_GO_CONFIDENCE, TO_GO_STATUSES } from "@/lib/to-go-options";
import type { ToGoLine } from "@/lib/to-go-rollup";
import { saveToGoItem, saveToGoRollup, type ToGoFormState } from "./actions";

const initial: ToGoFormState = { error: "", saved: false };
function Feedback({ state }: { state: ToGoFormState }) {
  return <>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.saved && <p role="status" className="text-xs text-sage">Saved. Rollup and print books updated.</p>}</>;
}
type Header = { venue?: import("@/lib/venue-directory").VenueChoice | null; id: string; name: string; venueId: string | null; status: string; notes: string | null; orderCutoff: string | null; pickupNotes: string | null };
export function ToGoHeaderForm({ rollup, venues }: { rollup?: Header; venues: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveToGoRollup, initial);
  return <form action={action} className="space-y-4" id={rollup ? "to-go-settings" : "new-to-go-rollup"}>
    <input type="hidden" name="id" value={rollup?.id ?? ""} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><Input name="name" required maxLength={200} defaultValue={rollup?.name} placeholder="Butchershop Thanksgiving 2026" /></Field>
      <Field label="Venue"><Select aria-label="Venue" name="venueId" defaultValue={rollup?.venueId ?? ""}><option value="">Company-wide</option><VenueOptions venues={venues} current={rollup?.venue} /></Select></Field>
      {!rollup && <Field label="Start with"><Select aria-label="Start with" name="starter" defaultValue="thanksgiving"><option value="thanksgiving">Butchershop Thanksgiving menu · 11 items</option><option value="blank">Blank rollup</option></Select></Field>}
      <Field label="Status"><Select aria-label="Status" name="status" defaultValue={rollup?.status ?? "DRAFT"}>{TO_GO_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></Field>
      <Field label="Order cutoff"><Input name="orderCutoff" type="date" defaultValue={rollup?.orderCutoff ?? ""} /></Field>
    </div>
    <Field label="Pickup dates and details"><Textarea name="pickupNotes" rows={2} defaultValue={rollup?.pickupNotes ?? ""} placeholder="Pickup dates, location and time windows" /></Field>
    <Field label="Planning notes"><Textarea name="notes" rows={2} defaultValue={rollup?.notes ?? ""} /></Field>
    {!rollup && <p className="text-sm text-zinc-500">The Thanksgiving starter includes menu names and descriptions. Sales estimates, prices and recipe links stay blank. Solid sides start in lb; choose liquid sizes and small-bite formats when ready.</p>}
    <Feedback state={state} /><Button disabled={pending}>{pending ? "Saving…" : rollup ? "Save rollup settings" : "Create holiday rollup"}</Button>
  </form>;
}
type RecipeOption = { id: string; name: string; prodCode: string; yieldQty: number; yieldUnit: string };
export function ToGoItemForm({ rollupId, line, recipes, nextSortOrder = 0 }: {
  rollupId: string; line?: ToGoLine; recipes: RecipeOption[]; nextSortOrder?: number;
}) {
  const [state, action, pending] = useActionState(saveToGoItem, initial);
  const [unit, setUnit] = useState(line?.sellingUnit ?? "");
  const [recipeId, setRecipeId] = useState(line?.recipeId ?? "");
  const [resetMapping, setResetMapping] = useState(false);
  const recipe = recipes.find(recipe => recipe.id === recipeId);
  const originalUnit = unit === (line?.sellingUnit ?? "");
  const originalRecipe = recipeId === (line?.recipeId ?? "");
  const mappingUnit = !resetMapping && originalRecipe && line?.recipeQtyPerUnit != null && line.recipeAmountUnit
    ? line.recipeAmountUnit : recipe?.yieldUnit ?? "";
  return <form id={line ? `to-go-line-${line.id}` : "new-to-go-line"} action={action} className="space-y-4">
    <input type="hidden" name="rollupId" value={rollupId} /><input type="hidden" name="id" value={line?.id ?? ""} />
    <input type="hidden" name="recipeAmountUnit" value={mappingUnit} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Item name"><Input name="name" required maxLength={200} defaultValue={line?.name} placeholder="Mashed Potatoes" /></Field>
      <Field label="Section"><Input name="section" required maxLength={100} defaultValue={line?.section ?? "Sides"} list="to-go-sections" /></Field>
      <Field label="Selling unit"><Select aria-label="Selling unit" name="sellingUnit" value={unit} onChange={event => setUnit(event.target.value)}><option value="">Still deciding</option>{["Weight", "Liquid volume", "Small bites / packages"].map(group => <optgroup key={group} label={group}>{SELLING_UNITS.filter(option => option.group === group).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</Select></Field>
    </div>
    <div key={unit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={`Estimated sales (${unit || "unit undecided"})`} hint="Your best guess; blank means unknown."><Input aria-label={`Estimated sales (${unit || "unit undecided"})`} name="forecastQty" type="number" min="0" step="any" defaultValue={originalUnit ? line?.forecastQty ?? "" : ""} /></Field>
      <Field label={`Selling price ($ / ${unit || "unit"})`}><Input aria-label={`Selling price ($ / ${unit || "unit"})`} name="price" type="number" min="0" step="0.01" defaultValue={originalUnit ? line?.price ?? "" : ""} /></Field>
      <Field label={`Packaging cost ($ / ${unit || "unit"})`} hint="Container, lid, label, etc. Enter 0 if none."><Input aria-label={`Packaging cost ($ / ${unit || "unit"})`} name="packagingCost" type="number" min="0" step="0.001" defaultValue={originalUnit ? line?.packagingCost ?? "" : ""} /></Field>
      <Field label="Estimate confidence"><Select aria-label="Estimate confidence" name="confidence" defaultValue={line?.confidence ?? "NEW"}>{TO_GO_CONFIDENCE.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
      <Field label={`Production target (${unit || "unit"})`} hint="Optional. Replaces the estimate for prep only."><Input aria-label={`Production target (${unit || "unit undecided"})`} name="productionQty" type="number" min="0" step="any" defaultValue={originalUnit ? line?.productionQty ?? "" : ""} /></Field>
      <Field label={`Actual sold (${unit || "unit"})`} hint="Fill in after sales to compare with your guess."><Input aria-label={`Actual sold (${unit || "unit undecided"})`} name="actualSoldQty" type="number" min="0" step="any" defaultValue={originalUnit ? line?.actualSoldQty ?? "" : ""} /></Field>
    </div>
    {!originalUnit && <p role="status" className="text-sm text-amber-800">Selling unit changed. Re-enter quantities and prices in the new unit before saving.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Recipe link (optional)"><ComboPicker name="recipeId" defaultId={line?.recipeId ?? ""} options={recipes.map(recipe => ({ id: recipe.id, label: recipe.name, meta: `${recipe.yieldQty} ${recipe.yieldUnit} · ${recipe.prodCode}` }))} placeholder="Search recipes or leave unlinked…" onSelect={option => setRecipeId(option?.id ?? "")} /></Field>
      <Field label={recipe ? `${mappingUnit} per ${unit || "selling unit"} (override)` : "Recipe amount per selling unit (override)"} hint={recipe ? `Standard recipe yields ${recipe.yieldQty} ${recipe.yieldUnit}. Leave blank for automatic weight / volume conversion. Set explicitly for kits, trays or a different yield basis.` : "Link a recipe to define a package amount. No serving weight is assumed."}><Input key={`${recipeId}-${unit}-${resetMapping}`} name="recipeQtyPerUnit" type="number" min="0.000001" step="any" disabled={!recipe} defaultValue={originalUnit && originalRecipe && !resetMapping ? line?.recipeQtyPerUnit ?? "" : ""} /></Field>
    </div>
    {recipe && mappingUnit !== recipe.yieldUnit && <button type="button" className="text-xs text-gold underline" onClick={() => setResetMapping(true)}>Use current recipe yield unit ({recipe.yieldUnit}) and clear the custom amount</button>}
    <Field label="Menu description"><Textarea name="description" rows={2} defaultValue={line?.description ?? ""} /></Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Packing specification"><Textarea name="packingNotes" rows={2} defaultValue={line?.packingNotes ?? ""} placeholder="Container, fill weight, accompaniments and assembly" /></Field>
      <Field label="Customer storage and reheating instructions"><Textarea name="customerInstructions" rows={2} defaultValue={line?.customerInstructions ?? ""} /></Field>
      <Field label="Development / planning notes"><Textarea name="notes" rows={2} defaultValue={line?.notes ?? ""} placeholder="Trial results, sales assumptions or things still to decide" /></Field>
      <Field label="Sort order"><Input name="sortOrder" type="number" min="0" step="1" required defaultValue={line?.sortOrder ?? nextSortOrder} /></Field>
    </div>
    <Feedback state={state} /><Button variant="secondary" disabled={pending}>{pending ? "Saving…" : line ? "Save item" : "Add item to rollup"}</Button>
  </form>;
}
