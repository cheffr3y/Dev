import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DayHeadContent,
  ScheduleColgroup,
  ShiftCellContent,
  type DayLite,
  type ShiftLite,
} from "./schedule-ui";

const weekday: DayLite = { iso: "2026-07-13", short: "Mon", dayNum: 13, weekend: false };
const weekend: DayLite = { iso: "2026-07-18", short: "Sat", dayNum: 18, weekend: true };

function working(overrides: Partial<ShiftLite> = {}): ShiftLite {
  return { cookId: "a", date: "2026-07-13", kind: "WORKING", start: "08:00", end: "16:00", role: null, note: null, ...overrides };
}

// ── empty-cell behavior ─────────────────────────────────────────────────────
test("ShiftCellContent: an empty cell renders nothing (no dots/placeholders)", () => {
  const html = renderToStaticMarkup(<ShiftCellContent shift={null} defaultRole={null} variant="print" />);
  assert.equal(html, "");
});

// ── OFF state ───────────────────────────────────────────────────────────────
test("ShiftCellContent: OFF renders an OFF marker, not hours", () => {
  const html = renderToStaticMarkup(<ShiftCellContent shift={working({ kind: "OFF", start: null, end: null })} defaultRole={null} variant="print" />);
  assert.match(html, /Off/);
});

// ── working shift: time + station rules ─────────────────────────────────────
test("ShiftCellContent: working shift shows the compact time range", () => {
  const html = renderToStaticMarkup(<ShiftCellContent shift={working()} defaultRole={null} variant="print" />);
  assert.match(html, /8a–4p/);
});

test("ShiftCellContent: station line only when it differs from the default", () => {
  const same = renderToStaticMarkup(<ShiftCellContent shift={working({ role: "Grill" })} defaultRole="grill" variant="print" />);
  assert.doesNotMatch(same, /Grill/); // redundant with default → hidden
  const diff = renderToStaticMarkup(<ShiftCellContent shift={working({ role: "Expo" })} defaultRole="Grill" variant="print" />);
  assert.match(diff, /Expo/);
});

// ── print vs screen class behavior ──────────────────────────────────────────
test("ShiftCellContent: screen variant gets the inset panel, print stays flat", () => {
  const screen = renderToStaticMarkup(<ShiftCellContent shift={working()} defaultRole={null} variant="screen" />);
  assert.match(screen, /sched-fill-active/);
  const print = renderToStaticMarkup(<ShiftCellContent shift={working()} defaultRole={null} variant="print" />);
  assert.doesNotMatch(print, /sched-fill-active/);
});

// ── weekend treatment ───────────────────────────────────────────────────────
test("DayHeadContent: weekend uses the gold accent, weekday does not", () => {
  assert.match(renderToStaticMarkup(<DayHeadContent day={weekend} />), /text-gold/);
  assert.doesNotMatch(renderToStaticMarkup(<DayHeadContent day={weekday} />), /text-gold/);
});

// ── fixed column proportions ────────────────────────────────────────────────
test("ScheduleColgroup: seven equal day columns between cook and hours", () => {
  const days: DayLite[] = Array.from({ length: 7 }, (_, i) => ({
    iso: `2026-07-1${i}`,
    short: "Mon",
    dayNum: i,
    weekend: i >= 5,
  }));
  const html = renderToStaticMarkup(
    <table>
      <ScheduleColgroup days={days} />
    </table>,
  );
  const dayCols = (html.match(/--sched-col-day/g) ?? []).length;
  assert.equal(dayCols, 7);
  assert.match(html, /--sched-col-cook/);
  assert.match(html, /--sched-col-hrs/);
});
