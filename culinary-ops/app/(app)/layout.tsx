import { requirePrepUser } from "@/lib/prep-session";
import { prisma } from "@/lib/prisma";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { MobileNav } from "@/components/MobileNav";
import { CommandSearch } from "@/components/CommandSearch";
import { signOutAction } from "@/lib/auth-actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePrepUser();
  const [recipes, items] = await Promise.all([
    prisma.recipe.findMany({
      select: { id: true, name: true, category: true, station: true },
      orderBy: { name: "asc" },
    }),
    prisma.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="ops-theme flex min-h-screen bg-cream text-ink">
      {/* Sidebar */}
      <DesktopSidebar role={user.role} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-cream/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:gap-4">
            <MobileNav role={user.role} />
            <span className="font-display text-lg leading-none text-ink md:hidden">Mise</span>
            <CommandSearch recipes={recipes} items={items} role={user.role} />
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                {ROLE_LABEL[user.role] ?? user.role}
              </p>
            </div>
            <form action={signOutAction}>
              <button className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-ink hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="print-full mx-auto w-full max-w-[100rem] flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
