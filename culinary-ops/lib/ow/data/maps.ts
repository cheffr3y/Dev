// Overwatch map reference data — typed constant, NOT a database table.
// Traits drive both the rules engine (e.g. hitscan bonus on long-sightlines)
// and the AI prompt context. See the module spec §4.2.
//
// ----------------------------------------------------------------------------
// MAINTENANCE NOTE — verify current competitive pool at build time.
// Web-checked 2026-07-10: as of Season 10 Blizzard dropped strict per-mode map
// pools, so most maps for a mode are live at once. Clash was pulled from
// Competitive (S15); its maps are kept below (mode CLASH) but flagged so they
// can be excluded or re-enabled without a code change. Add new maps as they
// ship and confirm the mode enum still matches the game.
// ----------------------------------------------------------------------------

export type MapMode =
  | "CONTROL"
  | "ESCORT"
  | "HYBRID"
  | "PUSH"
  | "FLASHPOINT"
  | "CLASH";

export type MapTrait =
  | "long-sightlines"
  | "high-ground-heavy"
  | "flank-routes"
  | "tight-chokes"
  | "open"
  | "close-quarters"
  | "verticality";

export interface GameMap {
  id: string;
  name: string;
  mode: MapMode;
  traits: MapTrait[];
  // Currently out of the competitive rotation but kept for reference / QP.
  outOfCompPool?: boolean;
}

export const MAPS: GameMap[] = [
  // --- Control -------------------------------------------------------------
  { id: "busan", name: "Busan", mode: "CONTROL", traits: ["high-ground-heavy", "close-quarters"] },
  { id: "ilios", name: "Ilios", mode: "CONTROL", traits: ["high-ground-heavy", "close-quarters", "flank-routes"] },
  { id: "lijiang", name: "Lijiang Tower", mode: "CONTROL", traits: ["flank-routes", "close-quarters"] },
  { id: "nepal", name: "Nepal", mode: "CONTROL", traits: ["high-ground-heavy", "tight-chokes"] },
  { id: "oasis", name: "Oasis", mode: "CONTROL", traits: ["long-sightlines", "open"] },
  { id: "antarctic", name: "Antarctic Peninsula", mode: "CONTROL", traits: ["close-quarters", "flank-routes"] },
  { id: "samoa", name: "Samoa", mode: "CONTROL", traits: ["high-ground-heavy", "verticality"] },

  // --- Escort --------------------------------------------------------------
  { id: "circuitroyal", name: "Circuit Royal", mode: "ESCORT", traits: ["long-sightlines", "open"] },
  { id: "dorado", name: "Dorado", mode: "ESCORT", traits: ["tight-chokes", "flank-routes", "high-ground-heavy"] },
  { id: "havana", name: "Havana", mode: "ESCORT", traits: ["flank-routes", "long-sightlines"] },
  { id: "junkertown", name: "Junkertown", mode: "ESCORT", traits: ["long-sightlines", "high-ground-heavy"] },
  { id: "rialto", name: "Rialto", mode: "ESCORT", traits: ["tight-chokes", "flank-routes"] },
  { id: "route66", name: "Route 66", mode: "ESCORT", traits: ["long-sightlines", "high-ground-heavy"] },
  { id: "shambali", name: "Shambali Monastery", mode: "ESCORT", traits: ["long-sightlines", "verticality"] },
  { id: "gibraltar", name: "Watchpoint: Gibraltar", mode: "ESCORT", traits: ["long-sightlines", "high-ground-heavy"] },

  // --- Hybrid --------------------------------------------------------------
  { id: "blizzardworld", name: "Blizzard World", mode: "HYBRID", traits: ["tight-chokes", "flank-routes"] },
  { id: "eichenwalde", name: "Eichenwalde", mode: "HYBRID", traits: ["tight-chokes", "close-quarters"] },
  { id: "hollywood", name: "Hollywood", mode: "HYBRID", traits: ["flank-routes", "high-ground-heavy"] },
  { id: "kingsrow", name: "King's Row", mode: "HYBRID", traits: ["tight-chokes", "close-quarters", "flank-routes"] },
  { id: "midtown", name: "Midtown", mode: "HYBRID", traits: ["long-sightlines", "flank-routes"] },
  { id: "numbani", name: "Numbani", mode: "HYBRID", traits: ["high-ground-heavy", "flank-routes"] },
  { id: "paraiso", name: "Paraíso", mode: "HYBRID", traits: ["flank-routes", "close-quarters"] },

  // --- Push ----------------------------------------------------------------
  { id: "colosseo", name: "Colosseo", mode: "PUSH", traits: ["long-sightlines", "high-ground-heavy"] },
  { id: "esperanca", name: "Esperança", mode: "PUSH", traits: ["flank-routes", "verticality"] },
  { id: "newqueenstreet", name: "New Queen Street", mode: "PUSH", traits: ["long-sightlines", "open"] },
  { id: "runasapi", name: "Runasapi", mode: "PUSH", traits: ["tight-chokes", "high-ground-heavy"] },

  // --- Flashpoint ----------------------------------------------------------
  { id: "newjunkcity", name: "New Junk City", mode: "FLASHPOINT", traits: ["open", "flank-routes"] },
  { id: "suravasa", name: "Suravasa", mode: "FLASHPOINT", traits: ["open", "long-sightlines"] },

  // --- Clash (out of competitive rotation as of S15 — kept for reference) ---
  { id: "hanaoka", name: "Hanaoka", mode: "CLASH", traits: ["tight-chokes", "close-quarters"], outOfCompPool: true },
  { id: "throneofanubis", name: "Throne of Anubis", mode: "CLASH", traits: ["tight-chokes", "high-ground-heavy"], outOfCompPool: true },
];

// --- Lookups ----------------------------------------------------------------

export const MAP_BY_ID: Record<string, GameMap> = Object.fromEntries(
  MAPS.map((m) => [m.id, m]),
);

export function mapName(id: string): string {
  return MAP_BY_ID[id]?.name ?? id;
}

export const MAP_MODES: MapMode[] = [
  "CONTROL",
  "ESCORT",
  "HYBRID",
  "PUSH",
  "FLASHPOINT",
  "CLASH",
];

export function mapModeLabel(mode: MapMode): string {
  return mode.charAt(0) + mode.slice(1).toLowerCase();
}
