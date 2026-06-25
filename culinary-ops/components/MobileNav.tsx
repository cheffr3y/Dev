"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

// Mobile nav: a hamburger that slides the charcoal sidebar in from the left.
// The desktop sidebar stays hidden on small screens, so this is the only way
// to reach the nav there.
export function MobileNav({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation so tapping a link dismisses the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll + allow Escape to close while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="-ml-1 rounded-md p-2 text-zinc-600 hover:bg-stone hover:text-ink md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
          />
          <div className="relative flex h-full w-64 max-w-[80vw] flex-col bg-charcoal px-3 py-5 shadow-2xl">
            <div className="mb-9 flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-stone font-display text-lg text-charcoal">
                  M
                </div>
                <div>
                  <p className="font-display text-base leading-none text-white">Mise</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">Culinary Ops</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar role={role} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
