"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

// Sub-nav for one festival: the plan-to-order flow left to right.
export function FestivalTabs({ festivalId }: { festivalId: string }) {
  const pathname = usePathname();
  const base = `/festivals/${festivalId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/menu`, label: "Menu & Forecast" },
    { href: `${base}/builds`, label: "Builds" },
    { href: `${base}/accounting`, label: "Accounting" },
    { href: `${base}/recipe-guide`, label: "Recipe Guide" },
    { href: `${base}/prep-sheet`, label: "Prep Sheet" },
    { href: `${base}/order-guide`, label: "Order Guide" },
    { href: `${base}/proposal`, label: "Proposal" },
  ];

  return (
    <nav className="no-print mb-6 flex flex-wrap gap-1 border-b border-hairline">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
              active
                ? "border-gold font-medium text-ink"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
