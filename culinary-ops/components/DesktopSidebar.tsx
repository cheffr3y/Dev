"use client";

import { useSyncExternalStore } from "react";
import { Brand } from "./Brand";
import { Sidebar } from "./Sidebar";
import { cn } from "./ui";

const STORAGE_KEY = "mise-sidebar-collapsed";
let collapsedFallback = false;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("mise-sidebar-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("mise-sidebar-change", callback);
  };
}

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return collapsedFallback;
  }
}

export function DesktopSidebar({ role }: { role: string }) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  function toggle() {
    collapsedFallback = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, String(!collapsed));
    } catch {
      // Keep the control usable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event("mise-sidebar-change"));
  }

  return (
    <aside className={cn(
      "no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-white/5 bg-charcoal transition-[width] duration-200 motion-reduce:transition-none md:flex",
      collapsed ? "w-[72px]" : "w-60",
    )}>
      <div className={cn("flex h-24 shrink-0 items-center", collapsed ? "justify-center" : "px-6")}>
        <Brand compact={collapsed} />
      </div>
      <div id="desktop-navigation" className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
        <Sidebar role={role} collapsed={collapsed} />
      </div>
      <div className="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="desktop-navigation"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("flex min-h-11 w-full items-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold", collapsed ? "justify-center" : "gap-3 px-3")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
          </svg>
          {!collapsed && <span className="whitespace-nowrap text-xs">Collapse sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
