import Link from "next/link";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { signOutAction } from "@/lib/auth/auth-actions";

// Games share authentication, but do not load the culinary shell or its catalog.
export default async function GamesLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePrepUser();
  return (
    <div className="games-shell min-h-screen bg-cream text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 md:px-6">
        <nav aria-label="Break room" className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/" className="font-semibold">Back to kitchen</Link>
          <Link href="/homestead">Homestead</Link>
          <Link href="/trivia">Trivia</Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.name}</span>
          <form action={signOutAction}>
            <button className="rounded border border-hairline px-3 py-1.5">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[100rem] px-4 py-5 md:px-6">{children}</main>
    </div>
  );
}
