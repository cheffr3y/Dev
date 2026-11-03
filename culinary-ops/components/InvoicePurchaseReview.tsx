"use client";
import { measurementVersion, type IngredientMeasure } from "@/lib/ingredients/measurements";
import { useInvoiceDraft } from "./InvoiceDraftProvider";
import { InvoiceLocalReview } from "./InvoiceLocalReview";
import { normalizedInvoicePrice, invoiceNormalizationMeasure } from "@/lib/invoices/invoice-purchases";
import { priceVariance } from "@/lib/invoices/price-trends";
import { priceJump } from "@/lib/invoices/price-trends";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "./ui";
import { ComboPicker, type ComboOption } from "./ComboPicker";
import { FoodExpenseForm, OperatingHistory, type InvoiceChoice } from "./OperatingEntryForms";
import { money, preciseNum } from "@/lib/recipes/costing";
import type { InvoicePurchaseData, InvoicePurchaseInput } from "@/lib/invoices/invoice-purchases";
import type { FoodExpenseData } from "@/lib/accounting/operating-calendar";
import type { OperatingSaveResult } from "@/lib/accounting/operating-calendar-data";

function PurchaseLineForm({ invoiceId, vendorId, vendors, venues, items, line, defaults, done, dirty, reset }: {
  invoiceId: string; vendorId: string | null; vendors: { id: string; name: string }[]; venues: { id: string; name: string }[]; items: (ComboOption & IngredientMeasure & {unit?:string;unitCost?:number})[];
  line?: InvoicePurchaseData; defaults?: { date: string; venueId: string; vendorId?: string }; done: () => void; dirty: (value: boolean) => void; reset: () => void;
}) {
  const { draft, update: updateDraft, flush: saveDraft } = useInvoiceDraft();
  const draftKey = line ? `${line.id}:${line.revision}` : "new";
  const stored = draft.manual && (draft.manual.key === draftKey || line?.id === draft.manual.id) ? draft.manual : null;
  const expectedRevision = stored ? stored.lineRevision : line?.revision ?? null;
  const value = (name: string, fallback: string | number) => stored?.fields[name] ?? fallback;
  const checked = (name: string, fallback: boolean) => stored ? stored.fields[name] === "on" : fallback;
  const [id] = useState(() => line?.id ?? stored?.id ?? crypto.randomUUID()), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const preview = (() => {
    const fields=stored?.fields;if(!fields)return "";
    if(fields.voided==="on")return "Voiding recomputes the ingredient from its next eligible purchase, while preserving later manual price corrections.";
    if(fields.countsAsFood!=="on"||Number(fields.amount)<0)return "Credits and non-food lines do not establish a new catalog price.";
    const item=items.find(item=>item.id===fields.itemId);if(!item?.unit)return "Choose an ingredient for a normalized price preview.";
    try {const input={itemId:item.id,quantity:Number(fields.quantity),packQty:Number(fields.packQty),packUnit:fields.packUnit||"",eachWeightOz:Number(fields.eachWeightOz)||null};const {measure}=invoiceNormalizationMeasure({...item,unit:item.unit},line,input);const price=normalizedInvoicePrice(Math.round(Number(fields.amount)*100),input.quantity,input.packQty,input.packUnit,item.unit,measure);const delta=priceVariance(item.unitCost??null,price);return `New unit cost: ${money(price,5)} / ${item.unit}${delta==null?"":` (${delta>=0?"+":""}${delta.toFixed(1)}% vs current catalog)`}`;} catch {return "Confirm pack contents and paid amount for a unit-cost preview.";}
  })();
  function capture(form: HTMLFormElement, selected?: string) {
    const fields: Record<string, string> = {};
    for (const [key, entry] of new FormData(form)) if (typeof entry === "string") fields[key] = entry;
    for (const field of Array.from(form.elements)) if (field instanceof HTMLInputElement && field.type === "checkbox" && field.name) fields[field.name] = field.checked ? "on" : "off";
    if (selected !== undefined) fields.itemId = selected;
    updateDraft(previous => ({ ...previous, manual: { key: draftKey, id, lineRevision: expectedRevision, fields } }));
  }


  return <form ref={formRef} aria-label="Invoice line entry" className="mt-4 space-y-3 border-t border-hairline pt-4" onChange={event=>{dirty(true);capture(event.currentTarget);}} onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    const input: InvoicePurchaseInput = { expectedMeasurementVersion:measurementVersion(items.find(item=>item.id===form.get("itemId"))??{}), eachWeightOz:Number(form.get("eachWeightOz"))||null, id, invoiceDocumentId: invoiceId, revision: expectedRevision, itemId: String(form.get("itemId") || "") || null,
      venueId: String(form.get("venueId")), vendorId: String(form.get("vendorId")), invoiceDate: String(form.get("invoiceDate")), description: String(form.get("description")),
      amount: String(form.get("amount")), quantity: Number(form.get("quantity")), purchaseUnit: String(form.get("purchaseUnit")), packQty: Number(form.get("packQty")), packUnit: String(form.get("packUnit")), countsAsFood: form.get("countsAsFood") === "on", voided: form.get("voided") === "on", reason: String(form.get("reason") ?? ""), rawCode: String(form.get("rawCode") ?? "") || null, remember: form.get("remember") === "on" };
    try {
      capture(event.currentTarget); await saveDraft();
      const response = await fetch("/api/invoice-purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json() as OperatingSaveResult;
      if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error : "Could not save line.");
      updateDraft(previous=>({...previous,manual:null,editor:null})); dirty(false); done(); router.refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-3">
    {line && stored && expectedRevision !== line.revision && <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3"><p role="alert" className="text-sm text-amber-700">This line was saved or changed after your draft began. Your entries are kept; load the latest saved line before making a correction.</p><Button type="button" variant="secondary" onClick={reset}>Use latest saved line</Button></div>}
    <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Invoice date<Input name="invoiceDate" type="date" required defaultValue={value("invoiceDate", line?.invoiceDate || defaults?.date || "")} /></label><label className="text-sm">Venue<Select name="venueId" required defaultValue={value("venueId", line?.venueId || defaults?.venueId || "")}><option value="">Choose venue</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label><label className="text-sm">Supplier<Select name="vendorId" required defaultValue={value("vendorId", vendorId || line?.vendorId || defaults?.vendorId || "")}>{!vendorId && <option value="">Choose invoice supplier</option>}{vendors.filter(v => !vendorId || v.id === vendorId).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label></div>
    <label className="block text-sm">Vendor item code<Input name="rawCode" maxLength={100} defaultValue={value("rawCode",line?.rawCode ?? "")} /></label>
    <label className="block text-sm">Invoice line description<Input name="description" required maxLength={500} defaultValue={value("description",line?.description || "")} /></label>
    <div className="text-sm">Match ingredient<ComboPicker ariaLabel="Match invoice ingredient" name="itemId" options={items} defaultId={String(value("itemId",line?.itemId ?? ""))} placeholder="Search ingredient name, vendor code or GCODE" onSelect={choice => {dirty(true);if(formRef.current){capture(formRef.current,choice?.id??"");}}} /><p className="mt-1 text-xs text-zinc-500">Leave unmatched if still researching. Its food amount can be counted, but it has no ingredient price history until matched.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><label className="text-sm">Quantity billed<Input name="quantity" required type="number" min="0.000001" step="any" defaultValue={value("quantity",line?.quantity ?? "")} /></label><label className="text-sm">Billed unit<Input name="purchaseUnit" required maxLength={40} placeholder="case / bag / lb" defaultValue={value("purchaseUnit",line?.purchaseUnit || "")} /></label><label className="text-sm">Contents per billed unit<Input name="packQty" required type="number" min="0.000001" step="any" defaultValue={value("packQty",line?.packQty ?? "")} /></label><label className="text-sm">Content unit<Input name="packUnit" required maxLength={40} placeholder="lb / oz / each" defaultValue={value("packUnit",line?.packUnit || "")} /></label><label className="text-sm">Paid line total ($)<Input name="amount" required type="number" step="0.01" defaultValue={value("amount",line ? (line.amountCents / 100).toFixed(2) : "")} /></label></div>
    <label className="block text-sm">Invoice-specific average purchased weight (oz / each), optional<Input aria-label="Manual invoice each weight" name="eachWeightOz" type="number" min="0.000001" step="any" defaultValue={value("eachWeightOz",line?.eachWeightOz??"")} placeholder="Uses the ingredient default when blank" /></label>
    <p className="text-xs text-zinc-500">Example: 2 cases × 10 lb per case, paid $60 = $3/lb. For 12 lb billed by the pound, use quantity 12 and contents 1 lb. Use the actual paid amount after line discounts; negative amounts are credits.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="countsAsFood" defaultChecked={checked("countsAsFood",line?.countsAsFood ?? true)} /> Include this line in food spending</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" defaultChecked={checked("remember",true)} /> Remember this ingredient mapping for future invoices</label>
    {line && <><label className="flex items-center gap-2 text-sm"><input name="voided" type="checkbox" defaultChecked={checked("voided",line.voided)} /> Void this line</label><label className="block text-sm">Correction reason<Input name="reason" maxLength={1000} defaultValue={value("reason","")} /></label></>}
    {preview && <p className="text-sm tabular-nums">{preview}</p>}
    <Button>{busy ? "Saving…" : "Save invoice line"}</Button>
  </fieldset>{message && <p role="status" className="text-sm">{message}</p>}<OperatingHistory history={line?.history} /></form>;
}
export function InvoicePurchaseReview({ invoice, vendorId, lineRevision, lines, expense, vendors, venues, items }: {
  invoice: InvoiceChoice; vendorId: string | null; lineRevision: number; lines: InvoicePurchaseData[]; expense: FoodExpenseData | null;
  vendors: { id: string; name: string }[]; venues: { id: string; name: string }[]; items: (ComboOption & IngredientMeasure & {unit?:string;unitCost?:number})[];
}) {
  const { draft, update: updateDraft } = useInvoiceDraft();
  const recoveredLine = draft.editor === "new" ? lines.find(line=>line.id===draft.manual?.id) : null;
  const [editing, setEditing] = useState<string | null>(recoveredLine?.id ?? (draft.editor && !["new","posting"].includes(draft.editor) ? draft.editor : null)), [adding, setAdding] = useState(draft.editor === "new" && !recoveredLine), [posting, setPosting] = useState(draft.editor === "posting"), [dirty, setDirty] = useState(!!draft.manual), [message, setMessage] = useState("");

  const [formGeneration, setFormGeneration] = useState(0);
  const active = lines.filter(line => !line.voided), total = active.filter(line => line.countsAsFood).reduce((sum, line) => sum + line.amountCents, 0);
  const defaults = active[0] ? { date: active[0].invoiceDate, venueId: active[0].venueId, vendorId: active[0].vendorId } : expense ? { date: expense.invoiceDate, venueId: expense.venueId } : undefined;
  const pending = expense?.invoiceLineRevision != null && expense.invoiceLineRevision !== lineRevision;
  function switchEditor(edit: string | null, post = false) { if (dirty && !window.confirm("Discard the unsaved invoice entry?")) return; updateDraft(previous=>({...previous,editor:post ? "posting" : edit ?? "new",manual:null})); setFormGeneration(value=>value+1); setEditing(edit); setAdding(edit == null && !post); setPosting(post); setDirty(false); setMessage(""); }
  return <Card className="overflow-hidden p-4"><h2 className="text-lg font-semibold">Review invoice</h2><p className="mt-1 text-sm text-zinc-500">Match each line, check its pack and confirm the paid price.</p>
    {recoveredLine && <p role="status" className="mt-3 text-sm text-emerald-700">This invoice line is already saved. Your draft is retained for review.</p>}
    <InvoiceLocalReview key={invoice.id} invoiceId={invoice.id} vendorId={vendorId} vendors={vendors} venues={venues} defaults={defaults} />
    {pending && <p role="alert" className="mb-3 text-sm text-amber-700">Invoice lines changed. The calendar still uses the last confirmed amount. Reconfirm the food total after reviewing all lines.</p>}
    <details id="invoice-accounting" className="mt-4 border-t border-hairline pt-4" open={adding || !!editing || posting}><summary className="cursor-pointer text-sm font-medium">Saved lines &amp; food spending · {active.length} lines · {money(total / 100)}</summary><div className="mt-4 overflow-x-auto"><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Invoice line</th><th>Ingredient</th><th>Quantity / pack</th><th>Paid total</th><th>Unit price</th><th>Food</th><th /></tr></thead><tbody>{lines.map(line => <tr key={line.id} className={line.voided ? "text-zinc-500 line-through" : ""}><td>{line.description}<span className="block text-xs">{line.invoiceDate}</span></td><td>{line.itemId ? <Link className="text-gold underline" href={`/items/${line.itemId}`}>{line.itemName}</Link> : "Unmatched"}</td><td>{preciseNum(line.quantity)} {line.purchaseUnit} × {preciseNum(line.packQty)} {line.packUnit}</td><td className="tabular-nums">{money(line.amountCents / 100)}</td><td className="tabular-nums">{line.normalizedUnitCost == null ? "Needs matching" : `${money(line.normalizedUnitCost, 5)} / ${line.normalizedUnit}`}{line.priceChange != null && priceJump(line.priceChange, line.varianceThreshold ?? 10) && <span className="mt-1 block" title={`Previous reviewed same-supplier price: ${money(line.previousUnitCost, 5)} / ${line.normalizedUnit}`}><Badge color="amber">Price +{line.priceChange.toFixed(1)}%</Badge></span>}</td><td>{line.voided ? "Voided" : line.countsAsFood ? "Included" : "Excluded"}</td><td><button type="button" className="text-gold underline" onClick={() => switchEditor(line.id)}>Edit line</button></td></tr>)}</tbody></table></div>
    {!lines.length && <p className="my-3 text-sm">No line items entered yet.</p>}
    <p className="my-3 font-semibold">Food-line total: {money(total / 100)}{active.some(line => !line.itemId) && <span className="ml-2 text-xs font-normal">Includes unmatched food lines.</span>}</p>
    {expense && <p className="mb-3 text-sm">Calendar currently records {money(expense.amountCents / 100)} on {expense.invoiceDate}{expense.voided ? " (voided)" : ""}. <Link className="text-gold underline" href={`/operating-calendar?${new URLSearchParams({ venue: expense.venueId, month: expense.invoiceDate.slice(0, 7), day: expense.invoiceDate })}`}>Open calendar</Link></p>}
    <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => switchEditor(null)}>Add invoice line</Button>{active.length > 0 && <Button type="button" onClick={() => switchEditor(null, true)}>Use reviewed food-line total</Button>}</div>
    {(adding || editing) && <PurchaseLineForm key={`${editing || "new"}:${lines.find(line => line.id === editing)?.revision ?? lineRevision}:${formGeneration}`} invoiceId={invoice.id} vendorId={vendorId} vendors={vendors} venues={venues} items={items} line={lines.find(line => line.id === editing)} defaults={defaults} dirty={setDirty} reset={()=>{updateDraft(previous=>({...previous,manual:null,editor:editing}));setDirty(false);setFormGeneration(value=>value+1);}} done={() => { setAdding(false); setEditing(null); setMessage("Invoice line saved."); }} />}
    {posting && <div className="mt-4 border-t border-hairline pt-4"><p className="mb-3 text-sm">Confirm after all food and credit lines are entered. Every active line must use the same invoice date and venue.</p><FoodExpenseForm key={`${lineRevision}:${expense?.revision ?? "new"}`} expense={expense} invoice={invoice} venues={venues} initialVenueId={defaults?.venueId} initialDate={defaults?.date} initialAmount={total} invoiceLineRevision={lineRevision} onDirty={setDirty} onSaved={() => { updateDraft(previous=>({...previous,editor:null})); setPosting(false); setDirty(false); setMessage("Reviewed invoice food total saved to calendar."); }} /></div>}
    </details>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Card>;
}
