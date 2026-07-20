"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./ui";

type IconKey =
  | "dashboard"
  | "schedule"
  | "recipes"
  | "events"
  | "banquets"
  | "festivals"
  | "prep"
  | "inventory"
  | "orders"
  | "catalog"
  | "vendors"
  | "venues"
  | "users"
  | "trivia";

type NavItem = { href: string; label: string; icon: IconKey };

const SECTIONS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Operations",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/schedule", label: "Schedule", icon: "schedule" },
      { href: "/recipes", label: "Recipes & Builds", icon: "recipes" },
      { href: "/banquets", label: "Banquets", icon: "banquets" },
      { href: "/events", label: "Events", icon: "events" },
      { href: "/festivals", label: "Festivals", icon: "festivals" },
      { href: "/prep-orders", label: "Prep Orders", icon: "prep" },
    ],
  },
  {
    heading: "Supply",
    items: [
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/order-guides", label: "Order Guides", icon: "orders" },
      { href: "/items", label: "Catalog", icon: "catalog" },
      { href: "/vendors", label: "Vendors", icon: "vendors" },
    ],
  },
  {
    heading: "Break Room",
    items: [{ href: "/trivia", label: "Trivia", icon: "trivia" }],
  },
];

const ADMIN_SECTION: { heading: string; items: NavItem[] } = {
  heading: "Admin",
  items: [
    { href: "/venues", label: "Venues", icon: "venues" },
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
    banquets: (
      <>
        <path d="M3 18h18" />
        <path d="M5 18a7 7 0 0 1 14 0" />
        <path d="M12 7V4M10.5 4h3" />
      </>
    ),
    festivals: (
      <>
        <path d="M12 3 3 17h18L12 3Z" />
        <path d="M12 3v14M3 17l3 4M21 17l-3 4" />
      </>
    ),
    prep: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 11h8M8 15h5" />
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
    trivia: (
      <>
        <path d="M9 9a3 3 0 1 1 4 2.8c-.9.3-1 1-1 1.7" />
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 17h.01" />
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

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const sections = [...SECTIONS];
  if (role === "ADMIN" || role === "MANAGER") {
    const items = role === "ADMIN" ? ADMIN_SECTION.items : ADMIN_SECTION.items.filter((i) => i.href === "/venues");
    sections.push({ heading: ADMIN_SECTION.heading, items });
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-7">
      {sections.map((section) => (
        <div key={section.heading}>
          <p className="mb-2.5 px-3 text-[10px] uppercase tracking-[0.2em] text-white/35">
            {section.heading}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/10 font-medium text-white"
                        : "text-white/55 hover:bg-white/5 hover:text-white/90",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-gold" />
                    )}
                    <span className={active ? "text-gold-soft" : "text-white/45 group-hover:text-white/70"}>
                      <Icon name={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
