"use client";

import { useEffect, useState, useTransition } from "react";
import { BanquetSetupSheet, type SetupEvent } from "@/components/BanquetSetupSheet";
import { aggregateSetup, CATEGORY_LABELS, RESOURCE_OPTIONS, resolveSetup, retainPacking, type BanquetSetup, type SetupMenuItem, type SetupResource, type SetupStation } from "@/lib/banquet-setup";
import { saveBanquetSetup, setBanquetPullPacked } from "../../setup-actions";

const inputClass = "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm";
const buttonClass = "rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50";
function newId() { return crypto.randomUUID(); }
function move<T>(items: T[], index: number, offset: number): T[] {
  const result = [...items];
  const target = index + offset;
  if (target < 0 || target >= result.length) return result;
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
function ResourceEditor({ resources, change }: { resources: SetupResource[]; change: (rows: SetupResource[]) => void }) {
  function update(index: number, patch: Partial<SetupResource>) {
    change(resources.map((r, i) => i === index ? { ...r, ...patch } : r));
  }
  return <div className="space-y-2">
    {resources.map((r, index) => <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_2rem] gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_2rem]">
      <select aria-label="Pull category" className={`${inputClass} col-span-3 sm:col-span-1`} value={r.category} onChange={e => update(index, { category: e.target.value as SetupResource["category"] })}>
        <option value="vessel">Vessel</option><option value="equipment">Equipment</option><option value="utensil">Utensil</option>
      </select>
      <input aria-label="Pull item name" className={inputClass} list={`setup-${r.category}`} placeholder="Select or type a name" value={r.name} onChange={e => update(index, { name: e.target.value })} />
      <input aria-label="Pull quantity" className={inputClass} type="number" min={1} max={9999} step={1} value={r.qty || ""} onChange={e => update(index, { qty: Number(e.target.value) })} />
      <button type="button" aria-label={`Remove ${r.name || "pull item"}`} className="text-zinc-500 hover:text-red-700" onClick={() => change(resources.filter((_, i) => i !== index))}>×</button>
    </div>)}
    <button type="button" className="text-sm font-medium text-[#495641] underline" onClick={() => change([...resources, { id: newId(), category: "vessel", name: "", qty: 1 }])}>+ Add pull item</button>
  </div>;
}

export function SetupEditor({ id, initialPlan, initialRevision, menu, event, canEdit }: {
  id: string; initialPlan: BanquetSetup; initialRevision: number; menu: SetupMenuItem[]; event: SetupEvent; canEdit: boolean;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [saved, setSaved] = useState(initialPlan);
  const [revision, setRevision] = useState(initialRevision);
  const [mode, setMode] = useState<"edit" | "pack" | "preview">(canEdit ? "edit" : "pack");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);
  const displayed = resolveSetup(retainPacking(plan, saved), menu);
  const pulls = aggregateSetup(displayed);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(next: BanquetSetup) { setPlan(next); setMessage(""); }
  function updateStation(index: number, patch: Partial<SetupStation>) {
    change({ ...plan, stations: plan.stations.map((s, i) => index === i ? { ...s, ...patch } : s) });
  }
  function addStation(importMenu = false) {
    const assigned = new Set(plan.stations.flatMap(s => s.items.map(i => i.menuItemId)));
    const items = importMenu ? menu.filter(m => !assigned.has(m.id)).map(m => ({
      id: newId(), menuItemId: m.id, food: m.name, notes: "", resources: [],
    })) : [];
    change({ ...plan, stations: [...plan.stations, { id: newId(), name: importMenu ? "Service" : "New station", serviceTime: "", notes: "", resources: [], items }] });
  }
  function accept(result: Awaited<ReturnType<typeof saveBanquetSetup>>) {
    if ("error" in result) { setMessage(result.error ?? "Unable to save."); return; }
    setPlan(result.plan); setSaved(result.plan); setRevision(result.revision); setMessage("Saved to banquet.");
  }
  function save() {
    setMessage("");
    startTransition(async () => {
      try { accept(await saveBanquetSetup(id, revision, plan)); }
      catch { setMessage("Unable to save. Your edits are still here; try again."); }
    });
  }
  function pack(key: string, checked: boolean) {
    setMessage("");
    startTransition(async () => {
      try { accept(await setBanquetPullPacked(id, revision, key, checked)); }
      catch { setMessage("Unable to save the packing check. Try again."); }
    });
  }
  return <>
    <div className="no-print mb-5 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Setup views">
          {(["edit", "pack", "preview"] as const).filter(m => canEdit || m !== "edit").map(m =>
            <button key={m} className={`${buttonClass} ${mode === m ? "!bg-[#e3eadf] font-semibold" : ""}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "edit" ? "Edit setup" : m === "pack" ? "Pack & pull" : "Print preview"}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{dirty ? "Unsaved changes" : `Saved · revision ${revision}`}</span>
          {canEdit && <button onClick={save} disabled={pending || !dirty} className={buttonClass}>{pending ? "Saving…" : "Save setup"}</button>}
          <button className={buttonClass} disabled={dirty || pending} onClick={() => window.print()}>Print setup sheet</button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>
      {dirty && <p className="mt-2 text-xs text-amber-800">Save before packing or printing. Cook packets use the saved setup.</p>}
    </div>
    {mode === "edit" && canEdit && <fieldset disabled={pending} className="no-print min-w-0 space-y-5">
      <div className="rounded-xl border border-[#d7dfd0] bg-[#f4f6f2] p-4 text-sm">
        <p>Assign dishes to service stations, then enter the actual pieces to pull. Add a shared heatlamp or chafer setup once under its station. Enter fuel, water pans and backup utensils explicitly.</p>
        <p className="mt-2 text-xs text-zinc-600">Matching names merge regardless of capitalization or extra spaces. Keep sizes in the name. For an item served on the table with no vessel, leave its pull items empty and add a note.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} onClick={() => addStation()}>+ Add station</button>
        <button className={buttonClass} disabled={!menu.some(m => !plan.stations.some(s => s.items.some(i => i.menuItemId === m.id)))} onClick={() => addStation(true)}>Add unassigned BEO food lines</button>
      </div>
      {plan.stations.map((station, index) => <section key={station.id} aria-label={`Station ${index + 1}`} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-medium">Station name<input className={inputClass} value={station.name} onChange={e => updateStation(index, { name: e.target.value })} /></label>
          <label className="text-xs font-medium">Service / ready time<input className={inputClass} value={station.serviceTime} placeholder="e.g. Ready 4:45 pm · Serve 5 pm" onChange={e => updateStation(index, { serviceTime: e.target.value })} /></label>
          <div className="flex items-end gap-2">
            <button className={buttonClass} aria-label="Move station up" disabled={index === 0} onClick={() => change({ ...plan, stations: move(plan.stations, index, -1) })}>↑</button>
            <button className={buttonClass} aria-label="Move station down" disabled={index === plan.stations.length - 1} onClick={() => change({ ...plan, stations: move(plan.stations, index, 1) })}>↓</button>
            <button className="text-xs text-red-700" onClick={() => { if (window.confirm(`Remove ${station.name} and its setup rows?`)) change({ ...plan, stations: plan.stations.filter(s => s.id !== station.id) }); }}>Remove station</button>
          </div>
        </div>
        <label className="mt-3 block text-xs font-medium">Station notes<textarea className={inputClass} rows={2} value={station.notes} onChange={e => updateStation(index, { notes: e.target.value })} placeholder="Layout, power, refill plan, assigned cook…" /></label>
        <div className="mt-4 space-y-4">
          {station.items.map((item, itemIndex) => {
            const update = (patch: Partial<typeof item>) => updateStation(index, { items: station.items.map(i => i.id === item.id ? { ...i, ...patch } : i) });
            return <div key={item.id} className="setup-edit-item rounded-lg border border-zinc-200 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium">BEO food line<select className={inputClass} value={item.menuItemId ?? ""} onChange={e => update({ menuItemId: e.target.value || null, food: menu.find(m => m.id === e.target.value)?.name ?? item.food })}>
                    <option value="">Manual item / garnish</option>
                    {item.menuItemId && !menu.some(m => m.id === item.menuItemId) && <option value={item.menuItemId}>Removed food line — choose again</option>}
                    {menu.map(m => <option key={m.id} value={m.id}>{m.name} · {m.orderedQty} {m.unit}</option>)}
                  </select></label>
                  <label className="block text-xs font-medium">Food / item<input className={inputClass} readOnly={!!item.menuItemId} value={menu.find(m => m.id === item.menuItemId)?.name ?? item.food} onChange={e => update({ food: e.target.value })} /></label>
                  <label className="block text-xs font-medium">Service notes<textarea className={inputClass} rows={2} value={item.notes} onChange={e => update({ notes: e.target.value })} /></label>
                </div>
                <div><p className="mb-2 text-xs font-medium">Pull items · quantity in pieces</p><ResourceEditor resources={item.resources} change={resources => update({ resources })} /></div>
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <button disabled={itemIndex === 0} onClick={() => updateStation(index, { items: move(station.items, itemIndex, -1) })}>↑ Move up</button>
                <button disabled={itemIndex === station.items.length - 1} onClick={() => updateStation(index, { items: move(station.items, itemIndex, 1) })}>↓ Move down</button>
                <button className="text-red-700" onClick={() => { if (window.confirm(`Remove ${item.food} from this station?`)) updateStation(index, { items: station.items.filter(i => i.id !== item.id) }); }}>Remove food row</button>
              </div>
            </div>;
          })}
        </div>
        <button className={`${buttonClass} mt-3`} onClick={() => updateStation(index, { items: [...station.items, { id: newId(), menuItemId: null, food: "New item", notes: "", resources: [] }] })}>+ Add food / garnish</button>
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-1 text-sm font-semibold">Shared station equipment</h3>
          <p className="mb-2 text-xs text-zinc-500">Enter pieces shared by several dishes here, without repeating them on each dish.</p>
          <ResourceEditor resources={station.resources} change={resources => updateStation(index, { resources })} />
        </div>
      </section>)}
      {(["vessel", "equipment", "utensil"] as const).map(category => <datalist key={category} id={`setup-${category}`}>
        {[...new Set([...RESOURCE_OPTIONS[category], ...pulls.filter(p => p.category === category).map(p => p.name)])].map(name => <option key={name} value={name} />)}
      </datalist>)}
    </fieldset>}
    {mode === "pack" && <div className="no-print rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Kitchen pull checklist</h2>
      <p className="mt-1 text-sm">{pulls.filter(p => displayed.packed[p.key] === p.signature).length} / {pulls.length} lines verified</p>
      {!pulls.length && <p className="mt-4 text-sm text-zinc-500">No pull items entered yet.</p>}
      {(["vessel", "equipment", "utensil"] as const).map(category => <section key={category} className="mt-5">
        <h3 className="mb-2 font-semibold">{CATEGORY_LABELS[category]}</h3>
        {pulls.filter(p => p.category === category).map(p => <label key={p.key} className="mb-2 flex items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={displayed.packed[p.key] === p.signature} disabled={dirty || pending} onChange={e => pack(p.key, e.target.checked)} />
          <span className="flex-1"><strong>{p.name}</strong><span className="mt-1 block text-xs text-zinc-500">{p.allocations.join(" · ")}</span></span>
          <span className="font-mono text-lg font-semibold">{p.qty} ×</span>
        </label>)}
      </section>)}
    </div>}
    <div className={mode === "preview" ? "" : "setup-print-only"}>
      <BanquetSetupSheet plan={displayed} menu={menu} event={event} revision={revision} draft={dirty} />
    </div>
  </>;
}
