// Shared date math for the banquet week views (week prep, weekly shopping
// list, weekly cook packet). Banquet dates are stored at UTC midnight, so
// weeks are computed and formatted in UTC to keep the day stable everywhere.

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

// Parse a YYYY-MM-DD route param into a UTC-midnight date, rejecting anything
// malformed or out of range (e.g. 2026-02-31).
export function dateFromParam(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return isoDate(d) === raw ? d : null;
}

// Monday of the week containing `d`.
export function startOfUtcWeek(d: Date): Date {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtWeekRange(start: Date): string {
  return `${fmtShortDate(start)} - ${fmtShortDate(addDays(start, 6))}, ${start.getUTCFullYear()}`;
}
