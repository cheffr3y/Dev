"use client";

import { useEffect, useRef } from "react";

export function PrintButton({ label = "Print", autoPrint = false, disabled = false, className = "" }: { label?: string; autoPrint?: boolean; disabled?: boolean; className?: string }) {
  const printed = useRef(false);
  useEffect(() => {
    if (!autoPrint) { printed.current = false; return; }
    if (disabled) return;
    let cancelled = false;
    // Wait for the complete packet and local fonts before opening the dialog.
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      if (cancelled || printed.current) return;
      printed.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("print");
      window.history.replaceState(null, "", url);
      window.print();
    }));
    return () => { cancelled = true; };
  }, [autoPrint, disabled]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className={`no-print inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-medium tracking-wide text-ink transition-colors hover:border-ink disabled:opacity-50 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
