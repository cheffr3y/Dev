"use client";

import { useState, useTransition } from "react";
import { cn } from "@/components/ui";
import { fmtHours, fmtTimeRange, shiftHours } from "@/lib/schedule";
import { clearShift, upsertShift } from "./actions";
import { DayNoteEditor } from "./DayNoteEditor";

export type CookLite = { id: string; name: string; role: string | null };
export type ShiftLite = {
  cookId: string;
  date: string; // YYYY-MM-DD
  kind: "WORKING" | "OFF";
  start: string | null;
  end: string | null;
  role: string | null;
  note: string | null;
};
export type DayLite = {
  iso: string;
  short: string; // "Mon"
  dayNum: number; // 23
  weekend: boolean;
};

type Editing = { cook: CookLite; day: DayLite; shift: ShiftLite | null };

export function ScheduleGrid({
  venueId,
  canEdit,
  cooks,
  shifts,
  days,
  dayNotes,
  roleSuggestions,
}: {
  venueId: string;
  canEdit: boolean;
  cooks: CookLite[];
  shifts: ShiftLite[];
  days: DayLite[];
  dayNotes: Array<{ iso: string; body: string }>;
  roleSuggestions: string[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const shiftAt = new Map<string, ShiftLite>();
  for (const s of shifts) shiftAt.set(`${s.cookId}|${s.date}`, s);
  const noteAt = new Map(dayNotes.map((n) => [n.iso, n.body]));

  const dayTotals = days.map((d) =>
    cooks.reduce((sum, c) => sum + shiftHours(shiftAt.get(`${c.id}|${d.iso}`)?.start, shiftAt.get(`${c.id}|${d.iso}`)?.end), 0),
  );
  const cookTotals = new Map(
    cooks.map((c) => [c.id, days.reduce((sum, d) => sum + shiftHours(shiftAt.get(`${c.id}|${d.iso}`)?.start, shiftAt.get(`${c.id}|${d.iso}`)?.end), 0)]),
  );
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-hairline bg-canvas shadow-[0_1px_2px_rgba(26,26,26,0.04)]">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-zinc-50">
              <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.02em] text-zinc-600">
                Cook
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className={cn(
                    "px-2 py-2 text-center font-mono text-[11px] font-medium uppercase tracking-[0.02em]",
                    d.weekend ? "bg-pale-gold/40 text-gold" : "text-zinc-600",
                  )}
                >
                  <div>{d.short}</div>
                  <div className="mt-0.5 font-display text-base text-ink">{d.dayNum}</div>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.02em] text-zinc-600">
                Hrs
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {cooks.map((cook) => (
              <tr key={cook.id} className="group/row">
                <th className="sticky left-0 z-10 bg-canvas px-4 py-2 text-left align-top group-hover/row:bg-zinc-50">
                  <div className="font-medium text-ink">{cook.name}</div>
                  {cook.role && <div className="mt-0.5 text-xs text-zinc-500">{cook.role}</div>}
                </th>
                {days.map((d) => {
                  const shift = shiftAt.get(`${cook.id}|${d.iso}`) ?? null;
                  return (
                    <td key={d.iso} className={cn("p-0 align-top", d.weekend && "bg-pale-gold/20")}>
                      <ShiftCell
                        shift={shift}
                        canEdit={canEdit}
                        onClick={canEdit ? () => setEditing({ cook, day: d, shift }) : undefined}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right align-middle tabular-nums text-zinc-700">
                  {(cookTotals.get(cook.id) ?? 0) > 0 ? <span className="font-semibold">{fmtHours(cookTotals.get(cook.id) ?? 0)}</span> : <span className="text-zinc-300">—</span>}
                </td>
              </tr>
            ))}

            {/* Per-day notes: events, deliveries, VIPs. */}
            <tr className="border-t-2 border-hairline">
              <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-2 text-left align-top font-mono text-[11px] font-medium uppercase tracking-[0.02em] text-zinc-600">
                Daily notes
              </th>
              {days.map((d) => (
                <td key={d.iso} className={cn("p-1.5 align-top", d.weekend && "bg-pale-gold/20")}>
                  <DayNoteEditor venueId={venueId} dateIso={d.iso} initialBody={noteAt.get(d.iso) ?? ""} canEdit={canEdit} />
                </td>
              ))}
              <td className="bg-zinc-50" />
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline bg-zinc-50">
              <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.02em] text-zinc-600">
                Day hours
              </th>
              {dayTotals.map((h, i) => (
                <td key={days[i].iso} className={cn("px-2 py-2 text-center tabular-nums text-zinc-600", days[i].weekend && "bg-pale-gold/30")}>
                  {h > 0 ? fmtHours(h) : "—"}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{fmtHours(weekTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <ShiftEditor
          key={`${editing.cook.id}|${editing.day.iso}`}
          editing={editing}
          roleSuggestions={roleSuggestions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ShiftCell({ shift, canEdit, onClick }: { shift: ShiftLite | null; canEdit: boolean; onClick?: () => void }) {
  const inner = (() => {
    if (!shift) {
      return <span className={cn("text-zinc-300", canEdit && "group-hover/cell:text-zinc-400")}>{canEdit ? "+" : ""}</span>;
    }
    if (shift.kind === "OFF") {
      return (
        <span className="inline-flex flex-col items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Off</span>
          {shift.note && <span className="mt-0.5 text-[11px] text-zinc-400">{shift.note}</span>}
        </span>
      );
    }
    return (
      <span className="flex flex-col items-center">
        <span className="font-semibold tabular-nums text-ink">{fmtTimeRange(shift.start, shift.end) || "—"}</span>
        {shift.role && <span className="mt-0.5 text-[11px] text-gold">{shift.role}</span>}
        {shift.note && <span className="mt-0.5 text-[11px] text-zinc-500">{shift.note}</span>}
      </span>
    );
  })();

  const classes = "group/cell flex min-h-[3.25rem] w-full items-center justify-center px-2 py-2 text-center transition-colors";
  if (canEdit) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "cursor-pointer hover:bg-pale-gold/50")}>
        {inner}
      </button>
    );
  }
  return <div className={classes}>{inner}</div>;
}

function ShiftEditor({
  editing,
  roleSuggestions,
  onClose,
}: {
  editing: Editing;
  roleSuggestions: string[];
  onClose: () => void;
}) {
  const { cook, day, shift } = editing;
  const [kind, setKind] = useState<"WORKING" | "OFF">(shift?.kind ?? "WORKING");
  const [pending, startTransition] = useTransition();

  function onSave(formData: FormData) {
    startTransition(async () => {
      await upsertShift(formData);
      onClose();
    });
  }

  function onClear() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("cookId", cook.id);
      fd.set("date", day.iso);
      await clearShift(fd);
      onClose();
    });
  }

  const dateLabel = new Date(`${day.iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-hairline bg-canvas p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink">{cook.name}</h2>
            <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">{dateLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-ink" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form action={onSave} className="space-y-4">
          <input type="hidden" name="cookId" value={cook.id} />
          <input type="hidden" name="date" value={day.iso} />
          <input type="hidden" name="kind" value={kind} />

          {/* Working / OFF toggle */}
          <div className="inline-flex rounded-full border border-hairline p-0.5">
            {(["WORKING", "OFF"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full px-4 py-1 text-sm font-medium transition-colors",
                  kind === k ? "bg-primary text-white" : "text-zinc-500 hover:text-ink",
                )}
              >
                {k === "WORKING" ? "Working" : "Off"}
              </button>
            ))}
          </div>

          {kind === "WORKING" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Start</span>
                  <input
                    type="time"
                    name="start"
                    defaultValue={shift?.start ?? ""}
                    className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">End</span>
                  <input
                    type="time"
                    name="end"
                    defaultValue={shift?.end ?? ""}
                    className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Station / role</span>
                <input
                  name="role"
                  list="role-suggestions"
                  defaultValue={shift?.role ?? ""}
                  placeholder={cook.role ?? "e.g. Grill, Prep, Lead"}
                  className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
                />
                <datalist id="role-suggestions">
                  {roleSuggestions.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </label>
            </>
          ) : (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-500">Marked off for the day — no hours counted.</p>
          )}

          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
              Note {kind === "OFF" ? "(reason, optional)" : "(optional)"}
            </span>
            <input
              name="note"
              defaultValue={shift?.note ?? ""}
              placeholder={kind === "OFF" ? "e.g. requested off, vacation" : "e.g. close, AM prep only"}
              className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
            />
          </label>

          <div className="flex items-center justify-between gap-2 pt-1">
            {shift ? (
              <button type="button" onClick={onClear} disabled={pending} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50">
                Clear shift
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-zinc-600 hover:border-ink hover:text-ink">
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
