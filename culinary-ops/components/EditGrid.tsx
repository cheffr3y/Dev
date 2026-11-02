"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
// Refresh aggregates only after leaving the grid; typing and Tab retain focus.
export function EditGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  const router = useRouter(), root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div ref={root} data-edit-grid className={className} onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    // Cell saves invalidate future reads. Refresh once the last request settles.
    const check = () => {
      if (!root.current || root.current.contains(document.activeElement)) return;
      if (root.current.querySelector('[aria-busy="true"], input[readonly]')) { timer.current = setTimeout(check, 150); return; }
      if (!root.current.querySelector('[aria-invalid="true"], [data-unsaved="true"]')) router.refresh();
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(check, 100);
  }}>{children}</div>;
}
