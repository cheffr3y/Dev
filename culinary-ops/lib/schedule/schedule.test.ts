import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTotals,
  fmtHours,
  fmtTimeRange,
  isoWeekNumber,
  shiftHours,
  startOfUtcWeek,
  weekNumberLabel,
} from "./schedule";

// ── shiftHours ──────────────────────────────────────────────────────────────
test("shiftHours: a normal daytime shift", () => {
  assert.equal(shiftHours("08:00", "16:00"), 8);
  assert.equal(shiftHours("09:30", "17:00"), 7.5);
});

test("shiftHours: overnight shift wraps past midnight", () => {
  assert.equal(shiftHours("18:00", "02:00"), 8);
  assert.equal(shiftHours("22:00", "06:30"), 8.5);
});

test("shiftHours: equal start/end reads as a full 24h overnight", () => {
  assert.equal(shiftHours("09:00", "09:00"), 24);
});

test("shiftHours: missing or invalid bounds contribute zero", () => {
  assert.equal(shiftHours(null, "16:00"), 0);
  assert.equal(shiftHours("08:00", null), 0);
  assert.equal(shiftHours(undefined, undefined), 0);
  assert.equal(shiftHours("25:00", "16:00"), 0);
  assert.equal(shiftHours("8am", "4pm"), 0);
});

// ── computeTotals ───────────────────────────────────────────────────────────
test("computeTotals: sums per-day, per-cook, and the week", () => {
  const cooks = [{ id: "a" }, { id: "b" }];
  const days = [{ iso: "2026-07-13" }, { iso: "2026-07-14" }];
  const shifts: Record<string, { start: string | null; end: string | null }> = {
    "a|2026-07-13": { start: "08:00", end: "16:00" }, // 8
    "a|2026-07-14": { start: "08:00", end: "12:00" }, // 4
    "b|2026-07-13": { start: "16:00", end: "22:00" }, // 6
  };
  const { dayTotals, cookTotals, weekTotal } = computeTotals(
    cooks,
    days,
    (id, iso) => shifts[`${id}|${iso}`] ?? null,
  );
  assert.deepEqual(dayTotals, [14, 4]);
  assert.equal(cookTotals.get("a"), 12);
  assert.equal(cookTotals.get("b"), 6);
  assert.equal(weekTotal, 18);
});

test("computeTotals: OFF shifts (no start/end) add no hours", () => {
  const cooks = [{ id: "a" }];
  const days = [{ iso: "2026-07-13" }];
  const { dayTotals, cookTotals, weekTotal } = computeTotals(
    cooks,
    days,
    () => ({ start: null, end: null }), // an OFF marker
  );
  assert.deepEqual(dayTotals, [0]);
  assert.equal(cookTotals.get("a"), 0);
  assert.equal(weekTotal, 0);
});

// ── formatting ──────────────────────────────────────────────────────────────
test("fmtHours: trims trailing .0 but keeps halves", () => {
  assert.equal(fmtHours(8), "8");
  assert.equal(fmtHours(7.5), "7.5");
  assert.equal(fmtHours(0), "0");
});

test("fmtTimeRange: compact am/pm range, tolerant of one side", () => {
  assert.equal(fmtTimeRange("08:00", "16:00"), "8a–4p");
  assert.equal(fmtTimeRange("09:30", "17:00"), "9:30a–5p");
  assert.equal(fmtTimeRange("08:00", null), "8a");
});

// ── ISO week number ─────────────────────────────────────────────────────────
test("isoWeekNumber: known Mondays map to the right ISO week", () => {
  // 2026-07-13 is a Monday in ISO week 29.
  assert.equal(isoWeekNumber(startOfUtcWeek(new Date("2026-07-13T00:00:00.000Z"))), 29);
  // 2026-01-01 is a Thursday → ISO week 1.
  assert.equal(isoWeekNumber(startOfUtcWeek(new Date("2026-01-01T00:00:00.000Z"))), 1);
  // 2025-12-29 (Mon) starts ISO week 1 of 2026.
  assert.equal(isoWeekNumber(startOfUtcWeek(new Date("2025-12-29T00:00:00.000Z"))), 1);
});

test("weekNumberLabel: formats as 'Week N'", () => {
  assert.equal(weekNumberLabel(startOfUtcWeek(new Date("2026-07-13T00:00:00.000Z"))), "Week 29");
});
