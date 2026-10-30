"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { cn } from "./ui";

type IconKey =
  | "dashboard"
  | "schedule"
  | "recipes"
  | "events"
  | "prep"
  | "production"
  | "reports"
  | "inventory"
  | "orders"
  | "catalog"
  | "vendors"
  | "venues"
  | "users";

type NavItem = { href: string; label: string; icon: IconKey; adminOnly?: boolean };
type NavSection = { heading: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    heading: "Operations",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/prep-orders", label: "Prep Orders", icon: "prep" },
      { href: "/production", label: "Production", icon: "production" },
      { href: "/schedule", label: "Schedule", icon: "schedule" },
    ],
  },
  {
    heading: "Culinary & Events",
    items: [
      { href: "/recipes", label: "Recipes", icon: "recipes" },
      { href: "/menus", label: "Menus", icon: "recipes" },
      { href: "/banquets", label: "Banquets", icon: "events" },
      { href: "/events", label: "Events", icon: "events" },
      { href: "/festivals", label: "Festivals", icon: "events" },
      { href: "/to-go", label: "To-Go", icon: "orders" },
    ],
  },
  {
    heading: "Purchasing & Accounting",
    items: [
      { href: "/items", label: "Items", icon: "catalog" },
      { href: "/vendors", label: "Vendors", icon: "vendors" },
      { href: "/order-guides", label: "Order Guides", icon: "orders" },
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/prep-orders/report", label: "Prep Reports", icon: "reports", adminOnly: true },
    ],
  },
];

const ADMIN_SECTION: NavSection = {
  heading: "Admin",
  items: [
    { href: "/venues", label: "Venues & Rooms", icon: "venues" },
    { href: "/admin/users", label: "Users", icon: "users" },
  ],
};

function Icon({ name }: { name: IconKey }) {
  const paths: Record<IconKey, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    schedule: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <path d="M12 13v3l2 1" />
      </>
    ),
    recipes: (
      <>
        <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4Z" />
        <path d="M8 8h7M8 12h7" />
      </>
    ),
    events: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </>
    ),
    prep: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </>
    ),
    production: (
      <>
        <path d="M4 7h16v13H4zM8 7V3h8v4M8 12h8M8 16h5" />
      </>
    ),
    reports: (
      <>
        <path d="M4 3h16v18H4zM8 16v-4M12 16V8M16 16v-6" />
      </>
    ),
    inventory: (
      <>
        <path d="M3 7l9-4 9 4-9 4-9-4Z" />
        <path d="M3 7v10l9 4 9-4V7" />
        <path d="M12 11v10" />
      </>
    ),
    orders: (
      <>
        <path d="M8 3h8l1 4H7l1-4Z" />
        <path d="M5 7h14l-1 13H6L5 7Z" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    catalog: (
      <>
        <path d="M6 3v12l-2 6h16l-2-6V3" />
        <path d="M6 3h12M9 7h6" />
      </>
    ),
    vendors: (
      <>
        <path d="M3 8h11v8H3z" />
        <path d="M14 11h4l3 3v2h-7" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17" cy="18" r="1.6" />
      </>
    ),
    venues: (
      <>
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    users: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

export function Sidebar({ role, collapsed = false, onNavigate }: { role: string; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => !item.adminOnly || role === "ADMIN"),
  }));
  if (role === "ADMIN" || role === "MANAGER") {
    const items = role === "ADMIN" ? ADMIN_SECTION.items : ADMIN_SECTION.items.filter((i) => i.href === "/venues");
    sections.push({ heading: ADMIN_SECTION.heading, items });
  }

  const matchesPath = (p: string) => pathname === p || pathname.startsWith(p + "/");
  // The most specific destination wins: Reports must not also light Prep Orders.
  const activeHref = sections.flatMap(section => section.items)
    .filter(item => item.href === "/" ? pathname === "/" : matchesPath(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-2">
      {sections.map((section) => (
        <SidebarSection key={`${section.heading}:${pathname}`} section={section} collapsed={collapsed} activeHref={activeHref} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function SidebarSection({ section, collapsed, activeHref, onNavigate }: {
  section: NavSection; collapsed: boolean; activeHref?: string; onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const listId = useId();
  return (
    <section aria-label={section.heading} className="border-t border-white/10 pt-2 first:border-0 first:pt-0">
      {collapsed ? <h2 className="sr-only">{section.heading}</h2> : (
        <h2>
          <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}
            className="flex min-h-10 w-full items-center justify-between gap-1 rounded-md px-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-white/60 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-focus md:min-h-8">
            {section.heading}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
        </h2>
      )}
      <ul id={listId} hidden={!collapsed && !open} className="space-y-0.5">
        {section.items.map((item) => {
          const active = activeHref === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex min-h-11 items-center rounded-md text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus md:min-h-8",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  active
                    ? "bg-white/10 font-medium text-white ring-1 ring-inset ring-white/10"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-focus" />
                )}
                <span
                  className={cn(
                    "shrink-0 transition-colors",
                    active ? "text-gold-soft" : "text-white/45 group-hover:text-white/70",
                  )}
                >
                  <Icon name={item.icon} />
                </span>
                <span className={collapsed ? "sr-only" : "whitespace-nowrap"}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
