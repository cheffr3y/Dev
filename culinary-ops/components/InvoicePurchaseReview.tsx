"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "./ui";
import { ComboPicker, type ComboOption } from "./ComboPicker";
import { FoodExpenseForm, OperatingHistory, type InvoiceChoice } from "./OperatingEntryForms";
import { money, preciseNum } from "@/lib/costing";
import type { InvoicePurchaseData, InvoicePurchaseInput } from "@/lib/invoice-purchases";
import type { FoodExpenseData } from "@/lib/operating-calendar";
import type { OperatingSaveResult } from "@/lib/operating-calendar-data";

function PurchaseLineForm({ invoiceId, vendorId, vendors, venues, items, line, defaults, done, dirty }: {
  invoiceId: string; vendorId: string | null; vendors: { id: string; name: string }[]; venues: { id: string; name: string }[]; items: ComboOption[];
  line?: InvoicePurchaseData; defaults?: { date: string; venueId: string; vendorId?: string }; done: () => void; dirty: (value: boolean) => void;
}) {
  const [id] = useState(() => line?.id ?? crypto.randomUUID()), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter();
  return <form aria-label="Invoice line entry" className="mt-4 space-y-3 border-t border-hairline pt-4" onChange={() => dirty(true)} onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    const input: InvoicePurchaseInput = { id, invoiceDocumentId: invoiceId, revision: line?.revision ?? null, itemId: String(form.get("itemId") || "") || null,
      venueId: String(form.get("venueId")), vendorId: String(form.get("vendorId")), invoiceDate: String(form.get("invoiceDate")), description: String(form.get("description")),
      amount: String(form.get("amount")), quantity: Number(form.get("quantity")), purchaseUnit: String(form.get("purchaseUnit")), packQty: Number(form.get("packQty")), packUnit: String(form.get("packUnit")), countsAsFood: form.get("countsAsFood") === "on", voided: form.get("voided") === "on", reason: String(form.get("reason") ?? "") };
    try {
      const response = await fetch("/api/invoice-purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json() as OperatingSaveResult;
      if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error : "Could not save line.");
      dirty(false); done(); router.refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-3">
    <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Invoice date<Input name="invoiceDate" type="date" required defaultValue={line?.invoiceDate || defaults?.date || ""} /></label><label className="text-sm">Venue<Select name="venueId" required defaultValue={line?.venueId || defaults?.venueId || ""}><option value="">Choose venue</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label><label className="text-sm">Supplier<Select name="vendorId" required defaultValue={vendorId || line?.vendorId || defaults?.vendorId || ""}>{!vendorId && <option value="">Choose invoice supplier</option>}{vendors.filter(v => !vendorId || v.id === vendorId).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label></div>
    <label className="block text-sm">Invoice line description<Input name="description" required maxLength={500} defaultValue={line?.description || ""} /></label>
    <div className="text-sm">Match ingredient<ComboPicker ariaLabel="Match invoice ingredient" name="itemId" options={items} defaultId={line?.itemId ?? ""} placeholder="Search ingredient name, vendor code or GCODE" onSelect={() => dirty(true)} /><p className="mt-1 text-xs text-zinc-500">Leave unmatched if still researching. Its food amount can be counted, but it has no ingredient price history until matched.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><label className="text-sm">Quantity billed<Input name="quantity" required type="number" min="0.000001" step="any" defaultValue={line?.quantity ?? ""} /></label><label className="text-sm">Billed unit<Input name="purchaseUnit" required maxLength={40} placeholder="case / bag / lb" defaultValue={line?.purchaseUnit || ""} /></label><label className="text-sm">Contents per billed unit<Input name="packQty" required type="number" min="0.000001" step="any" defaultValue={line?.packQty ?? ""} /></label><label className="text-sm">Content unit<Input name="packUnit" required maxLength={40} placeholder="lb / oz / each" defaultValue={line?.packUnit || ""} /></label><label className="text-sm">Paid line total ($)<Input name="amount" required type="number" step="0.01" defaultValue={line ? (line.amountCents / 100).toFixed(2) : ""} /></label></div>
    <p className="text-xs text-zinc-500">Example: 2 cases × 10 lb per case, paid $60 = $3/lb. For 12 lb billed by the pound, use quantity 12 and contents 1 lb. Use the actual paid amount after line discounts; negative amounts are credits.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="countsAsFood" defaultChecked={line?.countsAsFood ?? true} /> Include this line in food spending</label>
    {line && <><label className="flex items-center gap-2 text-sm"><input name="voided" type="checkbox" defaultChecked={line.voided} /> Void this line</label><label className="block text-sm">Correction reason<Input name="reason" maxLength={1000} /></label></>}
    <Button>{busy ? "Saving…" : "Save invoice line"}</Button>
  </fieldset>{message && <p role="status" className="text-sm">{message}</p>}<OperatingHistory history={line?.history} /></form>;
}
export function InvoicePurchaseReview({ invoice, vendorId, lineRevision, lines, expense, vendors, venues, items }: {
  invoice: InvoiceChoice; vendorId: string | null; lineRevision: number; lines: InvoicePurchaseData[]; expense: FoodExpenseData | null;
  vendors: { id: string; name: string }[]; venues: { id: string; name: string }[]; items: ComboOption[];
}) {
  const [editing, setEditing] = useState<string | null>(null), [adding, setAdding] = useState(false), [posting, setPosting] = useState(false), [dirty, setDirty] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const active = lines.filter(line => !line.voided), total = active.filter(line => line.countsAsFood).reduce((sum, line) => sum + line.amountCents, 0);
  const defaults = active[0] ? { date: active[0].invoiceDate, venueId: active[0].venueId, vendorId: active[0].vendorId } : expense ? { date: expense.invoiceDate, venueId: expense.venueId } : undefined;
  const pending = expense?.invoiceLineRevision != null && expense.invoiceLineRevision !== lineRevision;
  function switchEditor(edit: string | null, post = false) { if (dirty && !window.confirm("Discard the unsaved invoice entry?")) return; setEditing(edit); setAdding(edit == null && !post); setPosting(post); setDirty(false); setMessage(""); }
  return <Card className="mt-5 p-4"><h2 className="text-lg font-semibold">Invoice lines & ingredient price history</h2><p className="mt-2 text-sm text-zinc-500">Record billed lines and match the ingredient database. Saved observations retain the supplier, invoice date and pack basis. Current catalog prices stay unchanged.</p>
    <div className="mt-4 overflow-x-auto"><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Invoice line</th><th>Ingredient</th><th>Quantity / pack</th><th>Paid total</th><th>Unit price</th><th>Food</th><th /></tr></thead><tbody>{lines.map(line => <tr key={line.id} className={line.voided ? "text-zinc-500 line-through" : ""}><td>{line.description}<span className="block text-xs">{line.invoiceDate}</span></td><td>{line.itemId ? <Link className="text-gold underline" href={`/items/${line.itemId}`}>{line.itemName}</Link> : "Unmatched"}</td><td>{preciseNum(line.quantity)} {line.purchaseUnit} × {preciseNum(line.packQty)} {line.packUnit}</td><td className="tabular-nums">{money(line.amountCents / 100)}</td><td className="tabular-nums">{line.normalizedUnitCost == null ? "Needs matching" : `${money(line.normalizedUnitCost, 5)} / ${line.normalizedUnit}`}</td><td>{line.voided ? "Voided" : line.countsAsFood ? "Included" : "Excluded"}</td><td><button type="button" className="text-gold underline" onClick={() => switchEditor(line.id)}>Edit line</button></td></tr>)}</tbody></table></div>
    {!lines.length && <p className="my-3 text-sm">No line items entered yet.</p>}
    <p className="my-3 font-semibold">Food-line total: {money(total / 100)}{active.some(line => !line.itemId) && <span className="ml-2 text-xs font-normal">Includes unmatched food lines.</span>}</p>
    {expense && <p className="mb-3 text-sm">Calendar currently records {money(expense.amountCents / 100)} on {expense.invoiceDate}{expense.voided ? " (voided)" : ""}. <Link className="text-gold underline" href={`/operating-calendar?${new URLSearchParams({ venue: expense.venueId, month: expense.invoiceDate.slice(0, 7), day: expense.invoiceDate })}`}>Open calendar</Link></p>}
    {pending && <p role="alert" className="mb-3 text-sm text-amber-700">Invoice lines changed. The calendar still uses the last confirmed amount. Reconfirm the food total after reviewing all lines.</p>}
    <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => switchEditor(null)}>Add invoice line</Button>{active.length > 0 && <Button type="button" onClick={() => switchEditor(null, true)}>Use reviewed food-line total</Button>}</div>
    {(adding || editing) && <PurchaseLineForm key={`${editing || "new"}:${lines.find(line => line.id === editing)?.revision ?? lineRevision}`} invoiceId={invoice.id} vendorId={vendorId} vendors={vendors} venues={venues} items={items} line={lines.find(line => line.id === editing)} defaults={defaults} dirty={setDirty} done={() => { setAdding(false); setEditing(null); setMessage("Invoice line saved."); }} />}
    {posting && <div className="mt-4 border-t border-hairline pt-4"><p className="mb-3 text-sm">Confirm after all food and credit lines are entered. Every active line must use the same invoice date and venue.</p><FoodExpenseForm key={`${lineRevision}:${expense?.revision ?? "new"}`} expense={expense} invoice={invoice} venues={venues} initialVenueId={defaults?.venueId} initialDate={defaults?.date} initialAmount={total} invoiceLineRevision={lineRevision} onDirty={setDirty} onSaved={() => { setPosting(false); setDirty(false); setMessage("Reviewed invoice food total saved to calendar."); }} /></div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Card>;
}
