"use client";

import { VenueOptions } from "@/components/VenueOptions";


import { useActionState } from "react";
import { ComboPicker } from "@/components/ComboPicker";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { ROLLOUT_STATUSES } from "@/lib/menus/menu-rollout";
import { saveRollout, saveRolloutItem, type MenuFormState } from "./actions";

const initial: MenuFormState = { error: "", saved: false };
function Feedback({ state }: { state: MenuFormState }) {
  return <>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.saved && <p role="status" className="text-xs text-sage">Saved. Estimates and packets are current.</p>}</>;
}
type Header = { venue?: import("@/lib/venues/venue-directory").VenueChoice | null; id: string; name: string; subtitle: string | null; venueId: string | null; targetFcp: number; expectedCovers: number; status: string; notes: string | null };
export function RolloutForm({ rollout, venues }: { rollout?: Header; venues: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveRollout, initial);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="id" value={rollout?.id ?? ""} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Name"><Input name="name" required maxLength={200} defaultValue={rollout?.name} placeholder="Annex Fall Lounge Menu" /></Field>
      <Field label="Subtitle"><Input name="subtitle" defaultValue={rollout?.subtitle ?? ""} placeholder="Seasonal launch · Q4 2026" /></Field>
      <Field label="Venue"><Select aria-label="Venue" name="venueId" defaultValue={rollout?.venueId ?? ""}><option value="">Company-wide</option><VenueOptions venues={venues} current={rollout?.venue} /></Select></Field>
      <Field label="Target food cost %"><Input name="targetFcp" type="number" min="0.1" max="100" step="0.1" required defaultValue={rollout?.targetFcp ?? 28} /></Field>
      <Field label="Baseline covers"><Input name="expectedCovers" type="number" min="0" step="1" required defaultValue={rollout?.expectedCovers ?? 100} /></Field>
      <Field label="Status"><Select aria-label="Status" name="status" defaultValue={rollout?.status ?? "DRAFT"}>{ROLLOUT_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></Field>
    </div>
    <Field label="Launch notes"><Textarea name="notes" rows={2} defaultValue={rollout?.notes ?? ""} /></Field>
    <Feedback state={state} /><Button disabled={pending}>{pending ? "Saving…" : rollout ? "Save rollout" : "Create menu rollout →"}</Button>
  </form>;
}
export type MenuLineFields = { id: string; recipeId: string; section: string; menuTitle: string | null; menuDescription: string | null; menuPrice: number | null; parBatches: number; sortOrder: number };
export function MenuItemForm({ rolloutId, line, recipes = [], nextSortOrder = 0, inline = false }: {
  rolloutId: string; line?: MenuLineFields; recipes?: { id: string; name: string; prodCode: string }[]; nextSortOrder?: number; inline?: boolean;
}) {
  const [state, action, pending] = useActionState(saveRolloutItem, initial);
  const formId = line ? `menu-line-${line.id}` : "new-menu-line";
  return <form id={formId} action={action} className="space-y-3">
    <input type="hidden" name="rolloutId" value={rolloutId} /><input type="hidden" name="id" value={line?.id ?? ""} />
    {line ? <input type="hidden" name="recipeId" value={line.recipeId} /> : <Field label="Recipe"><ComboPicker name="recipeId" options={recipes.map(recipe => ({ id: recipe.id, label: recipe.name, meta: recipe.prodCode }))} placeholder="Search recipes & builds…" /></Field>}
    <div className="grid gap-3 sm:grid-cols-3">
      {!inline && <><Field label="Menu price ($)"><Input name="menuPrice" type="number" min="0" step="0.01" defaultValue={line?.menuPrice ?? ""} placeholder="Recipe price" /></Field>
      <Field label="Opening par (batches)"><Input name="parBatches" type="number" min="0" step="any" required defaultValue={line?.parBatches ?? 1} /></Field></>}
      <Field label="Section"><Input aria-label="Section" name="section" list={`${formId}-sections`} required defaultValue={line?.section ?? "Main"} /><datalist id={`${formId}-sections`}>{["Snacks", "Raw / Cold", "Small Plates", "Mains", "Sides", "Dessert"].map(section => <option key={section}>{section}</option>)}</datalist></Field>
      <Field label="Menu title (optional)"><Input name="menuTitle" defaultValue={line?.menuTitle ?? ""} /></Field>
      <Field label="Sort order"><Input name="sortOrder" type="number" min="0" step="1" required defaultValue={line?.sortOrder ?? nextSortOrder} /></Field>
    </div>
    <Field label="Menu description / service notes"><Textarea name="menuDescription" rows={2} defaultValue={line?.menuDescription ?? ""} /></Field>
    <Feedback state={state} /><Button variant="secondary" disabled={pending}>{pending ? "Saving…" : line ? "Save dish" : "Add recipe to rollout"}</Button>
  </form>;
}
