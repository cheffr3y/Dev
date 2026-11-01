"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea } from "./ui";
import { money } from "@/lib/recipes/costing";
import type { FoodExpenseData, OperatingDayData, OperatingEdit } from "@/lib/accounting/operating-calendar";
import type { OperatingSaveResult } from "@/lib/accounting/operating-calendar-data";

const inputDollars = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);
async function save(input: OperatingEdit) {
  const response = await fetch("/api/operating-calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json() as OperatingSaveResult;
  if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error : "Unable to save this entry.");
  return result;
}
function useDraft(onDirty?: (dirty: boolean) => void) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (value: boolean) => { setDirty(value); onDirty?.(value); };
}
export function OperatingHistory({ history }: { history: unknown }) {
  if (!Array.isArray(history) || !history.length) return null;
  const labels: Record<string, string> = { grossSalesCents: "Gross sales", laborCents: "Labor", foodReviewed: "Food reviewed", notes: "Notes", amountCents: "Food amount", invoiceDate: "Invoice date", description: "Description", voided: "Voided", quantity: "Quantity billed", purchaseUnit: "Billed unit", packQty: "Contents per billed unit", packUnit: "Content unit", normalizedUnitCost: "Paid unit price", normalizedUnit: "Price unit", countsAsFood: "Counts as food", itemName: "Matched ingredient" };
  const display = (key: string, value: unknown) => value == null ? "Not entered" : key === "normalizedUnitCost" && typeof value === "number" ? money(value, 5) : key.endsWith("Cents") && typeof value === "number" ? money(value / 100) : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
  return <details className="mt-4 border-t border-hairline pt-3 text-xs"><summary className="cursor-pointer font-semibold">Change history ({history.length})</summary><ol className="mt-3 space-y-3">{[...history].reverse().map((raw, index) => {
    const item = raw as { at: string; userName?: string; reason: string; before: Record<string, unknown> | null; after: Record<string, unknown> };
    return <li key={index} className="border-b border-hairline pb-2"><p>{new Date(item.at).toLocaleString("en-US", { timeZone: "America/Chicago" })}{item.userName ? ` · ${item.userName}` : ""}</p><p className="mt-1 font-semibold">{item.reason}</p>
      {Object.entries(labels).filter(([key]) => key in item.after && (!item.before || item.before[key] !== item.after[key])).map(([key, label]) => <p key={key} className="mt-1 break-words">{label}: {display(key, item.before?.[key])} → {display(key, item.after[key])}</p>)}
    </li>;
  })}</ol></details>;
}
export function OperatingDayForm({ venueId, date, entry, onDirty, onSaved }: { venueId: string; date: string; entry: OperatingDayData | null; onDirty?: (dirty: boolean) => void; onSaved?: () => void }) {
  const router = useRouter(), draft = useDraft(onDirty);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <form aria-label={`Daily entry for ${date}`} className="space-y-3" onChange={() => draft(true)} onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      await save({ kind: "day", venueId, date, revision: entry?.revision ?? null, grossSales: String(form.get("grossSales") ?? ""), labor: String(form.get("labor") ?? ""), foodReviewed: form.get("foodReviewed") === "on", notes: String(form.get("notes") ?? ""), reason: String(form.get("reason") ?? "") });
      draft(false); setMessage("Daily entry saved."); onSaved?.(); router.refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">Gross sales ($)<Input aria-label="Gross sales ($)" name="grossSales" type="number" min="0" max="20000000" step="0.01" defaultValue={inputDollars(entry?.grossSalesCents)} placeholder="Not entered" /><span className="mt-1 block text-xs text-zinc-500">Use gross sales as reported by your POS.</span></label>
      <label className="block text-sm">Actual labor cost ($)<Input name="labor" type="number" min="0" max="20000000" step="0.01" defaultValue={inputDollars(entry?.laborCents)} placeholder="Not entered" /></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1 h-4 w-4" name="foodReviewed" type="checkbox" defaultChecked={entry?.foodReviewed ?? false} /><span>Food entries reviewed for this day<span className="mt-1 block text-xs text-zinc-500">Check after all invoices and credits are recorded. With no food entries, this records $0 food spending.</span></span></label>
      <label className="block text-sm">Daily notes<Textarea name="notes" maxLength={5000} rows={2} defaultValue={entry?.notes ?? ""} /></label>
      {entry && <label className="block text-sm">Correction / review reason<Input name="reason" maxLength={1000} placeholder="Explain changes or confirm food review" /></label>}
      <Button type="submit">{busy ? "Saving…" : "Save daily entry"}</Button>
    </fieldset>
    {message && <p role="status" className="text-sm">{message}</p>}
    <OperatingHistory history={entry?.history} />
  </form>;
}
export type InvoiceChoice = { id: string; filename: string; vendor: string | null; invoiceNumber: string | null };
export function FoodExpenseForm({ expense, invoice, invoices = [], venues, initialVenueId, initialDate = "", initialAmount, invoiceLineRevision = null, onDirty, onSaved, onCancel }: {
  expense?: FoodExpenseData | null; invoice?: InvoiceChoice; invoices?: InvoiceChoice[]; venues: { id: string; name: string }[];
  initialVenueId?: string; initialDate?: string; initialAmount?: number; invoiceLineRevision?: number | null; onDirty?: (dirty: boolean) => void; onSaved?: () => void; onCancel?: () => void;
}) {
  const [id] = useState(() => expense?.id ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter(), draft = useDraft(onDirty);
  const linkedId = expense?.invoiceDocumentId || invoice?.id || null;
  return <form aria-label="Food spending entry" className="space-y-3" onChange={() => draft(true)} onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      await save({ kind: "expense", id, revision: expense?.revision ?? null, venueId: String(form.get("venueId")), invoiceDate: String(form.get("invoiceDate")), amount: String(form.get("amount")), description: String(form.get("description")), invoiceDocumentId: linkedId || String(form.get("invoiceDocumentId") ?? "") || null, invoiceLineRevision, voided: form.get("voided") === "on", reason: String(form.get("reason") ?? "") });
      draft(false); setMessage("Food spending saved."); onSaved?.(); router.refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">Venue<Select name="venueId" required defaultValue={invoiceLineRevision != null ? initialVenueId : expense?.venueId || initialVenueId || ""}><option value="">Choose venue</option>{venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</Select></label>
      <label className="block text-sm">Invoice date<Input aria-label="Invoice date" name="invoiceDate" type="date" required min="1900-01-01" max="2100-12-31" defaultValue={invoiceLineRevision != null ? initialDate : expense?.invoiceDate || initialDate} /><span className="mt-1 block text-xs text-zinc-500">Use the date printed on the invoice or credit.</span></label>
      <label className="block text-sm">Food amount ($)<Input aria-label="Food amount ($)" name="amount" required type="number" step="0.01" min="-20000000" max="20000000" readOnly={invoiceLineRevision != null} defaultValue={inputDollars(invoiceLineRevision != null ? initialAmount : expense?.amountCents ?? initialAmount)} /><span className="mt-1 block text-xs text-zinc-500">Enter the food portion you want tracked. Use a negative amount for a credit.</span></label>
      <label className="block text-sm">Description<Input name="description" required maxLength={500} defaultValue={expense?.description || [invoice?.vendor, invoice?.invoiceNumber].filter(Boolean).join(" · ")} placeholder="Vendor / invoice or purchase note" /></label>
      {linkedId ? <p className="text-sm"><Link className="text-gold underline" href={`/vendors/invoices?id=${encodeURIComponent(linkedId)}`}>View linked invoice</Link></p>
        : <label className="block text-sm">Stored invoice (optional)<Select name="invoiceDocumentId" defaultValue=""><option value="">Manual entry / no document yet</option>{invoices.map(doc => <option key={doc.id} value={doc.id}>{doc.vendor ? `${doc.vendor} · ` : ""}{doc.invoiceNumber || doc.filename}</option>)}</Select></label>}
      {expense && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="voided" defaultChecked={expense.voided} /> Void this spending entry</label><label className="block text-sm">Correction / void reason<Input name="reason" maxLength={1000} placeholder="Explain the correction" /></label></>}
      <div className="flex flex-wrap gap-2"><Button type="submit">{busy ? "Saving…" : expense ? "Save food correction" : "Record food spending"}</Button>{onCancel && <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>}</div>
    </fieldset>
    {expense?.invoiceReviewPending && <p className="text-sm text-amber-700">Invoice lines changed. Review the invoice line total before confirming this day.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <OperatingHistory history={expense?.history} />
  </form>;
}
