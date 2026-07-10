// Improvement-signal insights — pure functions over a user's matches.
//
// Per spec §7 each analysis has a minimum-data threshold and only surfaces when
// the signal is strong enough. Rather than return a bare `null` that the UI
// would render as emptiness, below-threshold analyses return an explicit
// "insufficient" card ("Need 20+ … — 8 so far") so the dashboard never shows a
// misleading empty or half-baked stat. `null` is reserved for the case where an
// analysis simply does not apply (e.g. no matches logged at all).

import { mapModeLabel } from "./data/maps";
import { tally, pct, byHero, byMapMode, type MatchLike } from "./stats";

export type InsightTone = "good" | "warn" | "info" | "muted";

export interface InsightCard {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
  insufficient?: boolean;
}

function insufficient(id: string, title: string, need: number, have: number, noun: string): InsightCard {
  return {
    id,
    title,
    tone: "muted",
    insufficient: true,
    body: `Need ${need}+ ${noun} for this — ${have} so far.`,
  };
}

// 1. Tilt correlation (min 20 matches). Win rate calm (tilt ≤2) vs tilted (≥4).
export function tiltCorrelation(matches: MatchLike[]): InsightCard | null {
  const id = "tilt";
  const title = "Tilt correlation";
  if (matches.length === 0) return null;
  if (matches.length < 20) return insufficient(id, title, 20, matches.length, "logged matches");

  const calm = tally(matches.filter((m) => m.rateTilt <= 2));
  const tilted = tally(matches.filter((m) => m.rateTilt >= 4));
  if (calm.wins + calm.losses < 3 || tilted.wins + tilted.losses < 3) {
    return { id, title, tone: "info", body: "Not enough calm vs. tilted games yet to compare — keep logging tilt honestly." };
  }
  const gap = pct(calm.winRate) - pct(tilted.winRate);
  if (gap < 10) {
    return { id, title, tone: "good", body: `Tilt isn't hurting you much — ${pct(calm.winRate)}% calm vs ${pct(tilted.winRate)}% tilted.` };
  }
  return {
    id,
    title,
    tone: "warn",
    body: `You win ${pct(calm.winRate)}% calm but only ${pct(tilted.winRate)}% when tilted — a ${gap}-point swing. Step away when tilt climbs.`,
  };
}

// 2. Streak fatigue (min 30 matches). Games 1–3 of a session vs games 4+.
export function streakFatigue(matches: MatchLike[]): InsightCard | null {
  const id = "streak";
  const title = "Streak fatigue";
  if (matches.length === 0) return null;
  if (matches.length < 30) return insufficient(id, title, 30, matches.length, "logged matches");

  // Order each session's matches and split at the 4th game.
  const bySession = new Map<string, MatchLike[]>();
  for (const m of matches) {
    if (!m.sessionId) continue;
    const arr = bySession.get(m.sessionId) ?? [];
    arr.push(m);
    bySession.set(m.sessionId, arr);
  }
  const early: MatchLike[] = [];
  const late: MatchLike[] = [];
  for (const arr of bySession.values()) {
    arr.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
    arr.forEach((m, i) => (i < 3 ? early : late).push(m));
  }
  const e = tally(early);
  const l = tally(late);
  if (l.wins + l.losses < 5) {
    return { id, title, tone: "info", body: "Not many long sessions yet — play past game 3 a few more times to see if fatigue shows." };
  }
  const gap = pct(e.winRate) - pct(l.winRate);
  if (gap < 10) {
    return { id, title, tone: "good", body: `You hold up in long sessions — ${pct(e.winRate)}% early vs ${pct(l.winRate)}% on game 4+.` };
  }
  return {
    id,
    title,
    tone: "warn",
    body: `Win rate drops ${gap} points after game 3 (${pct(e.winRate)}% → ${pct(l.winRate)}%). Consider capping sessions at 3.`,
  };
}

// 3. Map-mode weakness (min 10 games in a mode). Any mode ≥12 pts below overall.
export function mapModeWeakness(matches: MatchLike[]): InsightCard | null {
  const id = "mapmode";
  const title = "Map-mode weakness";
  if (matches.length === 0) return null;

  const overall = tally(matches);
  const modes = byMapMode(matches).filter((m) => m.games >= 10);
  if (modes.length === 0) return insufficient(id, title, 10, Math.max(...byMapMode(matches).map((m) => m.games), 0), "games in a single mode");

  const worst = modes
    .map((m) => ({ ...m, gap: pct(overall.winRate) - pct(m.winRate) }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (worst.gap < 12) {
    return { id, title, tone: "good", body: "No mode is dragging you down — win rates are even across modes." };
  }
  return {
    id,
    title,
    tone: "warn",
    body: `${mapModeLabel(worst.mode)} is your weak mode: ${pct(worst.winRate)}% vs ${pct(overall.winRate)}% overall (${worst.gap} points lower). Drill its maps in the counter tool.`,
  };
}

// 4. Hero over-loyalty (min 15 games on a hero). ≤42% win but ≥25% of games.
export function heroOverLoyalty(matches: MatchLike[]): InsightCard | null {
  const id = "loyalty";
  const title = "Hero over-loyalty";
  if (matches.length === 0) return null;

  const total = matches.length;
  const flagged = byHero(matches)
    .filter((h) => h.games >= 15 && h.winRate <= 0.42 && h.games / total >= 0.25)
    .sort((a, b) => a.winRate - b.winRate)[0];
  if (!flagged) {
    return { id, title, tone: "good", body: "No over-played, under-performing hero — your comfort picks are earning their play time." };
  }
  return {
    id,
    title,
    tone: "warn",
    body: `${flagged.heroName} is ${Math.round((flagged.games / total) * 100)}% of your games at just ${pct(flagged.winRate)}%. Consider benching them into bad matchups.`,
  };
}

// 5. Session-focus generator. Weakest self-rating over the last 10 matches maps
// to one concrete focus string. Exposed both as a card and as a raw string for
// the "Start session" default (see focusStringFor).
const FOCUS_STRINGS = {
  positioning: "Play one cover-piece back from where instinct says.",
  ult: "Ult with one other confirmed ult, never solo.",
  tilt: "Hard stop after 2 consecutive losses.",
} as const;

type FocusKey = keyof typeof FOCUS_STRINGS;

function weakestFocus(matches: MatchLike[]): FocusKey | null {
  const recent = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime()).slice(0, 10);
  if (recent.length < 5) return null; // need a little signal
  const avg = (sel: (m: MatchLike) => number) => recent.reduce((s, m) => s + sel(m), 0) / recent.length;
  // "Badness" per dimension, higher = weaker. Ratings are 1–5; tilt is inverted
  // (5 = fully tilted, so high tilt is bad).
  const badness: Record<FocusKey, number> = {
    positioning: 5 - avg((m) => m.ratePositioning),
    ult: 5 - avg((m) => m.rateUltUsage),
    tilt: avg((m) => m.rateTilt) - 1,
  };
  return (Object.entries(badness) as [FocusKey, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Raw focus string for defaulting a new session's goal, or null if too little data. */
export function focusStringFor(matches: MatchLike[]): string | null {
  const key = weakestFocus(matches);
  return key ? FOCUS_STRINGS[key] : null;
}

export function sessionFocus(matches: MatchLike[]): InsightCard | null {
  const id = "focus";
  const title = "Suggested focus";
  const key = weakestFocus(matches);
  if (!key) {
    if (matches.length === 0) return null;
    return insufficient(id, title, 5, matches.length, "recent matches");
  }
  return { id, title, tone: "info", body: FOCUS_STRINGS[key] };
}

/** All insight cards, in dashboard order, dropping the inapplicable (null) ones. */
export function allInsights(matches: MatchLike[]): InsightCard[] {
  return [
    sessionFocus(matches),
    tiltCorrelation(matches),
    streakFatigue(matches),
    mapModeWeakness(matches),
    heroOverLoyalty(matches),
  ].filter((c): c is InsightCard => c !== null);
}
