import Link from "next/link";
import { cn } from "./ui";

// The sidebar shows a single "Events" entry; this strip fans out to the three
// event types. Each index page passes its own key, so no client JS is needed.
const TABS = [
  { key: "events", label: "Events", href: "/events" },
  { key: "banquets", label: "Banquets", href: "/banquets" },
  { key: "festivals", label: "Festivals", href: "/festivals" },
] as const;

export function EventsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav
      aria-label="Event types"
      className="no-print -mt-4 mb-6 inline-flex gap-1 rounded-full border border-hairline bg-canvas p-1"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm transition-colors",
            tab.key === current
              ? "bg-charcoal font-medium text-white"
              : "text-zinc-600 hover:bg-stone hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
