"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { activePage, navFor, type NavGroup, type NavIcon } from "@/lib/navigation/nav";
import { cn } from "./ui";

const ICONS: Record<NavIcon, ReactNode> = {
  today: <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
  // Chef's knife
  kitchen: <>
    <path d="M3 21 14.5 9.5" />
    <path d="M14.5 9.5 20 4c1 1 1 3.5-1 5.5l-3 3-1.5-3Z" />
  </>,
  // Open book
  recipes: <>
    <path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6Z" />
    <path d="M12 6v14.5" />
  </>,
  events: <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
    <path d="m9.5 15 1.8 1.8 3.7-3.8" />
  </>,
  // Delivery truck
  ordering: <>
    <path d="M3 7h11v9H3z" />
    <path d="M14 10h4l3 3v3h-7" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </>,
  // Clipboard with check
  cleanup: <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="m9 13 2 2 4-4" />
  </>,
  // Gear
  admin: <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
  </>,
};

function Icon({ name }: { name: NavIcon }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    {ICONS[name]}
  </svg>;
}

export function Sidebar({ role, collapsed = false, onNavigate, cleanupCount = 0 }: {
  role: string; collapsed?: boolean; onNavigate?: () => void; cleanupCount?: number;
}) {
  const pathname = usePathname();
  const groups = navFor(role);
  const current = activePage(groups, pathname);
  const activeKey = current?.group.key;
  const main = groups.filter((group) => !group.footer);
  const footer = groups.filter((group) => group.footer);
  // Desktop only (no onNavigate): hovering or focusing a job shows its pages.
  const entry = (group: NavGroup) => <NavEntry key={group.key} group={group} flyout={!onNavigate && group.pages.length > 1}
    activeHref={current?.page.href}>
    <GroupLink group={group} active={group.key === activeKey}
      collapsed={collapsed} onNavigate={onNavigate} badge={group.key === "cleanup" ? cleanupCount : 0} />
  </NavEntry>;

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      <ul className="space-y-1">{main.map(entry)}</ul>
      {footer.length > 0 && <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">{footer.map(entry)}</ul>}
    </nav>
  );
}

// A sidebar row plus its hover/focus flyout. The flyout is position: fixed so
// the sidebar's scroll area doesn't clip it, and it stays a DOM child of the
// row so moving the mouse onto it (or tabbing into it) keeps it open.
function NavEntry({ group, flyout, activeHref, children }: {
  group: NavGroup; flyout: boolean; activeHref?: string; children: ReactNode;
}) {
  const row = useRef<HTMLLIElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Escape returns focus to the job link; that focus must not reopen the menu it just closed.
  const escaping = useRef(false);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) { setPrevPath(pathname); setSpot(null); }
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (delay: number) => {
    if (!flyout) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const box = row.current?.getBoundingClientRect();
      const right = row.current?.closest("aside")?.getBoundingClientRect().right ?? box?.right ?? 0;
      if (!box) return;
      const height = 52 + group.pages.length * 40;
      setSpot({ left: right - 4, top: Math.max(8, Math.min(box.top - 8, window.innerHeight - height - 8)) });
    }, delay);
  };
  const hide = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSpot(null), delay);
  };

  return (
    <li ref={row}
      onMouseEnter={() => show(80)} onMouseLeave={() => hide(150)}
      onFocus={() => { if (escaping.current) { escaping.current = false; return; } show(0); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide(0); }}
      onKeyDown={(event) => { if (event.key === "Escape" && spot) { clearTimeout(timer.current); setSpot(null); escaping.current = true; row.current?.querySelector("a")?.focus(); escaping.current = false; } }}>
      {children}
      {spot && <div className="fixed z-50 pl-2" style={{ left: spot.left, top: spot.top }}>
        <div role="group" aria-label={`${group.label} pages`}
          className="min-w-56 rounded-lg border border-white/10 bg-charcoal p-1.5 shadow-xl shadow-black/30">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50" aria-hidden>{group.label}</p>
          <ul>
            {group.pages.map((page) => {
              const here = page.href === activeHref;
              return <li key={page.href}>
                <Link href={page.href} aria-current={here ? "page" : undefined}
                  className={cn("flex min-h-10 items-center whitespace-nowrap rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                    here ? "bg-white/10 font-medium text-white" : "text-white/80 hover:bg-white/10 hover:text-white")}>
                  {page.label}
                </Link>
              </li>;
            })}
          </ul>
        </div>
      </div>}
    </li>
  );
}

function GroupLink({ group, active, collapsed, onNavigate, badge }: {
  group: NavGroup; active: boolean; collapsed: boolean; onNavigate?: () => void; badge: number;
}) {
  const label = badge ? `${group.label}, ${badge} to review` : group.label;
  return (
    <Link
      href={group.pages[0].href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed || badge ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex min-h-11 items-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus md:min-h-10",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active ? "bg-white/10 font-medium text-white ring-1 ring-inset ring-white/10" : "text-white/75 hover:bg-white/5 hover:text-white",
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-focus" />}
      <span className={cn("relative shrink-0 transition-colors", active ? "text-gold-soft" : "text-white/50 group-hover:text-white/75")}>
        <Icon name={group.icon} />
        {collapsed && badge > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-paprika" aria-hidden />}
      </span>
      <span className={collapsed ? "sr-only" : "flex-1 whitespace-nowrap"}>{group.label}</span>
      {!collapsed && badge > 0 && <span aria-hidden className="rounded-full bg-paprika/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">{badge > 999 ? "999+" : badge}</span>}
    </Link>
  );
}
