import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, type AppUser } from "./session";
import { prisma } from "./prisma";

// Prep permissions use current database assignments, not an older login token.
export async function getPrepUser(): Promise<AppUser | null> {
  const session = await getCurrentUser();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      homeVenueId: true,
    },
  });
}
export async function requirePrepUser(min?: AppUser["role"]) {
  const user = await getPrepUser();
  if (!user) redirect("/login");
  if (min && !hasRole(user, min)) redirect("/prep-orders");
  return user;
}
