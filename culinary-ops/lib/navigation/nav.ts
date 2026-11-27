// The app's navigation: a short list of jobs in the sidebar, each opening its
// first page; the pages inside a job show as tabs across the top.

export type Role = "ADMIN" | "MANAGER" | "STAFF";
export type NavIcon = "today" | "kitchen" | "recipes" | "events" | "ordering" | "cleanup" | "admin";
export type NavPage = { href: string; label: string; adminOnly?: boolean; managerOnly?: boolean };
export type NavGroup = { key: string; label: string; icon: NavIcon; pages: NavPage[]; adminOnly?: boolean; managerOnly?: boolean; footer?: boolean };

export const NAV: NavGroup[] = [
  { key: "today", label: "Today", icon: "today", pages: [{ href: "/", label: "Today" }] },
  {
    key: "kitchen", label: "Kitchen", icon: "kitchen", pages: [
      { href: "/prep-orders", label: "Daily prep" },
      { href: "/production", label: "Production" },
      { href: "/smoking", label: "Smoking" },
      { href: "/schedule", label: "Schedule" },
      { href: "/prep-orders/report", label: "Prep reports", adminOnly: true },
    ],
  },
  {
    key: "recipes", label: "Recipes & Menus", icon: "recipes", pages: [
      { href: "/recipes", label: "Recipes" },
      { href: "/specials", label: "Specials" },
      { href: "/menus", label: "Menus" },
      { href: "/to-go", label: "Home Meal Replacement" },
    ],
  },
  {
    key: "events", label: "Events", icon: "events", pages: [
      { href: "/custom-menus", label: "Custom Menus" },
      { href: "/banquets", label: "Banquets" },
      { href: "/events", label: "Events" },
      { href: "/festivals", label: "Festivals" },
    ],
  },
  {
    key: "ordering", label: "Ordering", icon: "ordering", pages: [
      { href: "/invoices", label: "Invoices", managerOnly: true },
      { href: "/items", label: "Ingredients" },
      { href: "/vendors", label: "Vendors" },
      { href: "/operating-calendar", label: "Monthly Tracker", managerOnly: true },
    ],
  },
  { key: "cleanup", label: "Cleanup", icon: "cleanup", pages: [{ href: "/cleanup", label: "Cleanup" }] },
  {
    key: "admin", label: "Admin", icon: "admin", managerOnly: true, footer: true, pages: [
      { href: "/venues", label: "Venues & Rooms" },
      { href: "/admin/users", label: "Users", adminOnly: true },
    ],
  },
];

function allowed(entry: { adminOnly?: boolean; managerOnly?: boolean }, role: string) {
  if (entry.adminOnly) return role === "ADMIN";
  if (entry.managerOnly) return role === "ADMIN" || role === "MANAGER";
  return true;
}

export function navFor(role: string): NavGroup[] {
  return NAV.filter((group) => allowed(group, role))
    .map((group) => ({ ...group, pages: group.pages.filter((page) => allowed(page, role)) }))
    .filter((group) => group.pages.length);
}

// The most specific page wins, so Prep reports doesn't also light Daily prep.
export function activePage(groups: NavGroup[], pathname: string): { group: NavGroup; page: NavPage } | null {
  let best: { group: NavGroup; page: NavPage } | null = null;
  for (const group of groups) for (const page of group.pages) {
    const hit = page.href === "/" ? pathname === "/" : pathname === page.href || pathname.startsWith(page.href + "/");
    if (hit && (!best || page.href.length > best.page.href.length)) best = { group, page };
  }
  return best;
}
