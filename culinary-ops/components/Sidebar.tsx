"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

type NavItem = { href: string; label: string; icon: string };

const SECTIONS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Operations",
    items: [
      { href: "/", label: "Dashboard", icon: "▦" },
      { href: "/recipes", label: "Recipes & Builds", icon: "🍽" },
      { href: "/events", label: "Events", icon: "📅" },
    ],
  },
  {
    heading: "Supply",
    items: [
      { href: "/inventory", label: "Inventory", icon: "📦" },
      { href: "/order-guides", label: "Order Guides", icon: "📝" },
      { href: "/items", label: "Catalog", icon: "🥕" },
      { href: "/vendors", label: "Vendors", icon: "🚚" },
    ],
  },
];

const ADMIN_SECTION: { heading: string; items: NavItem[] } = {
  heading: "Admin",
  items: [
    { href: "/venues", label: "Venues", icon: "🏠" },
    { href: "/admin/users", label: "Users", icon: "👤" },
  ],
};

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
    <nav className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.heading}>
          <p className="mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.04em] text-white/50">
            {section.heading}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive(item.href)
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="w-5 text-center text-base leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
