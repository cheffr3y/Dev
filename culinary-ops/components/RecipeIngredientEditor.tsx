"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ComboPicker } from "./ComboPicker";
import { AllergenBadges } from "./AllergenBadges";
import { Button, Field, Input, Textarea } from "./ui";
import { money } from "@/lib/costing";
import { updateRecipeIngredient } from "@/app/(app)/recipes/actions";

export type IngredientOption = { id: string; name: string; unit: string; unitCost: number; category: string; sku: string | null; gcode: string | null; allergens: string | null; vendor: { name: string } | null };
export function RecipeIngredientEditor({ recipeId, line, items }: { recipeId: string; line: { id: string; itemId: string; quantity: number; unit: string; note: string | null }; items: IngredientOption[] }) {
  const [picked, setPicked] = useState(items.find(item => item.id === line.itemId) ?? null);
  const [state, action, pending] = useActionState(updateRecipeIngredient, { error: "", saved: false });
  return <details className="mt-2 font-normal"><summary className="cursor-pointer text-xs text-blue-600">Edit ingredient</summary>
    <form action={action} className="mt-3 min-w-64 space-y-3 rounded-lg border border-hairline bg-cream p-3">
      <input type="hidden" name="id" value={line.id} /><input type="hidden" name="recipeId" value={recipeId} />
      <Field label="Ingredient"><ComboPicker name="itemId" defaultId={line.itemId} options={items.map(item => ({ id: item.id, label: item.name, meta: `${money(item.unitCost, 5)} / ${item.unit}`, keywords: `${item.category} ${item.vendor?.name ?? ""} ${item.sku ?? ""} ${item.gcode ?? ""}` }))} onSelect={option => setPicked(items.find(item => item.id === option?.id) ?? null)} /></Field>
      {picked && <div className="space-y-1 text-xs text-zinc-500"><p>{picked.category} · {picked.vendor?.name ?? "No vendor"}</p><p>Item # {picked.sku ?? "—"} · GCODE {picked.gcode ?? "—"}</p><AllergenBadges allergens={picked.allergens} /><Link href={`/items/${picked.id}`} target="_blank" rel="noreferrer" className="inline-block text-blue-600 underline">Full ingredient details ↗</Link></div>}
      <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><Input name="quantity" type="number" step="any" min="0" required defaultValue={line.quantity} /></Field><Field label="Unit"><Input name="unit" required defaultValue={line.unit} /></Field></div>
      <Field label="Prep / note"><Textarea name="note" rows={2} defaultValue={line.note ?? ""} /></Field>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p role="status" className="text-sm text-sage">Ingredient line saved.</p>}
      <Button type="submit" disabled={!picked || pending} variant="secondary">{pending ? "Saving…" : "Save ingredient line"}</Button>
    </form>
  </details>;
}
