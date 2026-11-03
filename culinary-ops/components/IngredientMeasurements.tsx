"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Item } from "@prisma/client";
import type { MeasurementSettings } from "@/lib/ingredients/measurement-data";
import { convertIngredientQty, ingredientPurchaseQuantity } from "@/lib/ingredients/measurements";
import { money, preciseNum } from "@/lib/recipes/costing";
import { Button, Card, Field, Input, Select } from "./ui";

type Preview = { token: string; unitCost: number; unit: string; blocked: boolean; rows: { id: string; name: string; pricePending:boolean; before: number | null; after: number | null; lines: { id: string; quantity: number; unit: string; purchased: number | null }[] }[] };
const optional = (value: string) => value.trim() ? Number(value) : null;
export function IngredientMeasurements({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const [unit, setUnit] = useState(item.unit), [packQty, setPackQty] = useState(item.packQty?.toString() ?? ""), [packUnit, setPackUnit] = useState(item.packUnit ?? (item.packQty ? item.unit : ""));
  const [label, setLabel] = useState(item.eachLabel), [weight, setWeight] = useState(item.eachWeightOz?.toString() ?? ""), [density, setDensity] = useState(item.densityGPerMl?.toString() ?? ""), [yieldValue, setYield] = useState(String(item.yieldFactor * 100));
  const [usable, setUsable] = useState(item.measurementReviewedAt ? item.usableCosting : true), [confirmed, setConfirmed] = useState(false), [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const operation = useRef<string | null>(null), router = useRouter();
  const settings: MeasurementSettings = { unit, packQty: optional(packQty), packUnit: packUnit.trim() || null, eachLabel: label, eachWeightOz: optional(weight), densityGPerMl: optional(density), yieldFactor: Number(yieldValue) / 100, usableCosting: usable };
  const proposed = { ...item, ...settings };
  const purchased = convertIngredientQty(3, "each", "oz", proposed);
  const rawForNine = ingredientPurchaseQuantity(9, "oz", proposed);
  function changed() { setPreview(null); setConfirmed(false); setMessage(""); operation.current = null; }
  async function request(action: "preview" | "apply") {
    setBusy(true); setMessage("");
    if(action==="preview"){setPreview(null);setConfirmed(false);operation.current=null;}
    try {
      if (action === "apply" && !operation.current) operation.current = crypto.randomUUID();
      const response = await fetch("/api/ingredient-measurements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: item.id, settings, ...(action === "apply" ? { token: preview?.token, operationId: operation.current, confirmedBasis: confirmed } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "preview") setPreview(result);
      else { setPreview(null); setConfirmed(false); setMessage("Measurements applied. Current recipe costs and purchasing use the reviewed basis."); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this review. Retry the same change."); } finally { setBusy(false); }
  }
  return <Card id="ingredient-measurements" className="space-y-4 p-5" aria-label="Ingredient conversions and yield">
    <div><h2 className="text-lg font-semibold">Purchase → prep → recipe</h2><p className="mt-1 text-sm text-zinc-500">{item.measurementReviewedAt ? "Reviewed measurement basis" : "Legacy costing · review before enabling usable quantities"}. Average weight is purchased weight; trim yield is a separate step.</p></div>
    <fieldset disabled={!canEdit || busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onChange={changed}>
      <Field label="Catalog cost unit"><Input aria-label="Reviewed cost unit" value={unit} onChange={event=>setUnit(event.target.value)} /></Field>
      <Field label="Each means"><Input aria-label="Each label" value={label} placeholder="head" onChange={event=>setLabel(event.target.value)} /></Field>
      <Field label="Average purchased weight (oz / each)"><Input aria-label="Average purchased weight" type="number" min="0.000001" step="any" value={weight} onChange={event=>setWeight(event.target.value)} placeholder="20" /></Field>
      <Field label="Usable yield (%)"><Input aria-label="Reviewed usable yield" type="number" min="0.0001" max="100" step="any" value={yieldValue} onChange={event=>setYield(event.target.value)} /></Field>
      <Field label="Purchasing pack quantity"><Input aria-label="Reviewed pack quantity" type="number" min="0.000001" step="any" value={packQty} onChange={event=>setPackQty(event.target.value)} /></Field>
      <Field label="Purchasing pack unit"><Input aria-label="Reviewed pack unit" value={packUnit} onChange={event=>setPackUnit(event.target.value)} placeholder="each / lb" /></Field>
      <Field label="Recipe quantities represent"><Select aria-label="Recipe ingredient basis" value={usable ? "usable" : "purchased"} onChange={event=>setUsable(event.target.value==="usable")}><option value="usable">Usable / prepped ingredient</option><option value="purchased">Purchased ingredient (before trim)</option></Select></Field>
      <Field label="Density (g / mL), optional" hint="Only enter a product-specific measured or trusted value."><Input aria-label="Ingredient density" type="number" min="0.000001" step="any" value={density} onChange={event=>setDensity(event.target.value)} /></Field>
    </fieldset>
    <div className="rounded-lg bg-stone p-4 text-sm" aria-live="polite">{purchased != null ? <p>3 {label || "each"} → <strong>{preciseNum(purchased)} oz purchased</strong>{Number(yieldValue)>0 && Number(yieldValue)<=100 ? <> → <strong>{preciseNum(purchased * Number(yieldValue) / 100)} oz usable</strong></> : null}</p> : <p>Enter an average purchased weight to connect each quantities to ounces.</p>}{rawForNine != null && <p className="mt-1">9 oz {usable ? "usable" : "purchased"} requires {preciseNum(rawForNine)} {unit} purchased.</p>}</div>
    <p className="text-xs text-zinc-500">Usable yield covers preparation loss for this purchased ingredient. Keep recipe cooking yield and smoking/preservation losses in their own batch records. Counts refer to whole purchased items; trim applies to weight and volume. Purchasing rounds after combining demand; recipe costing uses only the quantity consumed.</p>
    {canEdit && <Button type="button" disabled={busy} onClick={()=>void request("preview")}>{busy ? "Working…" : "Preview recipe cost impact"}</Button>}
    {preview && <div className="space-y-3 border-t border-hairline pt-4"><p className="font-medium">Proposed catalog rate: {preview.unitCost>0 ? money(preview.unitCost,5) : "Price pending"} / {preview.unit}</p><h3 className="font-medium">Review {preview.rows.length} affected recipes</h3><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Recipe</th><th>Current estimate</th><th>Proposed estimate</th><th>Ingredient quantities</th></tr></thead><tbody>{preview.rows.map(row=><tr className="border-t border-hairline" key={row.id}><td className="py-2"><Link className="text-blue-600 underline" href={`/recipes/${row.id}`}>{row.name}</Link></td><td>{money(row.before)}</td><td>{money(row.after)}{row.pricePending && <span className="block text-xs text-amber-700">Ingredient prices pending</span>}</td><td>{row.lines.map(line=><p key={line.id}>{preciseNum(line.quantity)} {line.unit} → {line.purchased == null ? "Conversion needs review" : `${preciseNum(line.purchased)} ${preview.unit} purchased`}</p>)}</td></tr>)}</tbody></table></div>{preview.blocked && <p role="alert" className="text-sm text-amber-700">Some costs or conversions are unknown. Resolve these before applying.</p>}<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)} /> I reviewed every affected recipe and confirmed its quantities use the selected purchased/usable basis.</label><Button type="button" disabled={busy || !confirmed || preview.blocked} onClick={()=>void request("apply")}>Apply reviewed measurements</Button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </Card>;
}
