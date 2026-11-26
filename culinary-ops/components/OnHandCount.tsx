"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveOnHand } from "@/app/(app)/production/counts/actions";
import { countKey, orderLine, parseOnHand } from "@/lib/production/purchase-count";
import { preciseNum } from "@/lib/recipes/costing";

export type CountRow = {
  itemId: string;
  name: string;
  category: string;
  vendor: string;
  unit: string;
  need: number;
  packQty: number | null;
  packSize: string | null;
  review: boolean;
};

type Status = "idle" | "saving" | "saved" | "error";

// Phone-first count: type what's on the shelf, To order updates as you type,
// each amount saves on its own shortly after you stop typing.
export function OnHandCount({ countId, rows, initial }: { countId: string; rows: CountRow[]; initial: Record<string, number> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, String(value)])));
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(new Map<string, number>());

  useEffect(() => {
    const pending = timers.current;
    return () => { for (const timer of pending.values()) clearTimeout(timer); };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, CountRow[]>();
    for (const row of rows) map.set(row.category, [...(map.get(row.category) ?? []), row]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const counted = rows.filter((row) => parseOnHand(values[countKey(row.itemId, row.unit)] ?? "") != null).length;

  function persist(row: CountRow, text: string) {
    const key = countKey(row.itemId, row.unit);
    const parsed = parseOnHand(text);
    if (parsed === "invalid") {
      setStatus((s) => ({ ...s, [key]: "error" }));
      setErrors((e) => ({ ...e, [key]: "Use a number of 0 or more." }));
      return;
    }
    const attempt = (latest.current.get(key) ?? 0) + 1;
    latest.current.set(key, attempt);
    setStatus((s) => ({ ...s, [key]: "saving" }));
    saveOnHand({ countId, itemId: row.itemId, unit: row.unit, onHand: parsed })
      .then((result) => {
        if (latest.current.get(key) !== attempt) return; // a newer value is on its way
        setStatus((s) => ({ ...s, [key]: result.ok ? "saved" : "error" }));
        setErrors((e) => ({ ...e, [key]: result.ok ? "" : result.error }));
      })
      .catch(() => {
        if (latest.current.get(key) !== attempt) return;
        setStatus((s) => ({ ...s, [key]: "error" }));
        setErrors((e) => ({ ...e, [key]: "Not saved. Check your connection; it will retry when you edit or leave the field." }));
      });
  }

  function change(row: CountRow, text: string) {
    const key = countKey(row.itemId, row.unit);
    setValues((v) => ({ ...v, [key]: text }));
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(key, setTimeout(() => { timers.current.delete(key); persist(row, text); }, 700));
  }

  function blur(row: CountRow) {
    const key = countKey(row.itemId, row.unit);
    const existing = timers.current.get(key);
    if (existing) { clearTimeout(existing); timers.current.delete(key); persist(row, values[key] ?? ""); }
    else if (status[key] === "error") persist(row, values[key] ?? "");
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600" aria-live="polite">{counted} of {rows.length} counted. Leave an item blank if you didn&apos;t check it; it orders the full need.</p>
      {groups.map(([category, list]) => (
        <section key={category} aria-labelledby={`count-${category}`}>
          <h2 id={`count-${category}`} className="mb-2 border-b-2 border-ink pb-1 font-display text-lg italic text-ink">{category}</h2>
          <ul className="divide-y divide-hairline">
            {list.map((row) => {
              const key = countKey(row.itemId, row.unit);
              const text = values[key] ?? "";
              const parsed = parseOnHand(text);
              const line = orderLine(row.need, parsed === "invalid" ? null : parsed, row.packQty);
              const state = status[key] ?? "idle";
              const inputId = `onhand-${key}`;
              return (
                <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_9rem]">
                  <div className="min-w-0">
                    <label htmlFor={inputId} className="block font-medium text-ink">{row.name}</label>
                    <span className="block text-xs text-zinc-500">{row.vendor}{row.packSize ? ` · ${row.packSize}` : ""}{row.review ? " · unit needs review" : ""}</span>
                  </div>
                  <div className="text-right text-sm tabular-nums sm:text-left">
                    <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Need</span>
                    {preciseNum(row.need)} {row.unit}
                  </div>
                  <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                    <input
                      id={inputId}
                      inputMode="decimal"
                      autoComplete="off"
                      value={text}
                      onChange={(event) => change(row, event.target.value)}
                      onBlur={() => blur(row)}
                      aria-describedby={`${inputId}-unit ${inputId}-status`}
                      aria-invalid={state === "error"}
                      placeholder="On hand"
                      className="w-full min-w-0 rounded border border-hairline bg-canvas px-3 py-2 text-right text-lg tabular-nums focus:border-ink focus:outline-none focus:ring-2 focus:ring-form-focus aria-[invalid=true]:border-red-600"
                    />
                    <span id={`${inputId}-unit`} className="w-10 shrink-0 text-sm text-zinc-600">{row.unit}</span>
                  </div>
                  <div className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 sm:block">To order</span>
                    <span className={`font-semibold tabular-nums ${line.toOrder === 0 ? "text-sage" : "text-ink"}`}>
                      {line.toOrder === 0 ? "Covered" : `${preciseNum(line.toOrder)} ${row.unit}`}
                      {line.packs != null && line.toOrder > 0 && <span className="block text-xs font-normal text-zinc-600">{line.packs} {line.packs === 1 ? "case" : "cases"}</span>}
                    </span>
                  </div>
                  <p id={`${inputId}-status`} className="col-span-full text-xs" role={state === "error" ? "alert" : undefined}>
                    {state === "saving" && <span className="text-zinc-500">Saving…</span>}
                    {state === "saved" && <span className="text-sage">Saved</span>}
                    {state === "error" && <span className="text-red-700">{errors[key]}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
