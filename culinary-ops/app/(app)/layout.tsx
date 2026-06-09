import { requireUser } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { Sidebar } from "@/components/Sidebar";
import { VenueSwitcher } from "@/components/VenueSwitcher";
import { signOutAction } from "@/lib/auth-actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { venues, active } = await getActiveVenue(user.homeVenueId);

  return (
    <div className="flex min-h-screen bg-zinc-100">
      {/* Sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-zinc-900 px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg font-semibold text-zinc-900">
            M
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Mise</p>
            <p className="text-xs text-zinc-400">Culinary Ops</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar role={user.role} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-5 py-3 backdrop-blur">
          <VenueSwitcher venues={venues} activeId={active?.id ?? null} />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-800">{user.name}</p>
              <p className="text-xs text-zinc-400">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
            <form action={signOutAction}>
              <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="print-full mx-auto w-full max-w-6xl flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
