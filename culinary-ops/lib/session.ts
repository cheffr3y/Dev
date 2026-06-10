import { redirect } from "next/navigation";
import { auth } from "@/auth";

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
