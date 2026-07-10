// Counter matrix — structured as EDITABLE DATA, not logic, so Jeff can retune
// per patch without touching the engine (lib/ow/counterEngine.ts). See spec §4.3.
//
// Reading a CounterEntry:
//   strongInto  — enemy hero ids this hero reliably punishes (+1 each)
//   weakInto    — enemy hero ids that punish this hero (−1 each)
//   archetypeFit— 0–3 score for running this hero INTO that enemy comp shape.
//                 The rough triangle: DIVE > POKE > BRAWL > DIVE. Presets below
//                 encode it; anti-dive brawlers override toward DIVE.
//   modeBias    — optional −1..+1 nudge for a map mode (e.g. snipers on Push).

import type { MapMode } from "./maps";

export type CompArchetype = "DIVE" | "BRAWL" | "POKE" | "MIXED";

export interface CounterEntry {
  heroId: string;
  strongInto: string[];
  weakInto: string[];
  archetypeFit: Record<CompArchetype, number>; // 0-3 fit vs that archetype
  modeBias?: Partial<Record<MapMode, number>>; // -1..+1
}

// Archetype-fit presets keyed to a hero's lean. MIXED stays neutral (2) — the
// engine only reaches the fit table when it has a confident read.
const DIVE_FIT: Record<CompArchetype, number> = { DIVE: 2, BRAWL: 1, POKE: 3, MIXED: 2 };
const BRAWL_FIT: Record<CompArchetype, number> = { DIVE: 3, BRAWL: 2, POKE: 1, MIXED: 2 };
const POKE_FIT: Record<CompArchetype, number> = { DIVE: 1, BRAWL: 3, POKE: 2, MIXED: 2 };
// Anti-dive specialists (Mei, Brig, Cassidy, Orisa, JQ) want to see dive.
const ANTIDIVE_FIT: Record<CompArchetype, number> = { DIVE: 3, BRAWL: 2, POKE: 1, MIXED: 2 };
const NEUTRAL_FIT: Record<CompArchetype, number> = { DIVE: 2, BRAWL: 2, POKE: 2, MIXED: 2 };

export const COUNTER_MATRIX: CounterEntry[] = [
  // --- Tanks ---------------------------------------------------------------
  { heroId: "winston", strongInto: ["widowmaker", "ashe", "ana", "zenyatta", "sojourn", "hanzo"], weakInto: ["reaper", "mei", "zarya", "brigitte", "roadhog", "bastion"], archetypeFit: DIVE_FIT },
  { heroId: "dva", strongInto: ["pharah", "echo", "ashe", "widowmaker", "junkrat", "hanzo", "zenyatta"], weakInto: ["zarya", "reaper", "mei", "sombra"], archetypeFit: DIVE_FIT },
  { heroId: "doomfist", strongInto: ["ana", "zenyatta", "widowmaker", "ashe", "mercy"], weakInto: ["mei", "cassidy", "reaper", "brigitte", "orisa"], archetypeFit: DIVE_FIT },
  { heroId: "wreckingball", strongInto: ["widowmaker", "ashe", "ana", "zenyatta", "sojourn"], weakInto: ["reaper", "mei", "junkrat", "sombra", "brigitte", "zarya"], archetypeFit: DIVE_FIT },
  { heroId: "hazard", strongInto: ["ana", "zenyatta", "widowmaker", "genji"], weakInto: ["reaper", "mei", "zarya", "brigitte"], archetypeFit: { DIVE: 3, BRAWL: 2, POKE: 2, MIXED: 2 } },
  { heroId: "reinhardt", strongInto: ["reaper", "mei", "tracer", "genji"], weakInto: ["pharah", "echo", "bastion", "sigma", "orisa", "widowmaker"], archetypeFit: BRAWL_FIT },
  { heroId: "junkerqueen", strongInto: ["winston", "dva", "tracer", "genji", "doomfist", "reaper"], weakInto: ["ana", "pharah", "echo", "bastion", "sigma"], archetypeFit: ANTIDIVE_FIT },
  { heroId: "mauga", strongInto: ["reinhardt", "roadhog", "zarya", "mei", "junkerqueen"], weakInto: ["ana", "zenyatta", "sombra", "echo", "pharah"], archetypeFit: BRAWL_FIT },
  { heroId: "orisa", strongInto: ["genji", "tracer", "winston", "doomfist", "pharah", "echo"], weakInto: ["zarya", "reaper", "mei", "ana", "bastion"], archetypeFit: ANTIDIVE_FIT },
  { heroId: "roadhog", strongInto: ["ana", "widowmaker", "zenyatta", "reaper"], weakInto: ["sombra", "mei", "zarya", "ashe", "junkerqueen"], archetypeFit: BRAWL_FIT },
  { heroId: "zarya", strongInto: ["winston", "dva", "reinhardt", "mei", "roadhog", "reaper"], weakInto: ["ana", "bastion", "sombra", "pharah", "echo"], archetypeFit: BRAWL_FIT },
  { heroId: "ramattra", strongInto: ["reinhardt", "mei", "reaper", "tracer", "genji"], weakInto: ["sigma", "ana", "pharah", "bastion"], archetypeFit: BRAWL_FIT },
  { heroId: "sigma", strongInto: ["reinhardt", "orisa", "bastion", "junkrat", "mei"], weakInto: ["winston", "dva", "genji", "sombra", "doomfist"], archetypeFit: POKE_FIT, modeBias: { ESCORT: 0.5, PUSH: 0.5 } },

  // --- DPS -----------------------------------------------------------------
  { heroId: "ashe", strongInto: ["pharah", "echo", "junkrat", "reinhardt", "mauga"], weakInto: ["winston", "dva", "genji", "tracer", "sombra"], archetypeFit: POKE_FIT, modeBias: { ESCORT: 0.5, PUSH: 0.5, FLASHPOINT: 0.5 } },
  { heroId: "bastion", strongInto: ["reinhardt", "orisa", "mauga", "zarya", "roadhog"], weakInto: ["genji", "tracer", "sombra", "widowmaker", "hanzo"], archetypeFit: POKE_FIT },
  { heroId: "cassidy", strongInto: ["genji", "tracer", "pharah", "echo", "winston", "sombra"], weakInto: ["reinhardt", "bastion", "sigma", "widowmaker"], archetypeFit: ANTIDIVE_FIT },
  { heroId: "echo", strongInto: ["widowmaker", "ana", "bastion", "zenyatta", "orisa"], weakInto: ["winston", "dva", "tracer", "sombra"], archetypeFit: { DIVE: 2, BRAWL: 2, POKE: 3, MIXED: 2 } },
  { heroId: "genji", strongInto: ["ana", "zenyatta", "widowmaker", "sojourn", "bastion"], weakInto: ["mei", "cassidy", "brigitte", "zarya", "winston", "sombra"], archetypeFit: DIVE_FIT },
  { heroId: "hanzo", strongInto: ["reinhardt", "orisa", "pharah", "mauga", "zarya"], weakInto: ["genji", "tracer", "winston", "dva"], archetypeFit: POKE_FIT },
  { heroId: "junkrat", strongInto: ["reinhardt", "mei", "roadhog", "orisa"], weakInto: ["pharah", "echo", "widowmaker", "ashe", "ana"], archetypeFit: BRAWL_FIT },
  { heroId: "mei", strongInto: ["winston", "dva", "doomfist", "genji", "tracer", "reinhardt"], weakInto: ["pharah", "echo", "widowmaker", "ashe", "bastion"], archetypeFit: ANTIDIVE_FIT },
  { heroId: "pharah", strongInto: ["reinhardt", "mei", "reaper", "junkrat", "zarya"], weakInto: ["ashe", "cassidy", "soldier76", "widowmaker", "sojourn"], archetypeFit: { DIVE: 2, BRAWL: 3, POKE: 1, MIXED: 2 } },
  { heroId: "reaper", strongInto: ["winston", "dva", "zarya", "reinhardt", "roadhog", "doomfist"], weakInto: ["pharah", "echo", "widowmaker", "ashe", "ana"], archetypeFit: ANTIDIVE_FIT },
  { heroId: "sojourn", strongInto: ["pharah", "echo", "reinhardt", "ashe"], weakInto: ["genji", "tracer", "winston", "sombra"], archetypeFit: POKE_FIT },
  { heroId: "soldier76", strongInto: ["pharah", "echo", "genji", "tracer", "winston"], weakInto: ["widowmaker", "sigma", "bastion", "reinhardt"], archetypeFit: { DIVE: 3, BRAWL: 2, POKE: 2, MIXED: 2 } },
  { heroId: "sombra", strongInto: ["widowmaker", "ana", "zenyatta", "wreckingball", "bastion", "mercy"], weakInto: ["mei", "cassidy", "zarya", "moira"], archetypeFit: DIVE_FIT },
  { heroId: "symmetra", strongInto: ["reinhardt", "winston", "mei", "roadhog"], weakInto: ["pharah", "echo", "widowmaker", "ashe"], archetypeFit: BRAWL_FIT },
  { heroId: "torbjorn", strongInto: ["reinhardt", "orisa", "mei", "roadhog", "mauga"], weakInto: ["pharah", "echo", "widowmaker", "hanzo"], archetypeFit: POKE_FIT },
  { heroId: "tracer", strongInto: ["ana", "zenyatta", "widowmaker", "ashe", "mercy", "sojourn"], weakInto: ["mei", "cassidy", "brigitte", "zarya", "torbjorn"], archetypeFit: DIVE_FIT },
  { heroId: "venture", strongInto: ["ana", "zenyatta", "widowmaker", "reinhardt"], weakInto: ["pharah", "echo", "brigitte"], archetypeFit: { DIVE: 3, BRAWL: 2, POKE: 2, MIXED: 2 } },
  { heroId: "widowmaker", strongInto: ["pharah", "ashe", "ana", "bastion", "reinhardt"], weakInto: ["winston", "dva", "genji", "tracer", "sombra"], archetypeFit: POKE_FIT, modeBias: { ESCORT: 0.5, PUSH: 0.5, CONTROL: -0.5 } },
  { heroId: "freja", strongInto: ["reinhardt", "mauga", "ana", "zenyatta"], weakInto: ["winston", "dva", "tracer"], archetypeFit: { DIVE: 2, BRAWL: 3, POKE: 2, MIXED: 2 } },

  // --- Support (default out of pool; entries kept so flipping inPool works) --
  { heroId: "ana", strongInto: ["roadhog", "mauga", "reinhardt", "zarya"], weakInto: ["genji", "tracer", "winston", "doomfist", "sombra"], archetypeFit: POKE_FIT },
  { heroId: "baptiste", strongInto: ["pharah", "echo", "bastion"], weakInto: ["genji", "tracer", "sombra"], archetypeFit: POKE_FIT },
  { heroId: "brigitte", strongInto: ["genji", "tracer", "winston", "doomfist", "sombra"], weakInto: ["pharah", "echo", "widowmaker", "ashe", "bastion"], archetypeFit: ANTIDIVE_FIT },
  { heroId: "kiriko", strongInto: ["ana", "sombra", "tracer"], weakInto: ["widowmaker", "ashe"], archetypeFit: NEUTRAL_FIT },
  { heroId: "lifeweaver", strongInto: ["reaper", "tracer"], weakInto: ["widowmaker", "ana", "sombra"], archetypeFit: NEUTRAL_FIT },
  { heroId: "illari", strongInto: ["reinhardt", "mauga", "pharah"], weakInto: ["genji", "tracer", "sombra", "widowmaker"], archetypeFit: POKE_FIT },
  { heroId: "lucio", strongInto: ["reinhardt", "mei", "zarya"], weakInto: ["ana", "widowmaker", "ashe"], archetypeFit: BRAWL_FIT },
  { heroId: "mercy", strongInto: ["pharah", "echo"], weakInto: ["sombra", "tracer", "widowmaker"], archetypeFit: NEUTRAL_FIT },
  { heroId: "moira", strongInto: ["genji", "tracer", "sombra", "winston"], weakInto: ["ana", "ashe", "widowmaker", "bastion"], archetypeFit: BRAWL_FIT },
  { heroId: "zenyatta", strongInto: ["roadhog", "reinhardt", "mauga", "bastion"], weakInto: ["genji", "tracer", "winston", "sombra", "doomfist"], archetypeFit: POKE_FIT },
  { heroId: "juno", strongInto: ["pharah", "reinhardt", "mauga"], weakInto: ["widowmaker", "tracer", "sombra"], archetypeFit: POKE_FIT },
  { heroId: "wuyang", strongInto: ["reinhardt", "mauga"], weakInto: ["widowmaker", "tracer", "sombra"], archetypeFit: NEUTRAL_FIT },
];

export const COUNTER_BY_ID: Record<string, CounterEntry> = Object.fromEntries(
  COUNTER_MATRIX.map((c) => [c.heroId, c]),
);
