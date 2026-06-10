"use client";

import { useRef } from "react";
import { selectVenue } from "@/lib/venue-actions";

type Venue = { id: string; name: string; code: string };

export function VenueSwitcher({
  venues,
  activeId,
}: {
  venues: Venue[];
  activeId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (venues.length === 0) return null;

  return (
    <form ref={formRef} action={selectVenue} className="flex items-center gap-2">
      <span className="text-xs text-zinc-400">Venue</span>
      <select
        name="venueId"
        defaultValue={activeId ?? venues[0].id}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-800 focus:border-zinc-500 focus:outline-none"
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({v.code})
          </option>
        ))}
      </select>
    </form>
  );
}
