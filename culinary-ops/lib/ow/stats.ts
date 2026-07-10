// Rolling-stats helpers over a user's logged matches. Pure functions — the
// dashboard and the counter engine both read from these so the numbers agree.

import type { OwResult, OwRole } from "@prisma/client";
import { HERO_BY_ID } from "./data/heroes";
import { MAP_BY_ID, type MapMode } from "./data/maps";

// The subset of an OwMatch these helpers need. Keeping it structural means
// callers can pass Prisma rows or trimmed selects interchangeably.
export interface MatchLike {
  role: OwRole;
  hero: string;
  map: string;
  result: OwResult;
  ratePositioning: number;
  rateUltUsage: number;
  rateTilt: number;
  playedAt: Date;
  sessionId: string | null;
}

export interface WinRecord {
  games: number; // total, including draws
  wins: number;
  losses: number;
  draws: number;
  winRate: number; // wins / (wins + losses); 0 when no decisive games
}

export function tally(matches: MatchLike[]): WinRecord {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const m of matches) {
    if (m.result === "WIN") wins++;
    else if (m.result === "LOSS") losses++;
    else draws++;
  }
  const decisive = wins + losses;
  return {
    games: matches.length,
    wins,
    losses,
    draws,
    winRate: decisive ? wins / decisive : 0,
  };
}

export function pct(winRate: number): number {
  return Math.round(winRate * 100);
}

export function byRole(matches: MatchLike[]): Record<OwRole, WinRecord> {
  return {
    TANK: tally(matches.filter((m) => m.role === "TANK")),
    DPS: tally(matches.filter((m) => m.role === "DPS")),
    SUPPORT: tally(matches.filter((m) => m.role === "SUPPORT")),
  };
}

export interface HeroRecord extends WinRecord {
  heroId: string;
  heroName: string;
}

// Heroes ordered by games played (desc), for the "top heroes" list.
export function byHero(matches: MatchLike[]): HeroRecord[] {
  const groups = new Map<string, MatchLike[]>();
  for (const m of matches) {
    const arr = groups.get(m.hero) ?? [];
    arr.push(m);
    groups.set(m.hero, arr);
  }
  return [...groups.entries()]
    .map(([heroId, ms]) => ({
      heroId,
      heroName: HERO_BY_ID[heroId]?.name ?? heroId,
      ...tally(ms),
    }))
    .sort((a, b) => b.games - a.games);
}

export interface ModeRecord extends WinRecord {
  mode: MapMode;
}

export function byMapMode(matches: MatchLike[]): ModeRecord[] {
  const groups = new Map<MapMode, MatchLike[]>();
  for (const m of matches) {
    const mode = MAP_BY_ID[m.map]?.mode;
    if (!mode) continue;
    const arr = groups.get(mode) ?? [];
    arr.push(m);
    groups.set(mode, arr);
  }
  return [...groups.entries()]
    .map(([mode, ms]) => ({ mode, ...tally(ms) }))
    .sort((a, b) => b.games - a.games);
}

/**
 * Per-hero {games, winRate} map shaped for the counter engine's
 * personal-stats modifier. Includes every hero the user has logged.
 */
export function personalStatsByHero(
  matches: MatchLike[],
): Record<string, { games: number; winRate: number }> {
  const out: Record<string, { games: number; winRate: number }> = {};
  for (const rec of byHero(matches)) {
    out[rec.heroId] = { games: rec.games, winRate: rec.winRate };
  }
  return out;
}
