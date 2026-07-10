// Server-side data loaders for the OW module. Centralises the match select so
// the dashboard, insights, history, and counter engine all read the same shape.
// Only imported by server components / actions (it pulls in the Prisma client).
import { prisma } from "@/lib/prisma";
import type { MatchLike } from "./stats";

// The columns every stats/insights helper needs. Kept in one place so a schema
// change touches one select, not five pages.
const MATCH_SELECT = {
  role: true,
  hero: true,
  map: true,
  result: true,
  ratePositioning: true,
  rateUltUsage: true,
  rateTilt: true,
  playedAt: true,
  sessionId: true,
} as const;

export async function loadUserMatches(userId: string): Promise<MatchLike[]> {
  return prisma.owMatch.findMany({
    where: { userId },
    orderBy: { playedAt: "desc" },
    select: MATCH_SELECT,
  });
}

export function playCounts(matches: MatchLike[]): {
  heroes: Record<string, number>;
  maps: Record<string, number>;
} {
  const heroes: Record<string, number> = {};
  const maps: Record<string, number> = {};
  for (const m of matches) {
    heroes[m.hero] = (heroes[m.hero] ?? 0) + 1;
    maps[m.map] = (maps[m.map] ?? 0) + 1;
  }
  return { heroes, maps };
}
