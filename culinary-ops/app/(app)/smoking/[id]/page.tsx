import { notFound } from "next/navigation";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { getVenues } from "@/lib/venues/venue";
import { getSmokeRun } from "@/lib/smoking/data";
import { profileSchema } from "@/lib/smoking/smoking";
import type { RunView } from "@/lib/smoking/view";
import { SmokeRunWorkspace } from "../smoking-client";
import "../smoking.css";
export default async function SmokeRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePrepUser(),
    { id } = await params,
    run = await getSmokeRun(user, id);
  if (!run) notFound();
  const [venues, users, recipes, projects, profiles] = await Promise.all([
    getVenues({ includeIds: [user.homeVenueId, run.venueId] }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.recipe.findMany({
      select: { id: true, name: true, version: true },
      orderBy: { name: "asc" },
    }),
    prisma.productionJob.findMany({
      select: { id: true, recipeName: true, contextLabel: true },
      orderBy: { startedAt: "desc" },
      take: 300,
    }),
    prisma.smokeProfile.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <SmokeRunWorkspace
      run={JSON.parse(JSON.stringify(run)) as RunView}
      user={user}
      choices={{
        venues:
          user.role === "STAFF"
            ? venues.filter((v) => v.id === user.homeVenueId)
            : venues,
        users,
        recipes,
        projects,
        profiles: profiles.map((p) => ({
          id: p.id,
          revision: p.revision,
          data: profileSchema.parse(p.data),
        })),
      }}
    />
  );
}
