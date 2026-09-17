"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Brand } from "./Brand";
import { cn } from "./ui";

const noopSubscribe = () => () => {};

// Mobile nav: a hamburger that slides the charcoal sidebar in from the left.
// The desktop sidebar stays hidden on small screens, so this is the only way
// to reach the nav there. The drawer stays mounted so it can animate both
// open and close; `inert` keeps it out of the tab order while hidden. It is
// portaled to <body> because the header's backdrop-blur makes the header the
// containing block for fixed descendants, which would clip the overlay.
export function MobileNav({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on navigation so tapping a link dismisses the drawer (state
  // adjusted during render, per the React "derive state from props" pattern).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // While open: lock body scroll, close on Escape, keep Tab inside the panel.
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables =
        panelRef.current.querySelectorAll<HTMLElement>("a[href], button");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = triggerRef.current;
    panelRef.current?.focus();
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="-ml-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-zinc-600 hover:bg-stone hover:text-ink md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-5 w-5"
        >
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      {mounted &&
        createPortal(
          <div
            className={cn(
              "fixed inset-0 z-50 transition-[visibility] duration-200 motion-reduce:transition-none md:hidden",
              open ? "visible" : "invisible delay-200 motion-reduce:delay-0",
            )}
            aria-hidden={!open}
            inert={!open}
          >
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              tabIndex={-1}
              className={cn(
                "absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none",
                open ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              ref={panelRef}
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              tabIndex={-1}
              className={cn(
                "relative flex h-full w-72 max-w-[85vw] flex-col bg-charcoal shadow-2xl outline-none transition-transform duration-200 ease-out motion-reduce:transition-none",
                "pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] pr-3",
                open ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <div className="mb-6 flex items-center justify-between border-b border-white/10 px-2 pb-5">
                <Brand />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <Sidebar role={role} onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
