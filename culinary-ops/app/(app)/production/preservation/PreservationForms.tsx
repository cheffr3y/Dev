"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { AllergenPicker } from "@/components/AllergenPicker";
import { money } from "@/lib/recipes/costing";
import { PRESERVATION_METHODS } from "@/lib/production/preservation";
import { savePreservation } from "./actions";

const number = (form: FormData, key: string) => String(form.get(key) ?? "").trim() === "" ? null : Number(form.get(key));
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
type Option = { id: string; name: string };
function useSave() {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || event.ctrlKey || event.metaKey || link.getAttribute("target") === "_blank") return;
      if (!window.confirm("Leave these unsaved batch entries?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty, busy]);
  async function save(command: unknown) {
    setBusy(true); setError("");
    try {
      const result = await savePreservation(command);
      if (!result.ok) { setError(result.error); return; }
      setDirty(false); router.push(`/production/preservation/${result.id}`); router.refresh();
    } catch { setError("Connection interrupted. Retry the same entry to retrieve the saved result before making changes."); }
    finally { setBusy(false); }
  }
  return { busy, error, save, markDirty: () => setDirty(true) };
}
export function NewPreservationForm({ venues, recipes, items, today, defaultVenue }: { venues: Option[]; recipes: Option[]; items: Option[]; today: string; defaultVenue: string }) {
  const { busy, error, save, markDirty } = useSave();
  const [id] = useState(() => crypto.randomUUID());
  const startedAt = useRef<string | null>(null);
  return <form aria-label="Create preservation batch" className="space-y-4" onChange={markDirty} onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (!startedAt.current) startedAt.current = new Date().toISOString();
    void save({ action: "create", data: { id, name: text(form, "name"), venueId: text(form, "venueId"), recipeId: text(form, "recipeId") || null, itemId: text(form, "itemId") || null,
      method: text(form, "method"), productionDate: text(form, "productionDate"), startedAt: text(form, "startedAt") ? new Date(text(form, "startedAt")).toISOString() : startedAt.current,
      unit: text(form, "unit"), wetGross: number(form, "wetGross"), wetTare: number(form, "wetTare"), inputCost: number(form, "inputCost"), costNotes: text(form, "costNotes"),
      equipment: text(form, "equipment"), temperature: number(form, "temperature"), temperatureUnit: text(form, "temperatureUnit"), humidity: number(form, "humidity"), cycleMinutes: number(form, "cycleMinutes"),
      shelfLife: text(form, "shelfLife"), useBy: text(form, "useBy") || null, allergens: form.getAll("allergen"), notes: text(form, "notes") } });
  }}>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Batch name"><Input aria-label="Batch name" name="name" maxLength={160} required /></Field><Field label="Venue"><Select aria-label="Preservation venue" name="venueId" defaultValue={defaultVenue} required>{venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</Select></Field>
        <Field label="Method"><Select name="method" aria-label="Preservation method">{PRESERVATION_METHODS.map(method => <option key={method}>{method}</option>)}</Select></Field><Field label="Equipment"><Input name="equipment" aria-label="Preservation equipment" maxLength={160} /></Field>
        <Field label="Production date"><Input type="date" name="productionDate" aria-label="Preservation production date" defaultValue={today} required /></Field><Field label="Started at" hint="Device local time. Leave blank to start now."><Input type="datetime-local" name="startedAt" aria-label="Preservation start time" /></Field>
        <Field label="Source recipe (optional)"><Select name="recipeId" aria-label="Preservation source recipe"><option value="">No linked recipe</option>{recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</Select></Field><Field label="Finished catalog ingredient (optional)"><Select name="itemId" aria-label="Finished catalog ingredient"><option value="">No linked ingredient</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      </div>
      <p className="text-xs text-zinc-500">Source and finished ingredient allergen tags are captured when the batch starts. Add any additional tags below. Input cost is entered from your reviewed batch costing.</p>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Weight unit"><Select name="unit" aria-label="Preservation weight unit"><option>kg</option><option>lb</option><option>gram</option><option>oz</option></Select></Field><Field label="Initial gross weight"><Input aria-label="Initial gross weight" name="wetGross" type="number" min="0" max="100000000" step="any" required /></Field><Field label="Initial tare weight"><Input aria-label="Initial tare weight" name="wetTare" type="number" min="0" max="100000000" step="any" defaultValue="0" required /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Reviewed total input cost ($)"><Input name="inputCost" aria-label="Preservation input cost" type="number" min="0" max="100000000" step="any" required /></Field><Field label="Cost source / reference"><Input name="costNotes" aria-label="Preservation cost source" maxLength={1000} placeholder="Ingredient costs, quantities and source document" required /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Temperature"><Input name="temperature" aria-label="Preservation temperature" type="number" min="-150" max="1000" step="any" /></Field><Field label="Temperature unit"><Select name="temperatureUnit" aria-label="Preservation temperature unit"><option>F</option><option>C</option></Select></Field><Field label="Humidity (%)"><Input name="humidity" aria-label="Preservation humidity" type="number" min="0" max="100" step="any" /></Field><Field label="Planned cycle (minutes)"><Input name="cycleMinutes" aria-label="Preservation cycle minutes" type="number" min="0" max="525600" /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Assigned use-by date"><Input name="useBy" aria-label="Preservation use-by date" type="date" /></Field><Field label="Shelf-life / storage instruction"><Input name="shelfLife" aria-label="Preservation shelf life" maxLength={300} /></Field></div>
      <details><summary className="cursor-pointer text-sm">Additional allergen tags</summary><div className="mt-3"><AllergenPicker selected={[]} /></div></details>
      <Field label="Batch notes"><Textarea name="notes" aria-label="Preservation notes" maxLength={5000} /></Field>
      <Button disabled={busy || !venues.length}>{busy ? "Creating…" : "Start preservation batch"}</Button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </form>;
}
export function PreservationFinishForm({ id, revision, unit }: { id: string; revision: number; unit: string }) {
  const { busy, error, save, markDirty } = useSave(), finishedAt = useRef<string | null>(null);
  return <form aria-label="Finish preservation batch" className="space-y-4" onChange={markDirty} onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (!finishedAt.current) finishedAt.current = new Date().toISOString();
    void save({ action: "finish", id, revision, data: { gross: number(form, "gross"), tare: number(form, "tare"), finishedAt: text(form, "finishedAt") ? new Date(text(form, "finishedAt")).toISOString() : finishedAt.current, notes: text(form, "notes") } });
  }}><fieldset disabled={busy} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label={`Finished gross (${unit})`}><Input name="gross" aria-label="Finished gross weight" type="number" min="0" max="100000000" step="any" required /></Field><Field label={`Finished tare (${unit})`}><Input name="tare" aria-label="Finished tare weight" type="number" min="0" max="100000000" step="any" defaultValue="0" required /></Field></div>
    <Field label="Finished at" hint="Device local time. Blank uses now."><Input name="finishedAt" aria-label="Preservation finish time" type="datetime-local" /></Field><Field label="Finish notes" hint="Explain any weight gain."><Textarea name="notes" aria-label="Preservation finish notes" maxLength={5000} /></Field><Button disabled={busy}>{busy ? "Saving…" : "Save finished yield"}</Button></fieldset>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</form>;
}
export function PreservationPostButton({ id, revision, expectedCost, expectedUnit, cost }: { id: string; revision: number; expectedCost: number; expectedUnit: string; cost: number }) {
  const { busy, error, save } = useSave();
  return <div className="space-y-3"><p className="text-sm">Catalog: <span className="tabular-nums">{money(expectedCost, 5)} → {money(cost, 5)} / {expectedUnit}</span></p><Button disabled={busy} onClick={() => { void save({ action: "post", id, revision, expectedCost, expectedUnit }); }}>{busy ? "Applying…" : "Apply finished cost to catalog"}</Button>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</div>;
}
export function PreservationVoidForm({ id, revision }: { id: string; revision: number }) {
  const { busy, error, save, markDirty } = useSave();
  return <form className="space-y-3" aria-label="Void preservation batch" onChange={markDirty} onSubmit={event => { event.preventDefault(); void save({ action: "void", id, revision, reason: text(new FormData(event.currentTarget), "reason") }); }}><Field label="Reason"><Input name="reason" aria-label="Preservation void reason" required maxLength={1000} disabled={busy} /></Field><Button variant="danger" disabled={busy}>{busy ? "Voiding…" : "Void batch"}</Button>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</form>;
}
