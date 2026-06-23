import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "STAFF";
  homeVenueId: string | null;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: (session.user.role as AppUser["role"]) ?? "STAFF",
    homeVenueId: session.user.homeVenueId ?? null,
  };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const RANK: Record<AppUser["role"], number> = { STAFF: 1, MANAGER: 2, ADMIN: 3 };

export function hasRole(user: AppUser, min: AppUser["role"]): boolean {
  return RANK[user.role] >= RANK[min];
}

export async function requireRole(min: AppUser["role"]): Promise<AppUser> {
  const user = await requireUser();
  if (!hasRole(user, min)) redirect("/");
  return user;
}

/**
 * Like {@link requireUser}/{@link requireRole}, but also confirms the account
 * still exists in the database before returning. JWT sessions embed the user id
 * at login and never re-check it, so a wiped/reseeded database (or a removed
 * account) leaves a validly-signed cookie pointing at a user that's gone. Using
 * that id as a foreign key throws a P2003 (e.g. `PrepOrder_submittedByUserId_fkey`).
 *
 * Use this in mutations that persist the current user's id as a foreign key:
 * it detects the stale session, clears the dead cookie, and redirects to
 * /login instead of surfacing a raw constraint error. Must run inside a Server
 * Action (signOut mutates cookies).
 */
export async function requireActiveUser(min?: AppUser["role"]): Promise<AppUser> {
  const user = min ? await requireRole(min) : await requireUser();
  const exists = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true },
  });
  if (!exists) await signOut({ redirectTo: "/login" });
  return user;
}
