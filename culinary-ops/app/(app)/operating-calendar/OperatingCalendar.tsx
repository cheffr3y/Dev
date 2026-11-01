"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, StatCard } from "@/components/ui";
import { money, pct } from "@/lib/recipes/costing";
import { buildOperatingMonth, type OperatingDayData, type FoodExpenseData } from "@/lib/accounting/operating-calendar";
import { FoodExpenseForm, OperatingDayForm, type InvoiceChoice } from "@/components/OperatingEntryForms";
const amount = (cents: number | null) => cents == null ? "—" : money(cents / 100);
const shortAmount = (cents: number | null) => cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
export function OperatingCalendar({ month, venueId, venues, entries, expenses, invoices, today, initialDay }: {
  month: string; venueId: string; venues: { id: string; name: string }[]; entries: OperatingDayData[]; expenses: FoodExpenseData[]; invoices: InvoiceChoice[]; today: string; initialDay?: string;
}) {
  const model = buildOperatingMonth(month, entries, expenses, today);
  const [date, setDate] = useState(initialDay && model.days.some(day => day.date === initialDay) ? initialDay : today.startsWith(month) ? today : `${month}-01`);
  const [tab, setTab] = useState<"totals" | "food">("totals"), [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [adding, setAdding] = useState(false), [newKey, setNewKey] = useState(0), [saved, setSaved] = useState("");
  const selected = model.days.find(day => day.date === date) ?? model.days[0];
  const selectedExpenses = expenses.filter(expense => expense.invoiceDate === selected.date);
  function mayLeave() { return !dirty || window.confirm("Discard the unsaved entry?"); }
  function select(next: string) {
    if (next === date || !mayLeave()) return;
    setDate(next); setDirty(false); setEditing(null); setAdding(false); setSaved("");
    const url = new URL(window.location.href); url.searchParams.set("day", next); window.history.replaceState(null, "", url);
  }
  function changeTab(next: "totals" | "food") { if (tab === next || !mayLeave()) return; setTab(next); setDirty(false); setEditing(null); setAdding(false); setSaved(""); }
  function foodSaved() { setDirty(false); setEditing(null); setAdding(false); setNewKey(key => key + 1); setSaved("Food spending saved. Review the daily totals when all invoices are entered."); }
  return <>
    <div className="mb-3 grid gap-3 sm:grid-cols-3">
      <StatCard label="Gross sales" value={amount(model.totals.grossSalesCents)} sub="Recorded sales this month" />
      <StatCard label="Labor" value={amount(model.totals.laborCents)} sub={`${pct(model.totals.laborRate)} of recorded gross sales`} />
      <StatCard label="Food purchases" value={amount(model.totals.foodCents)} sub={`${pct(model.totals.foodRate)} of recorded gross sales`} />
    </div>
    <p className="mb-5 text-xs text-zinc-500">{model.totals.provisional ? "Provisional totals" : "Daily entries complete"} · {model.totals.completeCount} / {model.totals.elapsedCount} elapsed days complete. Missing amounts stay blank. Food purchases are spending, before inventory adjustments.</p>
    <div className="operating-workspace">
      <section aria-label={`${model.label} financial calendar`} className="min-w-0">
        <div className="operating-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="operating-grid">
          {Array.from({ length: model.offset }, (_, index) => <div key={`blank-${index}`} className="operating-empty" aria-hidden="true" />)}
          {model.days.map(day => <button key={day.date} type="button" className={`operating-day ${day.future ? "is-future" : ""}`} aria-pressed={selected.date === day.date} aria-label={`${day.date}: Gross sales ${amount(day.grossSalesCents)}, labor ${amount(day.laborCents)}, food purchases ${amount(day.foodCents)}. ${day.complete ? "Complete" : day.hasData ? "Incomplete" : "No entries"}`} onClick={() => select(day.date)}>
            <span className="operating-day-heading"><span>{day.day}{day.date === today && <span className="operating-today">Today</span>}</span><span className={`operating-dot ${day.complete ? "complete" : day.hasData ? "pending" : ""}`} aria-hidden="true" /></span>
            <span className="operating-cell-values"><span><span>Sales</span><strong>{amount(day.grossSalesCents)}</strong></span><span><span>Labor</span><strong>{amount(day.laborCents)}</strong></span><span><span>Food</span><strong>{amount(day.foodCents)}</strong></span></span>
            <span className="operating-cell-rates">L {pct(day.laborRate)} · F {pct(day.foodRate)}</span>
            <span className="operating-cell-compact">{shortAmount(day.grossSalesCents)}</span>
          </button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500"><span><span className="operating-dot complete mr-1 inline-block" /> Complete daily entry</span><span><span className="operating-dot pending mr-1 inline-block" /> Needs review / missing entries</span><span>L = labor % · F = food purchases % · Gross-sales basis</span></div>
      </section>
      <Card className="operating-detail min-w-0 p-4">
        <h2 className="text-lg font-semibold">{new Date(`${selected.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</h2>
        <p className="mt-1 text-xs text-zinc-500">{selected.complete ? "Complete" : "Needs entries / food review"}{dirty ? " · Unsaved changes" : ""}</p>
        <div className="my-3 grid grid-cols-3 gap-2 text-xs"><div>Sales<strong className="mt-1 block tabular-nums">{amount(selected.grossSalesCents)}</strong></div><div>Labor<strong className="mt-1 block tabular-nums">{amount(selected.laborCents)}</strong><span>{pct(selected.laborRate)}</span></div><div>Food<strong className="mt-1 block tabular-nums">{amount(selected.foodCents)}</strong><span>{pct(selected.foodRate)}</span></div></div>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Daily entry view"><Button type="button" variant={tab === "totals" ? "primary" : "secondary"} aria-pressed={tab === "totals"} onClick={() => changeTab("totals")}>Sales & labor</Button><Button type="button" variant={tab === "food" ? "primary" : "secondary"} aria-pressed={tab === "food"} onClick={() => changeTab("food")}>Food spending ({selected.food.length})</Button></div>
        {saved && <p role="status" className="mb-3 text-sm">{saved}</p>}
        {tab === "totals" ? <OperatingDayForm key={`${selected.date}:${selected.entry?.revision ?? "new"}`} venueId={venueId} date={selected.date} entry={selected.entry} onDirty={setDirty} onSaved={() => setSaved("Daily entry saved.")} /> : <>
          <div className="mb-4 space-y-3">{selectedExpenses.map(expense => <div key={expense.id} className="border-b border-hairline pb-3 text-sm"><p className={expense.voided ? "line-through text-zinc-500" : "font-semibold"}>{expense.description} · {money(expense.amountCents / 100)}</p>{expense.invoiceReviewPending && <p className="text-xs text-amber-700">Invoice total needs reconfirmation.</p>}{expense.voided && <p className="text-xs">Voided · excluded from totals</p>}{expense.invoice && <p className="mt-1 text-xs text-zinc-500">{[expense.invoice.vendor, expense.invoice.invoiceNumber].filter(Boolean).join(" · ") || expense.invoice.filename}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">{expense.invoiceDocumentId && <Link className="text-gold underline" href={`/vendors/invoices?id=${expense.invoiceDocumentId}`}>Invoice</Link>}<button type="button" className="text-gold underline" onClick={() => { if (mayLeave()) { setEditing(expense.id); setAdding(false); setDirty(false); } }}>Edit / history</button></div></div>)}
            {!selectedExpenses.length && <p className="text-sm text-zinc-500">No food invoices or purchases recorded for this day.</p>}
          </div>
          {!adding && !editing && <Button type="button" onClick={() => { setAdding(true); setNewKey(key => key + 1); }}>Add food purchase / credit</Button>}
          {(adding || editing) && <FoodExpenseForm key={`${editing ?? `new-${newKey}`}:${expenses.find(e => e.id === editing)?.revision ?? "new"}`} expense={expenses.find(e => e.id === editing)} invoices={invoices} venues={venues} initialVenueId={venueId} initialDate={selected.date} onDirty={setDirty} onSaved={foodSaved} onCancel={() => { if (mayLeave()) { setAdding(false); setEditing(null); setDirty(false); } }} />}
        </>}
      </Card>
    </div>
  </>;
}
