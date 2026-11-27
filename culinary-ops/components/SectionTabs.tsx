"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activePage, navFor } from "@/lib/navigation/nav";
import { cn } from "./ui";

// Tabs for the pages inside the current sidebar job (e.g. Events → Custom
// Menus · Banquets · Events · Festivals). Hidden for one-page jobs and in print.
export function SectionTabs({ role }: { role: string }) {
  const pathname = usePathname();
  const current = activePage(navFor(role), pathname);
  if (!current || current.group.pages.length < 2) return null;
  return (
    <nav aria-label={`${current.group.label} pages`} className="no-print -mx-4 mb-5 overflow-x-auto border-b border-hairline px-4 md:-mx-6 md:px-6">
      <ul className="flex gap-1">
        {current.group.pages.map((page) => {
          const active = page.href === current.page.href;
          return <li key={page.href}>
            <Link href={page.href} aria-current={active ? "page" : undefined}
              className={cn("-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors md:min-h-10",
                active ? "border-paprika font-medium text-ink" : "border-transparent text-zinc-600 hover:border-hairline hover:text-ink")}>
              {page.label}
            </Link>
          </li>;
        })}
      </ul>
    </nav>
  );
}
