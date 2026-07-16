// Weekly kitchen schedule — shared date math, time formatting, and hour totals.
// Weeks are Monday-anchored and computed in UTC, matching how Banquets store
// and bucket their dates (a date stored as YYYY-MM-DDT00:00:00.000Z reads back
// on the same calendar day regardless of the server's local zone).

const DAY_MS = 24 * 60 * 60 * 1000;

// Mon–Sun, in posting order. `idx` is the day offset from the week's Monday.
export const WEEKDAYS = [
  { idx: 0, key: "mon", short: "Mon", long: "Monday" },
  { idx: 1, key: "tue", short: "Tue", long: "Tuesday" },
  { idx: 2, key: "wed", short: "Wed", long: "Wednesday" },
  { idx: 3, key: "thu", short: "Thu", long: "Thursday" },
  { idx: 4, key: "fri", short: "Fri", long: "Friday" },
  { idx: 5, key: "sat", short: "Sat", long: "Saturday" },
  { idx: 6, key: "sun", short: "Sun", long: "Sunday" },
] as const;

// Suggested stations for the role field (free text — this is only a datalist).
export const ROLE_SUGGESTIONS = [
  "Lead",
  "Line",
  "Prep",
  "Grill",
  "Sauté",
  "Fry",
  "Garde Manger",
  "Pantry",
  "Expo",
  "Dish",
  "Baker",
] as const;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

// Parse a strict YYYY-MM-DD into a UTC-midnight Date, rejecting anything else
// (including impossible dates like 2024-02-30 that Date would roll over).
export function dateFromParam(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return isoDate(d) === raw ? d : null;
}

// The Monday (UTC midnight) that starts the week containing `d`.
export function startOfUtcWeek(d: Date): Date {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = start.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function thisWeekStart(): Date {
  return startOfUtcWeek(new Date());
}

// The seven UTC-midnight days of the week starting at `weekStart`.
export function weekDays(weekStart: Date): Date[] {
  return WEEKDAYS.map((w) => addDays(weekStart, w.idx));
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getUTCMonth() === end.getUTCMonth();
  const startLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endLabel = end.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${startLabel} – ${endLabel}, ${end.getUTCFullYear()}`;
}

// ISO-8601 week number (1–53). Weeks are Monday-anchored — matching this app's
// week model — and the week owning the year's first Thursday is week 1.
export function isoWeekNumber(weekStart: Date): number {
  // weekStart is already a Monday; shift to that week's Thursday and count
  // whole weeks from the first Thursday of that ISO year.
  const thursday = addDays(weekStart, 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = (() => {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dow = jan1.getUTCDay() || 7; // Mon=1 … Sun=7
    // The Thursday of the ISO week containing Jan 1.
    return addDays(jan1, 4 - dow);
  })();
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}

// Compact uppercase label for the header, e.g. "Week 30".
export function weekNumberLabel(weekStart: Date): string {
  return `Week ${isoWeekNumber(weekStart)}`;
}

// "HH:MM" (24h) → a compact posted-schedule label, e.g. "8a", "4:30p", "12p".
export function fmtTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const hour = Number(m[1]);
  const min = Number(m[2]);
  if (hour > 23 || min > 59) return hhmm;
  const suffix = hour < 12 ? "a" : "p";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
}

export function fmtTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = fmtTime(start);
  const e = fmtTime(end);
  if (s && e) return `${s}–${e}`;
  return s || e || "";
}

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hour = Number(m[1]);
  const min = Number(m[2]);
  if (hour > 23 || min > 59) return null;
  return hour * 60 + min;
}

// Length of a shift in hours. An end at/before the start is read as overnight
// (e.g. 18:00 → 02:00 = 8h). Returns 0 when either bound is missing/invalid.
export function shiftHours(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s == null || e == null) return 0;
  const span = e <= s ? e + 24 * 60 - s : e - s;
  return span / 60;
}

// Trim to at most one decimal without a trailing ".0" — "8", "7.5".
export function fmtHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString();
}

// The minimum a cell needs for totals: start/end drive hours; OFF and blanks
// contribute nothing. Kept structural so both the grid and print pass the same
// records in and read the same numbers out.
type HourSource = { start?: string | null; end?: string | null } | null | undefined;

// One pass over the week produces every total the schedule shows: per-day
// (the footer row), per-cook (the Hrs column), and the grand weekly total.
// Both the editor grid and the print sheet call this so their numbers can never
// drift apart. `shiftFor(cookId, iso)` returns that cell's shift, or null.
export function computeTotals<C extends { id: string }, D extends { iso: string }>(
  cooks: C[],
  days: D[],
  shiftFor: (cookId: string, iso: string) => HourSource,
): { dayTotals: number[]; cookTotals: Map<string, number>; weekTotal: number } {
  const dayTotals = days.map((d) =>
    cooks.reduce((sum, c) => sum + shiftHours(shiftFor(c.id, d.iso)?.start, shiftFor(c.id, d.iso)?.end), 0),
  );
  const cookTotals = new Map(
    cooks.map((c) => [
      c.id,
      days.reduce((sum, d) => sum + shiftHours(shiftFor(c.id, d.iso)?.start, shiftFor(c.id, d.iso)?.end), 0),
    ]),
  );
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);
  return { dayTotals, cookTotals, weekTotal };
}
