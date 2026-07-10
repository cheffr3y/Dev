// Rules-based counter-pick engine — pure, synchronous, client-safe. Runs
// instantly with no network. The AI Server Action (app/(app)/ow/actions.ts) is
// an optional enhancement layered on top of this; this always stands alone.
// See spec §5.1.

import type { OwRole } from "@prisma/client";
import { HERO_BY_ID, heroName, type HeroTag } from "./data/heroes";
import { MAP_BY_ID } from "./data/maps";
import { COUNTER_BY_ID, type CompArchetype } from "./data/counterMatrix";

export interface RecommendInput {
  map: string;
  enemyHeroes: string[]; // 0-5, partial info allowed
  role: OwRole; // which slot Jeff is filling
  pool: string[]; // Jeff's inPool hero ids for that role
  personalStats?: Record<string, { games: number; winRate: number }>;
}

export interface ScorePart {
  label: string;
  value: number; // signed contribution to the total
}

export interface Recommendation {
  heroId: string;
  heroName: string;
  score: number;
  parts: ScorePart[]; // explainable breakdown, most-significant first
}

export interface RecommendResult {
  archetype: CompArchetype;
  archetypeConfident: boolean; // false when we fell back to MIXED
  recommendations: Recommendation[];
}

// Tags that signal a comp archetype. A hero can contribute to more than one.
const ARCHETYPE_TAGS: Record<Exclude<CompArchetype, "MIXED">, HeroTag[]> = {
  DIVE: ["dive", "flank"],
  BRAWL: ["brawl"],
  POKE: ["poke"],
};

/**
 * Classify the enemy comp shape from known heroes' archetype tags. Returns
 * MIXED when fewer than 3 enemies are known or the top two archetype scores are
 * within one point of each other (no confident read).
 */
export function classifyArchetype(enemyHeroes: string[]): {
  archetype: CompArchetype;
  confident: boolean;
} {
  const known = enemyHeroes.map((id) => HERO_BY_ID[id]).filter(Boolean);
  if (known.length < 3) return { archetype: "MIXED", confident: false };

  const scores: Record<Exclude<CompArchetype, "MIXED">, number> = {
    DIVE: 0,
    BRAWL: 0,
    POKE: 0,
  };
  for (const hero of known) {
    for (const arch of ["DIVE", "BRAWL", "POKE"] as const) {
      if (hero.archetypeTags.some((t) => ARCHETYPE_TAGS[arch].includes(t))) {
        scores[arch] += 1;
      }
    }
  }

  const ranked = (Object.entries(scores) as [Exclude<CompArchetype, "MIXED">, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const [top, second] = ranked;
  if (top[1] === 0) return { archetype: "MIXED", confident: false };
  if (second && top[1] - second[1] <= 1) return { archetype: "MIXED", confident: false };
  return { archetype: top[0], confident: true };
}

// Map-trait synergy: reward heroes whose kit fits the terrain. Kept small and
// explainable. Currently: hitscan rewarded on long-sightlines, punished in
// close-quarters; dive rewarded where there's high ground / flank routes.
function traitSynergy(heroTags: HeroTag[], mapTraits: string[]): ScorePart | null {
  let value = 0;
  const notes: string[] = [];

  if (heroTags.includes("hitscan")) {
    if (mapTraits.includes("long-sightlines")) {
      value += 0.75;
      notes.push("hitscan on long sightlines");
    }
    if (mapTraits.includes("close-quarters")) {
      value -= 0.5;
      notes.push("hitscan in close quarters");
    }
  }
  if (heroTags.includes("dive") && (mapTraits.includes("high-ground-heavy") || mapTraits.includes("flank-routes"))) {
    value += 0.5;
    notes.push("dive on flankable terrain");
  }
  if ((heroTags.includes("projectile") || heroTags.includes("poke")) && mapTraits.includes("tight-chokes")) {
    value += 0.5;
    notes.push("spam into tight chokes");
  }

  if (value === 0) return null;
  return { label: `Map fit (${notes.join(", ")})`, value: round(value) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Recommend up to 3 heroes from Jeff's pool for the given slot, with a signed
 * score breakdown per hero so the pick is explainable rather than a black box.
 */
export function recommend(input: RecommendInput): RecommendResult {
  const { archetype, confident } = classifyArchetype(input.enemyHeroes);
  const map = MAP_BY_ID[input.map];
  const mapTraits = map?.traits ?? [];

  const recommendations: Recommendation[] = input.pool
    .map((heroId) => {
      const hero = HERO_BY_ID[heroId];
      const entry = COUNTER_BY_ID[heroId];
      const parts: ScorePart[] = [];

      // 1. Base archetype fit.
      const baseFit = entry ? entry.archetypeFit[archetype] : 1.5;
      parts.push({ label: `Fit vs ${archetype.toLowerCase()} comp`, value: round(baseFit) });

      // 2. Specific matchups against known enemies.
      if (entry) {
        const strong = input.enemyHeroes.filter((e) => entry.strongInto.includes(e));
        const weak = input.enemyHeroes.filter((e) => entry.weakInto.includes(e));
        if (strong.length) {
          parts.push({
            label: `Strong into ${strong.map(heroName).join(", ")}`,
            value: strong.length,
          });
        }
        if (weak.length) {
          parts.push({
            label: `Weak into ${weak.map(heroName).join(", ")}`,
            value: -weak.length,
          });
        }
      }

      // 3. Mode bias + map-trait synergy.
      if (entry?.modeBias && map && entry.modeBias[map.mode] != null) {
        parts.push({ label: `${map.mode.toLowerCase()} bias`, value: round(entry.modeBias[map.mode]!) });
      }
      if (hero) {
        const synergy = traitSynergy(hero.archetypeTags, mapTraits);
        if (synergy) parts.push(synergy);
      }

      // 4. Personal-stats modifier (needs >=10 games; capped ±1.5).
      const stats = input.personalStats?.[heroId];
      if (stats && stats.games >= 10) {
        const raw = (stats.winRate - 0.5) * 4;
        const capped = Math.max(-1.5, Math.min(1.5, raw));
        if (Math.abs(capped) >= 0.05) {
          parts.push({
            label: `Your ${Math.round(stats.winRate * 100)}% over ${stats.games} games`,
            value: round(capped),
          });
        }
      }

      const score = round(parts.reduce((sum, p) => sum + p.value, 0));
      // Order parts by magnitude so the biggest reason reads first.
      parts.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      return {
        heroId,
        heroName: hero?.name ?? heroId,
        score,
        parts,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { archetype, archetypeConfident: confident, recommendations };
}
