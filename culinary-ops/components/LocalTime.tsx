"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  datetime: {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  date: { year: "numeric", month: "short", day: "numeric" },
};

// Timestamps formatted during server render come out in the server's timezone
// (UTC in production) and read wrong to users. This renders a deterministic
// UTC string on the server, then re-formats in the browser's own timezone
// after mount — no hydration mismatch, correct local time a frame later.
export function LocalTime({
  date,
  mode = "datetime",
}: {
  date: Date | string;
  mode?: "datetime" | "date";
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const text = d.toLocaleString(
    "en-US",
    hydrated ? FORMATS[mode] : { ...FORMATS[mode], timeZone: "UTC" },
  );
  return <time dateTime={d.toISOString()}>{text}</time>;
}
