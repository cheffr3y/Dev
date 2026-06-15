import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { CommandSearch } from "@/components/CommandSearch";
import { signOutAction } from "@/lib/auth-actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
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
    <div className="flex min-h-screen bg-cream">
      {/* Sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-charcoal px-3 py-5 md:flex">
        <div className="mb-9 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-stone font-display text-lg text-charcoal">
            M
          </div>
          <div>
            <p className="font-display text-base leading-none text-white">Mise</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
              Culinary Ops
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar role={user.role} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-cream/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-4">
            <CommandSearch recipes={recipes} items={items} />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                {ROLE_LABEL[user.role] ?? user.role}
              </p>
            </div>
            <form action={signOutAction}>
              <button className="rounded-full border border-hairline px-4 py-1.5 text-sm tracking-wide text-zinc-600 transition-colors hover:border-ink hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="print-full mx-auto w-full max-w-[100rem] flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
