"use client";

import { useRef, useState, useTransition } from "react";
import { upsertDayNote } from "./actions";

// A per-day note cell inside the grid. Managers get an auto-growing textarea
// that saves on blur; everyone else sees the note text (or nothing).
export function DayNoteEditor({
  venueId,
  dateIso,
  initialBody,
  canEdit,
}: {
  venueId: string;
  dateIso: string;
  initialBody: string;
  canEdit: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(initialBody);
  const [pending, startTransition] = useTransition();

  // Posted / read-only: show the note, or leave the cell visually blank.
  if (!canEdit) {
    return body ? (
      <p className="whitespace-pre-wrap px-1.5 py-1 text-xs leading-snug text-zinc-600">{body}</p>
    ) : (
      <span className="sr-only">No note</span>
    );
  }

  function save() {
    const next = body.trim();
    if (next === savedRef.current.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("venueId", venueId);
      fd.set("date", dateIso);
      fd.set("body", next);
      await upsertDayNote(fd);
      savedRef.current = next;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="relative">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder="Add note"
        aria-label={`Note for ${dateIso}`}
        className="w-full resize-none rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-xs leading-snug text-zinc-700 placeholder:text-zinc-300 hover:border-[--sched-border] focus:border-form-focus focus:bg-canvas focus:outline-none focus:ring-1 focus:ring-form-focus"
      />
      {(pending || saved) && (
        <span className="pointer-events-none absolute bottom-1 right-1.5 text-[9px] uppercase tracking-wide text-zinc-400">
          {pending ? "…" : "saved"}
        </span>
      )}
    </div>
  );
}
