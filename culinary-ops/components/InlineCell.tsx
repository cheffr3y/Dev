"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { EditEntity, EditResult, EditValue } from "@/lib/workspace-options";
import { parseCellValue } from "@/lib/workspace-options";

export function InlineCell({ entity, id, field, value, label, options, row, column = field, onValue, onSaved }: {
  entity: EditEntity; id: string; field: string; value: EditValue; label: string;
  options?: { id: string; name: string }[]; row?: string; column?: string;
  onValue?: (value: EditValue) => void; onSaved?: () => void;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState(""), [unsaved, setUnsaved] = useState(false);
  const [saved, setSaved] = useState(value), [observedValue, setObservedValue] = useState(value);
  const pending = useRef(false), dirty = useRef(false);
  // Server refreshes may update an idle cell; preserve any active draft.
  if (observedValue !== value) {
    setObservedValue(value);
    if (!unsaved && status !== "saving") { setSaved(value); setDraft(String(value ?? "")); }
  }
  const input = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const errorId = useId();
  useEffect(() => {
    if (status !== "saved") return;
    const timer = setTimeout(() => setStatus("idle"), 1800);
    return () => clearTimeout(timer);
  }, [status]);
  // Warn only while this cell still contains an unsaved edit or request.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  async function save() {
    if (pending.current) return;
    let next: EditValue;
    try { next = parseCellValue(entity, field, draft); }
    catch (error) { setStatus("error"); setError(error instanceof Error ? error.message : "Check this value."); return; }
    if (next === saved) { dirty.current = false; setUnsaved(false); setStatus("idle"); setError(""); return; }
    pending.current = true; setStatus("saving"); setError(""); onValue?.(next);
    try {
      const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id, field, expected: saved, value: draft }) });
      const result: EditResult = await response.json();
      if (!result.ok) {
        const latest = "current" in result ? result.current ?? null : saved;
        setSaved(latest); onValue?.(latest); setError(result.error); setStatus("error"); return;
      }
      setSaved(result.value); dirty.current = false; setUnsaved(false); setDraft(String(result.value ?? "")); setStatus("saved"); onSaved?.();
    } catch { onValue?.(saved); setError("Connection interrupted. Your entry is kept; retry to check whether it saved."); setStatus("error"); }
    finally { pending.current = false; }
  }
  const shared = {
    "aria-label": label, "aria-invalid": status === "error" || undefined, "aria-describedby": status === "error" ? errorId : undefined,
    "data-grid-cell": true, "data-unsaved": unsaved || undefined, "aria-busy": status === "saving", "data-grid-row": row, "data-grid-column": column,
    value: draft,
    className: `inline-cell w-full min-w-20 rounded border px-2 py-1 text-sm text-ink outline-none focus:border-form-focus focus:ring-1 focus:ring-form-focus ${status === "error" ? "border-red-500" : status === "saved" ? "border-emerald-500 bg-emerald-500/10" : "border-transparent bg-transparent hover:border-hairline"} ${["unitCost", "par", "yieldQty"].includes(field) ? "text-right tabular-nums" : ""}`,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { if (pending.current) return; setDraft(event.target.value); dirty.current = true; setUnsaved(true); setStatus("idle"); setError(""); },
    onBlur: () => { if (dirty.current && status !== "error") void save(); },
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { if (event.target instanceof HTMLInputElement) event.target.select(); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape" && !pending.current) { event.preventDefault(); setDraft(String(saved ?? "")); dirty.current = false; setUnsaved(false); setError(""); setStatus("idle"); return; }
      const grid = event.currentTarget.closest("[data-edit-grid]");
      if (!grid || !["Tab", "Enter"].includes(event.key)) return;
      const cells = Array.from(grid.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-grid-cell]"));
      const index = cells.indexOf(event.currentTarget), direction = event.shiftKey ? -1 : 1;
      const next = event.key === "Tab" ? cells[index + direction] : cells.filter(cell => cell.dataset.gridColumn === column)[cells.filter(cell => cell.dataset.gridColumn === column).indexOf(event.currentTarget) + direction];
      if (next) { event.preventDefault(); next.focus(); } else if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    },
  };
  return <div className="relative min-w-24">
    {options ? <select {...shared} ref={element => { input.current = element; }} aria-busy={status === "saving"}>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select> : <input {...shared} ref={element => { input.current = element; }} readOnly={status === "saving"} inputMode={["unitCost", "par", "yieldQty"].includes(field) ? "decimal" : undefined} />}
    <span role="status" className={`pointer-events-none absolute -bottom-2 right-1 z-10 rounded bg-canvas px-1 text-[10px] ${status === "saved" ? "text-emerald-600" : "text-zinc-500"}`}>{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}</span>
    {status === "error" && <div id={errorId} className="max-w-64 px-2 text-xs text-red-600"><p role="alert">{error}</p><div className="mt-1 flex gap-3"><button type="button" className="underline" onClick={() => { void save(); }}>Retry my edit</button><button type="button" className="underline" onClick={() => { setDraft(String(saved ?? "")); dirty.current = false; setUnsaved(false); setError(""); setStatus("idle"); onValue?.(saved); input.current?.focus(); }}>Use latest</button></div></div>}
  </div>;
}
