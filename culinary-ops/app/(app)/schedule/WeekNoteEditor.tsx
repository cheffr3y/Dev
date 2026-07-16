"use client";

import { useRef, useState, useTransition } from "react";
import { upsertWeekNote } from "./actions";

// The week's posted announcements. Managers edit inline (save on blur); staff
// and the print view read it. One block per venue per week.
export function WeekNoteEditor({
  venueId,
  weekStart,
  initialBody,
  canEdit,
}: {
  venueId: string;
  weekStart: string;
  initialBody: string;
  canEdit: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(initialBody);
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    if (!body) return null;
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{body}</p>;
  }

  function save() {
    const next = body.trim();
    if (next === savedRef.current.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("venueId", venueId);
      fd.set("weekStart", weekStart);
      fd.set("body", next);
      await upsertWeekNote(fd);
      savedRef.current = next;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={save}
        rows={3}
        placeholder="Post announcements for the week — dress code, inventory day, VIP events…"
        className="w-full resize-y rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm leading-relaxed text-zinc-700 placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
      />
      <p className="mt-1 h-4 text-right text-[10px] uppercase tracking-wide text-zinc-400">
        {pending ? "Saving…" : saved ? "Saved" : "Saves when you click away"}
      </p>
    </div>
  );
}
