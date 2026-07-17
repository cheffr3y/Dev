"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cn } from "@/components/ui";
import { computeTotals, fmtHours, shiftHours } from "@/lib/schedule";
import { clearShift, upsertShift } from "./actions";
import { DayNoteEditor } from "./DayNoteEditor";
import {
  DayHeadContent,
  EmployeeCellContent,
  ScheduleColgroup,
  ShiftCellContent,
  type CookLite,
  type DayNoteLite,
  type DayLite,
  type ShiftLite,
} from "./schedule-ui";

// Re-exported so existing importers (the week page) keep their import path.
export type { CookLite, DayLite, ShiftLite } from "./schedule-ui";

type Editing = { cook: CookLite; day: DayLite; shift: ShiftLite | null };

// A short list of common line shifts, offered as one-tap presets in the editor.
const SHIFT_PRESETS: Array<{ label: string; start: string; end: string }> = [
  { label: "7a–3p", start: "07:00", end: "15:00" },
  { label: "8a–4p", start: "08:00", end: "16:00" },
  { label: "9a–5p", start: "09:00", end: "17:00" },
  { label: "10a–6p", start: "10:00", end: "18:00" },
];

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
  dayNotes: Array<{ iso: string; note: DayNoteLite }>;
  roleSuggestions: string[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const shiftAt = useMemo(() => {
    const m = new Map<string, ShiftLite>();
    for (const s of shifts) m.set(`${s.cookId}|${s.date}`, s);
    return m;
  }, [shifts]);
  const noteAt = useMemo(() => new Map(dayNotes.map((n) => [n.iso, n.note])), [dayNotes]);

  const { dayTotals, cookTotals, weekTotal } = useMemo(
    () => computeTotals(cooks, days, (cookId, iso) => shiftAt.get(`${cookId}|${iso}`)),
    [cooks, days, shiftAt],
  );

  const hasAnyDayNote = dayNotes.length > 0;
  const showNotesRow = canEdit || hasAnyDayNote;

  function openEditor(next: Editing, trigger: HTMLElement) {
    lastFocused.current = trigger;
    setEditing(next);
  }
  function closeEditor() {
    setEditing(null);
    // Return focus to the cell that opened the dialog.
    lastFocused.current?.focus();
  }

  return (
    <>
      <div className="overflow-x-auto rounded-[--sched-radius] border border-[--sched-border] bg-canvas shadow-[0_1px_2px_rgba(26,26,26,0.04)]">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <ScheduleColgroup days={days} />
          <caption className="sr-only">
            Weekly kitchen schedule. Rows list each cook; columns are the seven days of the week with a
            weekly hours total.
          </caption>
          <thead>
            <tr className="sched-fill-header border-b-2 border-[--sched-border-strong]">
              <th
                scope="col"
                className="sched-sticky sched-fill-header px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
              >
                Cook
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  scope="col"
                  className={cn("px-1.5 py-2 text-center", d.weekend && "sched-fill-weekend")}
                >
                  <DayHeadContent day={d} />
                </th>
              ))}
              <th
                scope="col"
                className="px-2 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
              >
                Hrs
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[--sched-border]">
            {cooks.map((cook) => (
              <tr key={cook.id} className="group/row">
                <th
                  scope="row"
                  className="sched-sticky sched-fill-header px-4 py-2 text-left align-middle"
                >
                  <EmployeeCellContent cook={cook} />
                </th>
                {days.map((d) => {
                  const shift = shiftAt.get(`${cook.id}|${d.iso}`) ?? null;
                  return (
                    <td key={d.iso} className={cn("p-0 align-middle", d.weekend && "sched-fill-weekend")}>
                      <ShiftCell
                        cook={cook}
                        day={d}
                        shift={shift}
                        canEdit={canEdit}
                        onOpen={(el) => openEditor({ cook, day: d, shift }, el)}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right align-middle tabular-nums">
                  {(cookTotals.get(cook.id) ?? 0) > 0 ? (
                    <span className="font-semibold text-ink">{fmtHours(cookTotals.get(cook.id) ?? 0)}</span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Day-specific notes: one controlled cell per day (events, deliveries, VIPs). */}
            {showNotesRow && (
              <tr className="border-t-2 border-[--sched-border-strong]">
                <th
                  scope="row"
                  className="sched-sticky sched-fill-header px-4 py-2 text-left align-top font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
                >
                  Daily notes
                </th>
                {days.map((d) => (
                  <td key={d.iso} className={cn("p-1 align-top", d.weekend && "sched-fill-weekend")}>
                    <DayNoteEditor venueId={venueId} dateIso={d.iso} initialNote={noteAt.get(d.iso) ?? null} canEdit={canEdit} />
                  </td>
                ))}
                <td className="sched-fill-totals" />
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className="sched-fill-totals border-t-2 border-[--sched-border-strong]">
              <th
                scope="row"
                className="sched-sticky sched-fill-totals px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-600"
              >
                Day hours
              </th>
              {dayTotals.map((h, i) => (
                <td
                  key={days[i].iso}
                  className={cn("px-1.5 py-2.5 text-center font-medium tabular-nums text-zinc-700", days[i].weekend && "sched-fill-weekend")}
                >
                  {h > 0 ? fmtHours(h) : <span className="text-zinc-300">—</span>}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right align-middle">
                <span className="font-display text-base tabular-nums text-ink">{fmtHours(weekTotal)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <ShiftEditor
          key={`${editing.cook.id}|${editing.day.iso}`}
          editing={editing}
          roleSuggestions={roleSuggestions}
          onClose={closeEditor}
        />
      )}
    </>
  );
}

// ── One grid cell ───────────────────────────────────────────────────────────
function ShiftCell({
  cook,
  day,
  shift,
  canEdit,
  onOpen,
}: {
  cook: CookLite;
  day: DayLite;
  shift: ShiftLite | null;
  canEdit: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const base = "flex min-h-[3.25rem] w-full items-center justify-center px-1.5 py-2 text-center";

  // Posted / read-only: a working shift or OFF renders; an empty cell is blank.
  if (!canEdit) {
    return (
      <div className={base}>
        <ShiftCellContent shift={shift} defaultRole={cook.role} variant="screen" />
      </div>
    );
  }

  // Editor: the whole cell is a button. Empty cells stay quiet until hover/focus.
  const label = shift
    ? `Edit ${cook.name}'s shift on ${day.short} ${day.dayNum}`
    : `Add a shift for ${cook.name} on ${day.short} ${day.dayNum}`;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(
        base,
        "group/cell cursor-pointer rounded-[4px] transition-colors hover:bg-[--sched-fill-active] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
      )}
    >
      {shift ? (
        <ShiftCellContent shift={shift} defaultRole={cook.role} variant="screen" />
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-transparent transition-colors group-hover/cell:text-zinc-400 group-focus-visible/cell:text-zinc-400">
          Add shift
        </span>
      )}
    </button>
  );
}

// ── Editor dialog ───────────────────────────────────────────────────────────
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
  const [start, setStart] = useState(shift?.start ?? "");
  const [end, setEnd] = useState(shift?.end ?? "");
  const [role, setRole] = useState(shift?.role ?? "");
  const [note, setNote] = useState(shift?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Snapshot of the opening state — used to detect unsaved edits.
  const initial = useRef(JSON.stringify({ kind: shift?.kind ?? "WORKING", start: shift?.start ?? "", end: shift?.end ?? "", role: shift?.role ?? "", note: shift?.note ?? "" }));
  const isDirty = () => JSON.stringify({ kind, start, end, role, note }) !== initial.current;

  const dateLabel = new Date(`${day.iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Live shift duration once both times are valid (respects overnight math).
  const duration = kind === "WORKING" && start && end ? shiftHours(start, end) : 0;
  const isOvernight = kind === "WORKING" && start && end && end <= start;

  function requestClose() {
    if (isDirty() && !window.confirm("Discard unsaved changes to this shift?")) return;
    onClose();
  }

  // Focus first control, lock scroll, trap Tab, and wire Esc / Cmd+Enter.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // requestClose reads live state via refs/closures recreated each render; the
    // listener is stable enough for a dialog whose identity is keyed per cell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): string | null {
    if (kind !== "WORKING") return null;
    const bothBlank = !start && !end;
    if (bothBlank) return null; // clearing the cell is allowed
    if (!start || !end) return "Add both a start and an end time.";
    return null;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("cookId", cook.id);
    fd.set("date", day.iso);
    fd.set("kind", kind);
    if (kind === "WORKING") {
      fd.set("start", start);
      fd.set("end", end);
      fd.set("role", role);
    }
    fd.set("note", note);
    startTransition(async () => {
      await upsertShift(fd);
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

  const timeField =
    "w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/30 p-4"
      onClick={requestClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-editor-title"
        className="w-full max-w-md rounded-[--sched-radius] border border-[--sched-border] bg-canvas p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="shift-editor-title" className="font-display text-xl leading-tight text-ink">
              {cook.name}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          {/* Working / Off — a two-option toggle with proper pressed semantics. */}
          <div role="group" aria-label="Shift type" className="inline-flex rounded-full border border-[--sched-border] p-0.5">
            {(["WORKING", "OFF"] as const).map((k, i) => (
              <button
                key={k}
                ref={i === 0 ? firstFieldRef : undefined}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setError(null);
                }}
                className={cn(
                  "rounded-full px-4 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
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
                  <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-600">Start time</span>
                  <input
                    type="time"
                    aria-label="Shift start time"
                    value={start}
                    onChange={(e) => {
                      setStart(e.target.value);
                      setError(null);
                    }}
                    className={timeField}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-600">End time</span>
                  <input
                    type="time"
                    aria-label="Shift end time"
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      setError(null);
                    }}
                    className={timeField}
                  />
                </label>
              </div>

              {/* Quick presets — subtle, single row. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-400">Quick set</span>
                {SHIFT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setStart(p.start);
                      setEnd(p.end);
                      setError(null);
                    }}
                    className="rounded-full border border-[--sched-border] px-2.5 py-0.5 text-xs text-zinc-600 transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {duration > 0 && (
                <p className="text-xs text-zinc-500">
                  Duration <span className="font-semibold tabular-nums text-ink">{fmtHours(duration)}h</span>
                  {isOvernight && <span className="text-zinc-400"> · overnight</span>}
                </p>
              )}

              <label className="block">
                <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-600">Station / role</span>
                <input
                  list="role-suggestions"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
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
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-600">
              Note {kind === "OFF" ? "(reason, optional)" : "(optional)"}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "OFF" ? "e.g. requested off, vacation" : "e.g. close, AM prep only"}
              className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {shift ? (
              <button
                type="button"
                onClick={onClear}
                disabled={pending}
                className="text-sm font-medium text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
              >
                Clear shift
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-full border border-[--sched-border] px-4 py-2 text-sm font-medium text-zinc-600 hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                title="Save (⌘/Ctrl + Enter)"
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
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
