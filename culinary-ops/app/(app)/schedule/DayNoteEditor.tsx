"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DayEventsContent, hasDayEvent, type DayEventLite } from "./schedule-ui";
import { setDayEvents } from "./actions";

const EMPTY_EVENT: DayEventLite = { eventName: null, people: null, time: null, location: null, body: null };

// The grid stays compact and aligned; selecting a day opens a dialog with room
// to enter one or more consistent event briefs instead of squeezing raw prose
// into a cell. A day can hold several events (deliveries, off-sites, VIPs).
export function DayNoteEditor({
  venueId,
  dateIso,
  initialEvents,
  canEdit,
}: {
  venueId: string;
  dateIso: string;
  initialEvents: DayEventLite[];
  canEdit: boolean;
}) {
  const [events, setEvents] = useState<DayEventLite[]>(initialEvents);
  const [draft, setDraft] = useState<DayEventLite[]>(initialEvents);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape and lock scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!canEdit) return <DayEventsContent events={events} />;

  const shown = events.filter(hasDayEvent);

  function openEditor() {
    setDraft(shown.length ? shown : [EMPTY_EVENT]);
    setOpen(true);
  }

  function updateAt(i: number, patch: Partial<DayEventLite>) {
    setDraft((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function addEvent() {
    setDraft((prev) => [...prev, EMPTY_EVENT]);
  }
  function removeAt(i: number) {
    setDraft((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [EMPTY_EVENT];
    });
  }

  function save() {
    const kept = draft.filter(hasDayEvent);
    startTransition(async () => {
      await setDayEvents({ venueId, date: dateIso, events: kept });
      setEvents(kept);
      setOpen(false);
    });
  }

  const field =
    "w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus";

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="group/note min-h-16 w-full rounded-[4px] px-1.5 py-1 text-left transition-colors hover:bg-[--sched-fill-active] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
        aria-label={`${shown.length ? "Edit" : "Add"} events for ${dateIso}`}
      >
        {shown.length ? (
          <DayEventsContent events={shown} />
        ) : (
          <span className="block text-center font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-300 transition-colors group-hover/note:text-zinc-500">
            Add event
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setOpen(false)}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`day-events-title-${dateIso}`}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[--sched-radius] border border-[--sched-border] bg-canvas shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[--sched-border] p-5 pb-4">
              <div>
                <h2 id={`day-events-title-${dateIso}`} className="font-display text-xl text-ink">
                  Daily events
                </h2>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">{dateIso}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-ink" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {draft.map((event, i) => (
                <fieldset key={i} className="rounded-md border border-[--sched-border] p-3">
                  <legend className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Event {i + 1}
                    {draft.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="text-zinc-400 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        aria-label={`Remove event ${i + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </legend>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-600">Event name</span>
                      <input
                        autoFocus={i === 0}
                        value={event.eventName ?? ""}
                        onChange={(e) => updateAt(i, { eventName: e.target.value })}
                        placeholder="Celebration of life"
                        className={field}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-zinc-600">People</span>
                        <input
                          type="number"
                          min="0"
                          value={event.people ?? ""}
                          onChange={(e) => updateAt(i, { people: e.target.value === "" ? null : Number(e.target.value) })}
                          placeholder="50"
                          className={field}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-zinc-600">Time</span>
                        <input
                          value={event.time ?? ""}
                          onChange={(e) => updateAt(i, { time: e.target.value })}
                          placeholder="1–3pm"
                          className={field}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-600">Location</span>
                      <input
                        value={event.location ?? ""}
                        onChange={(e) => updateAt(i, { location: e.target.value })}
                        placeholder="Annex"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-600">Notes</span>
                      <textarea
                        rows={2}
                        value={event.body ?? ""}
                        onChange={(e) => updateAt(i, { body: e.target.value })}
                        placeholder="Service details, station timing, VIPs…"
                        className={field}
                      />
                    </label>
                  </div>
                </fieldset>
              ))}

              <button
                type="button"
                onClick={addEvent}
                className="w-full rounded-md border border-dashed border-[--sched-border-strong] py-2 text-sm font-medium text-zinc-500 transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                + Add another event
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[--sched-border] p-5 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[--sched-border] px-4 py-1.5 text-sm text-zinc-600 hover:border-ink hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
