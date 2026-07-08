// The workbook's yellow/gray convention, as shared class constants: amber
// cells are where the chef types, gray cells are calculated, and the key
// results (Final Prep, Order) read bold. Keep every festival table on these
// so the worksheet teaches itself.

export const INPUT_CELL =
  "rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-amber-400 focus:outline-none";
export const CALC_CELL = "text-zinc-600 tabular-nums";
export const RESULT_CELL = "font-semibold tabular-nums text-ink";

// One-line legend under worksheet headers.
export function WorksheetLegend() {
  return (
    <p className="no-print flex items-center gap-4 text-xs text-zinc-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-amber-200 bg-amber-50" /> you type
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-zinc-200 bg-zinc-100" /> calculated
      </span>
    </p>
  );
}
