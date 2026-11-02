"use client";
import { cn } from "@/components/ui";
import { ShiftCellContent, type CookLite, type DayLite, type ShiftLite } from "./schedule-ui";
// ── One grid cell ───────────────────────────────────────────────────────────
export function ShiftCell({
  cook,
  day,
  shift,
  canEdit,
  onOpen,
}: {
  cook: CookLite;
  day: DayLite;
  shift: ShiftLite | null;
  canEdit: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const base = "flex min-h-[3.25rem] w-full items-center justify-center px-1.5 py-2 text-center";

  // Posted / read-only: a working shift or OFF renders; an empty cell is blank.
  if (!canEdit) {
    return (
      <div className={base}>
        <ShiftCellContent shift={shift} defaultRole={cook.role} variant="screen" />
      </div>
    );
  }

  // Editor: the whole cell is a button. Empty cells stay quiet until hover/focus.
  const label = shift
    ? `Edit ${cook.name}'s shift on ${day.short} ${day.dayNum}`
    : `Add a shift for ${cook.name} on ${day.short} ${day.dayNum}`;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(
        base,
        "group/cell cursor-pointer rounded-[4px] transition-colors hover:bg-[--sched-fill-active] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
      )}
    >
      {shift ? (
        <ShiftCellContent shift={shift} defaultRole={cook.role} variant="screen" />
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-transparent transition-colors group-hover/cell:text-zinc-400 group-focus-visible/cell:text-zinc-400">
          Add shift
        </span>
      )}
    </button>
  );
}

