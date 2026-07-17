"use client";

import { useState, useTransition } from "react";
import { DayNoteContent, hasDayNote, type DayNoteLite } from "./schedule-ui";
import { upsertDayNote } from "./actions";

const EMPTY_NOTE: DayNoteLite = { eventName: null, people: null, time: null, location: null, body: null };

// The grid stays compact and aligned; selecting a day opens enough room to
// enter a consistent event brief instead of squeezing raw prose into a cell.
export function DayNoteEditor({
  venueId,
  dateIso,
  initialNote,
  canEdit,
}: {
  venueId: string;
  dateIso: string;
  initialNote: DayNoteLite | null;
  canEdit: boolean;
}) {
  const [note, setNote] = useState<DayNoteLite>(initialNote ?? EMPTY_NOTE);
  const [draft, setDraft] = useState<DayNoteLite>(initialNote ?? EMPTY_NOTE);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return <DayNoteContent note={note} />;

  function openEditor() {
    setDraft(note);
    setOpen(true);
  }

  function save() {
    const next: DayNoteLite = {
      eventName: draft.eventName?.trim() || null,
      people: draft.people,
      time: draft.time?.trim() || null,
      location: draft.location?.trim() || null,
      body: draft.body?.trim() || null,
    };
    const fd = new FormData();
    fd.set("venueId", venueId);
    fd.set("date", dateIso);
    if (next.eventName) fd.set("eventName", next.eventName);
    if (next.people !== null) fd.set("people", String(next.people));
    if (next.time) fd.set("time", next.time);
    if (next.location) fd.set("location", next.location);
    if (next.body) fd.set("body", next.body);

    startTransition(async () => {
      await upsertDayNote(fd);
      setNote(next);
      setOpen(false);
    });
  }

  const field = "w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus";

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="group/note min-h-16 w-full rounded-[4px] px-1.5 py-1 text-left transition-colors hover:bg-[--sched-fill-active] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
        aria-label={`${hasDayNote(note) ? "Edit" : "Add"} event or note for ${dateIso}`}
      >
        {hasDayNote(note) ? (
          <DayNoteContent note={note} />
        ) : (
          <span className="block text-center font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-300 transition-colors group-hover/note:text-zinc-500">
            Add event or note
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`day-note-title-${dateIso}`}
            className="w-full max-w-lg rounded-[--sched-radius] border border-[--sched-border] bg-canvas p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id={`day-note-title-${dateIso}`} className="font-display text-xl text-ink">Daily event</h2>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">{dateIso}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-ink" aria-label="Close">✕</button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600">Event name</span>
                <input autoFocus value={draft.eventName ?? ""} onChange={(e) => setDraft({ ...draft, eventName: e.target.value })} placeholder="Celebration of life" className={field} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">People</span>
                  <input type="number" min="0" value={draft.people ?? ""} onChange={(e) => setDraft({ ...draft, people: e.target.value === "" ? null : Number(e.target.value) })} placeholder="50" className={field} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">Time</span>
                  <input value={draft.time ?? ""} onChange={(e) => setDraft({ ...draft, time: e.target.value })} placeholder="1–3pm" className={field} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600">Location</span>
                <input value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Annex" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600">Notes</span>
                <textarea rows={3} value={draft.body ?? ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Service details, station timing, VIPs…" className={field} />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[--sched-border] pt-4">
              <button type="button" onClick={() => setDraft(EMPTY_NOTE)} className="text-sm text-zinc-500 hover:text-red-600">Clear fields</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-[--sched-border] px-4 py-1.5 text-sm text-zinc-600">Cancel</button>
                <button type="button" onClick={save} disabled={pending} className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
