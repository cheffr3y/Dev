// Overwatch hero reference data — typed constant, NOT a database table.
// Roster / meta shift every season; editing this file and redeploying is the
// intended maintenance path (see the module spec §4).
//
// ----------------------------------------------------------------------------
// MAINTENANCE NOTE — verify at build time.
// This roster reflects the established OW2 hero pool through early 2026 and was
// web-checked on 2026-07-10. Public sources for mid-2026 additions are
// inconsistent (one lists 13/20/12 = 45 yet claims "52 total"), so newly
// released heroes are intentionally NOT seeded here to avoid bad data. When a
// new hero ships, add a row below with its real id/role/tags and let Jeff set
// `inPool`. Treat anything released after early 2026 as [UNKNOWN] until added.
//
// Web check surfaced these UNVERIFIED mid-2026 names (confirm before adding):
// Sierra, Anran, Domina, Emre.
// ----------------------------------------------------------------------------

import type { OwRole } from "@prisma/client";

// Coarse playstyle tags. Drive comp-archetype classification (dive/brawl/poke)
// in the counter engine and colour the AI prompt context. A hero can carry
// several; the first archetype-signalling tag is treated as its lean.
export type HeroTag =
  | "dive"
  | "brawl"
  | "poke"
  | "hitscan"
  | "projectile"
  | "flank"
  | "shield"
  | "anti-dive"
  | "sustain"
  | "burst";

export interface Hero {
  id: string; // stable slug; referenced by OwMatch.hero / enemyComp / counterMatrix
  name: string;
  role: OwRole;
  archetypeTags: HeroTag[];
  // Jeff's playable pool. Tank + DPS default true; Support default false
  // (Jeff plays Tank/DPS). Flip here if that changes.
  inPool: boolean;
}

export const HEROES: Hero[] = [
  // --- Tanks ---------------------------------------------------------------
  { id: "dva", name: "D.Va", role: "TANK", archetypeTags: ["dive"], inPool: true },
  { id: "doomfist", name: "Doomfist", role: "TANK", archetypeTags: ["dive", "brawl"], inPool: true },
  { id: "junkerqueen", name: "Junker Queen", role: "TANK", archetypeTags: ["brawl"], inPool: true },
  { id: "mauga", name: "Mauga", role: "TANK", archetypeTags: ["brawl"], inPool: true },
  { id: "orisa", name: "Orisa", role: "TANK", archetypeTags: ["brawl", "anti-dive"], inPool: true },
  { id: "ramattra", name: "Ramattra", role: "TANK", archetypeTags: ["brawl", "poke"], inPool: true },
  { id: "reinhardt", name: "Reinhardt", role: "TANK", archetypeTags: ["brawl", "shield"], inPool: true },
  { id: "roadhog", name: "Roadhog", role: "TANK", archetypeTags: ["brawl"], inPool: true },
  { id: "sigma", name: "Sigma", role: "TANK", archetypeTags: ["poke", "shield"], inPool: true },
  { id: "winston", name: "Winston", role: "TANK", archetypeTags: ["dive"], inPool: true },
  { id: "wreckingball", name: "Wrecking Ball", role: "TANK", archetypeTags: ["dive"], inPool: true },
  { id: "zarya", name: "Zarya", role: "TANK", archetypeTags: ["brawl"], inPool: true },
  { id: "hazard", name: "Hazard", role: "TANK", archetypeTags: ["dive", "brawl"], inPool: true },

  // --- DPS -----------------------------------------------------------------
  { id: "ashe", name: "Ashe", role: "DPS", archetypeTags: ["poke", "hitscan"], inPool: true },
  { id: "bastion", name: "Bastion", role: "DPS", archetypeTags: ["poke"], inPool: true },
  { id: "cassidy", name: "Cassidy", role: "DPS", archetypeTags: ["hitscan", "brawl"], inPool: true },
  { id: "echo", name: "Echo", role: "DPS", archetypeTags: ["dive", "projectile"], inPool: true },
  { id: "genji", name: "Genji", role: "DPS", archetypeTags: ["dive", "flank"], inPool: true },
  { id: "hanzo", name: "Hanzo", role: "DPS", archetypeTags: ["poke", "projectile"], inPool: true },
  { id: "junkrat", name: "Junkrat", role: "DPS", archetypeTags: ["brawl", "projectile"], inPool: true },
  { id: "mei", name: "Mei", role: "DPS", archetypeTags: ["brawl"], inPool: true },
  { id: "pharah", name: "Pharah", role: "DPS", archetypeTags: ["poke", "projectile", "flank"], inPool: true },
  { id: "reaper", name: "Reaper", role: "DPS", archetypeTags: ["brawl", "flank"], inPool: true },
  { id: "sojourn", name: "Sojourn", role: "DPS", archetypeTags: ["poke", "hitscan"], inPool: true },
  { id: "soldier76", name: "Soldier: 76", role: "DPS", archetypeTags: ["hitscan", "poke"], inPool: true },
  { id: "sombra", name: "Sombra", role: "DPS", archetypeTags: ["dive", "flank"], inPool: true },
  { id: "symmetra", name: "Symmetra", role: "DPS", archetypeTags: ["brawl"], inPool: true },
  { id: "torbjorn", name: "Torbjörn", role: "DPS", archetypeTags: ["poke"], inPool: true },
  { id: "tracer", name: "Tracer", role: "DPS", archetypeTags: ["dive", "flank"], inPool: true },
  { id: "venture", name: "Venture", role: "DPS", archetypeTags: ["dive", "brawl"], inPool: true },
  { id: "widowmaker", name: "Widowmaker", role: "DPS", archetypeTags: ["poke", "hitscan"], inPool: true },
  { id: "freja", name: "Freja", role: "DPS", archetypeTags: ["poke", "projectile", "flank"], inPool: true },

  // --- Support (default OUT of pool — Jeff plays Tank/DPS; flip inPool to true) -
  { id: "ana", name: "Ana", role: "SUPPORT", archetypeTags: ["poke", "anti-dive"], inPool: false },
  { id: "baptiste", name: "Baptiste", role: "SUPPORT", archetypeTags: ["poke", "sustain"], inPool: false },
  { id: "brigitte", name: "Brigitte", role: "SUPPORT", archetypeTags: ["brawl", "anti-dive"], inPool: false },
  { id: "kiriko", name: "Kiriko", role: "SUPPORT", archetypeTags: ["flank", "sustain"], inPool: false },
  { id: "lifeweaver", name: "Lifeweaver", role: "SUPPORT", archetypeTags: ["sustain"], inPool: false },
  { id: "illari", name: "Illari", role: "SUPPORT", archetypeTags: ["poke", "sustain"], inPool: false },
  { id: "lucio", name: "Lúcio", role: "SUPPORT", archetypeTags: ["brawl", "dive"], inPool: false },
  { id: "mercy", name: "Mercy", role: "SUPPORT", archetypeTags: ["sustain"], inPool: false },
  { id: "moira", name: "Moira", role: "SUPPORT", archetypeTags: ["brawl", "flank", "sustain"], inPool: false },
  { id: "zenyatta", name: "Zenyatta", role: "SUPPORT", archetypeTags: ["poke"], inPool: false },
  { id: "juno", name: "Juno", role: "SUPPORT", archetypeTags: ["poke", "sustain", "dive"], inPool: false },
  { id: "wuyang", name: "Wuyang", role: "SUPPORT", archetypeTags: ["sustain", "poke"], inPool: false },
];

// --- Lookups ----------------------------------------------------------------

export const HERO_BY_ID: Record<string, Hero> = Object.fromEntries(
  HEROES.map((h) => [h.id, h]),
);

export function heroName(id: string): string {
  return HERO_BY_ID[id]?.name ?? id;
}

export function heroesByRole(role: OwRole): Hero[] {
  return HEROES.filter((h) => h.role === role);
}

export function poolByRole(role: OwRole): Hero[] {
  return HEROES.filter((h) => h.role === role && h.inPool);
}
