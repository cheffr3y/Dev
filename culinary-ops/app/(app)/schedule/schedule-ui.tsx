// Shared, presentation-only schedule primitives.
//
// These components are deliberately "universal" — no hooks, no client-only or
// server-only APIs — so the *same* markup renders in three places: the editor
// grid, the posted (read-only) view (both in the client <ScheduleGrid>), and
// the server-rendered print sheet. Keeping the cell/header/footer rendering
// here is what stops the posted and printed views from drifting apart.

import { cn } from "@/components/ui";
import { fmtTimeRange } from "@/lib/schedule";

// ── Shared row/day shapes ──────────────────────────────────────────────────
export type CookLite = { id: string; name: string; role: string | null };
export type ShiftLite = {
  cookId: string;
  date: string; // YYYY-MM-DD
  kind: "WORKING" | "OFF";
  start: string | null;
  end: string | null;
  role: string | null;
  note: string | null;
};
export type DayLite = {
  iso: string;
  short: string; // "Mon"
  dayNum: number; // 20
  weekend: boolean;
};

// ── Fixed column proportions ───────────────────────────────────────────────
// A single <colgroup> drives cook / day / hours widths for every view, so the
// seven day columns are always exactly equal and neither the cook nor hours
// column stretches to fit content. Widths come from the --sched-* tokens.
export function ScheduleColgroup({ days }: { days: DayLite[] }) {
  return (
    <colgroup>
      <col style={{ width: "var(--sched-col-cook)" }} />
      {days.map((d) => (
        <col key={d.iso} style={{ width: "var(--sched-col-day)" }} />
      ))}
      <col style={{ width: "var(--sched-col-hrs)" }} />
    </colgroup>
  );
}

// ── Day header: small uppercase weekday over a stronger date number ─────────
export function DayHeadContent({ day }: { day: DayLite }) {
  return (
    <>
      <span
        className={cn(
          "block font-mono text-[10px] font-medium uppercase leading-none tracking-[0.14em]",
          day.weekend ? "text-gold" : "text-zinc-500",
        )}
      >
        {day.short}
      </span>
      <span className="mt-1 block font-display text-[15px] leading-none text-ink">{day.dayNum}</span>
    </>
  );
}

// ── Employee anchor cell: name over optional default station ────────────────
export function EmployeeCellContent({ cook }: { cook: CookLite }) {
  return (
    <>
      <span className="block font-medium leading-tight text-ink">{cook.name}</span>
      {cook.role && (
        <span className="mt-0.5 block text-[11px] leading-tight text-zinc-500">{cook.role}</span>
      )}
    </>
  );
}

// A per-shift station only earns a line when it actually differs from the
// cook's default station shown under their name — otherwise it's just noise.
function stationDiffers(shiftRole: string | null, defaultRole: string | null): string | null {
  const r = shiftRole?.trim();
  if (!r) return null;
  if (r.toLowerCase() === (defaultRole ?? "").trim().toLowerCase()) return null;
  return r;
}

// ── Shift cell contents ─────────────────────────────────────────────────────
// Returns null for an unscheduled cell so each view can decide what "empty"
// looks like (editor hover affordance vs. a blank posted/print cell).
export function ShiftCellContent({
  shift,
  defaultRole,
  variant,
}: {
  shift: ShiftLite | null;
  defaultRole: string | null;
  variant: "screen" | "print";
}) {
  if (!shift) return null;

  if (shift.kind === "OFF") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Off</span>
        {shift.note && <span className="text-[11px] leading-snug text-zinc-400">{shift.note}</span>}
      </span>
    );
  }

  const station = stationDiffers(shift.role, defaultRole);
  const inner = (
    <span className="flex flex-col items-center gap-0.5">
      <span className="font-semibold tabular-nums leading-none text-ink">
        {fmtTimeRange(shift.start, shift.end) || "—"}
      </span>
      {station && <span className="text-[11px] leading-snug text-gold">{station}</span>}
      {shift.note && <span className="text-[11px] leading-snug text-zinc-500">{shift.note}</span>}
    </span>
  );

  // On screen a working shift gets a restrained inset panel so it reads as the
  // clearest thing in the grid; print stays flat for crisp grayscale output.
  if (variant === "screen") {
    return (
      <span className="sched-fill-active inline-flex flex-col items-center rounded-[5px] px-2 py-1">
        {inner}
      </span>
    );
  }
  return inner;
}

// ── Print footer ────────────────────────────────────────────────────────────
export function PrintFooter({
  venueName,
  weekRange,
  productName = "Mise — Culinary Ops",
}: {
  venueName: string;
  weekRange: string;
  productName?: string;
}) {
  const printed = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <p className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[--sched-border] pt-2 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
      <span>
        {venueName} · {weekRange}
      </span>
      <span>
        Printed {printed} · {productName}
      </span>
    </p>
  );
}
