"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-full border border-hairline bg-transparent px-5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
    >
      🖨 {label}
    </button>
  );
}
