"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/session";
import { HERO_BY_ID, poolByRole } from "@/lib/ow/data/heroes";
import { MAP_BY_ID } from "@/lib/ow/data/maps";
import { focusStringFor } from "@/lib/ow/insights";
import { personalStatsByHero, byHero } from "@/lib/ow/stats";
import { recommend } from "@/lib/ow/counterEngine";

// A match >90 min after the previous one opens a fresh session (spec §6).
const SESSION_GAP_MS = 90 * 60 * 1000;

const rating = z.coerce.number().int().min(1).max(5);

// Enemy comp / hero swaps arrive as comma-separated hidden inputs from the tap
// UI. Keep only ids we recognise so bad data never reaches the engine.
function parseHeroIds(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((id) => id && HERO_BY_ID[id]);
}

const matchSchema = z.object({
  role: z.enum(["TANK", "DPS", "SUPPORT"]),
  hero: z.string().min(1),
  map: z.string().min(1),
  result: z.enum(["WIN", "LOSS", "DRAW"]),
  ratePositioning: rating,
  rateUltUsage: rating,
  rateTilt: rating,
  deaths: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().optional(),
});

/**
 * Find the session a new match should join, or null if a fresh one is needed.
 * Auto-closes a stale open session (last activity >90 min ago) as a side effect
 * so it doesn't silently swallow a new run.
 */
async function resolveSessionId(userId: string): Promise<string | null> {
  const open = await prisma.owSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: { matches: { orderBy: { playedAt: "desc" }, take: 1 } },
  });
  if (!open) return null;
  const lastActivity = open.matches[0]?.playedAt ?? open.startedAt;
  if (Date.now() - lastActivity.getTime() > SESSION_GAP_MS) {
    await prisma.owSession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
    return null;
  }
  return open.id;
}

export async function logMatch(formData: FormData) {
  const user = await requireActiveUser();
  const d = matchSchema.parse({
    role: formData.get("role"),
    hero: formData.get("hero"),
    map: formData.get("map"),
    result: formData.get("result"),
    ratePositioning: formData.get("ratePositioning"),
    rateUltUsage: formData.get("rateUltUsage"),
    rateTilt: formData.get("rateTilt"),
    deaths: formData.get("deaths") || undefined,
    notes: formData.get("notes") || undefined,
  });

  // Validate hero/map against reference data; hero must match the role.
  const hero = HERO_BY_ID[d.hero];
  if (!hero || hero.role !== d.role) throw new Error("Unknown hero for that role");
  if (!MAP_BY_ID[d.map]) throw new Error("Unknown map");

  let sessionId = await resolveSessionId(user.id);
  if (!sessionId) {
    // Open a new session, defaulting its focus goal from recent self-ratings.
    const recent = await prisma.owMatch.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: "desc" },
      take: 10,
      select: { playedAt: true, ratePositioning: true, rateUltUsage: true, rateTilt: true, role: true, hero: true, map: true, result: true, sessionId: true },
    });
    const created = await prisma.owSession.create({
      data: { userId: user.id, focusGoal: focusStringFor(recent) },
    });
    sessionId = created.id;
  }

  await prisma.owMatch.create({
    data: {
      userId: user.id,
      sessionId,
      role: d.role,
      hero: d.hero,
      heroSwaps: parseHeroIds(formData.get("heroSwaps")),
      map: d.map,
      result: d.result,
      ratePositioning: d.ratePositioning,
      rateUltUsage: d.rateUltUsage,
      rateTilt: d.rateTilt,
      deaths: d.deaths ?? null,
      enemyComp: parseHeroIds(formData.get("enemyComp")),
      notes: d.notes || null,
    },
  });

  revalidatePath("/ow");
  revalidatePath("/ow/matches");
  redirect("/ow");
}

// --- Session controls -------------------------------------------------------

export async function startSession(formData: FormData) {
  const user = await requireActiveUser();
  const focusGoal = String(formData.get("focusGoal") || "").trim();
  // Close any dangling open session first — only one is active at a time.
  await prisma.owSession.updateMany({
    where: { userId: user.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  await prisma.owSession.create({
    data: { userId: user.id, focusGoal: focusGoal || null },
  });
  revalidatePath("/ow");
  redirect("/ow");
}

export async function endSession(formData: FormData) {
  const user = await requireActiveUser();
  const id = String(formData.get("id"));
  await prisma.owSession.updateMany({
    where: { id, userId: user.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  revalidatePath("/ow");
}

// --- Match edit / delete ----------------------------------------------------

export async function updateMatch(formData: FormData) {
  const user = await requireActiveUser();
  const id = String(formData.get("id"));
  const d = matchSchema.parse({
    role: formData.get("role"),
    hero: formData.get("hero"),
    map: formData.get("map"),
    result: formData.get("result"),
    ratePositioning: formData.get("ratePositioning"),
    rateUltUsage: formData.get("rateUltUsage"),
    rateTilt: formData.get("rateTilt"),
    deaths: formData.get("deaths") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const hero = HERO_BY_ID[d.hero];
  if (!hero || hero.role !== d.role) throw new Error("Unknown hero for that role");
  if (!MAP_BY_ID[d.map]) throw new Error("Unknown map");

  // Scope the update to this user's row so nobody can edit another's match.
  await prisma.owMatch.updateMany({
    where: { id, userId: user.id },
    data: {
      role: d.role,
      hero: d.hero,
      heroSwaps: parseHeroIds(formData.get("heroSwaps")),
      map: d.map,
      result: d.result,
      ratePositioning: d.ratePositioning,
      rateUltUsage: d.rateUltUsage,
      rateTilt: d.rateTilt,
      deaths: d.deaths ?? null,
      enemyComp: parseHeroIds(formData.get("enemyComp")),
      notes: d.notes || null,
    },
  });
  revalidatePath("/ow/matches");
  revalidatePath("/ow");
  redirect("/ow/matches");
}

export async function deleteMatch(formData: FormData) {
  const user = await requireActiveUser();
  const id = String(formData.get("id"));
  await prisma.owMatch.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/ow/matches");
  revalidatePath("/ow");
}

// --- AI deep analysis (Server Action) ---------------------------------------

export interface AnalyzeInput {
  map: string;
  enemyHeroes: string[];
  role: "TANK" | "DPS" | "SUPPORT";
}

export interface AnalyzeResult {
  primary: string;
  alternates: string[];
  reasoning: string;
  swapTriggers: string;
}

export type AnalyzeResponse =
  | { ok: true; data: AnalyzeResult }
  | { ok: false; error: string };

// Strip ```json fences the model sometimes wraps JSON in, then take the first
// {...} block. Defensive per spec §5.2 — the rules result already stands.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

/**
 * Optional AI deep analysis layered on the rules engine. API key lives in server
 * env only (ANTHROPIC_API_KEY) — same rule as the recipe generator. Never
 * client-side. Fails soft: the caller keeps the instant rules result on error.
 */
export async function analyzeCounterPick(input: AnalyzeInput): Promise<AnalyzeResponse> {
  const user = await requireActiveUser();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "AI analysis isn't configured (no API key)." };

  const map = MAP_BY_ID[input.map];
  if (!map) return { ok: false, error: "Unknown map." };

  const enemyHeroes = input.enemyHeroes.filter((id) => HERO_BY_ID[id]);
  const pool = poolByRole(input.role).map((h) => h.id);
  if (pool.length === 0) return { ok: false, error: `No ${input.role.toLowerCase()} heroes in your pool.` };

  // Pull the user's own win rates to ground the prompt and the rules result.
  const matches = await prisma.owMatch.findMany({
    where: { userId: user.id },
    select: { role: true, hero: true, map: true, result: true, ratePositioning: true, rateUltUsage: true, rateTilt: true, playedAt: true, sessionId: true },
  });
  const personalStats = personalStatsByHero(matches);
  const rules = recommend({ map: input.map, enemyHeroes, role: input.role, pool, personalStats });

  const topWinRates = byHero(matches)
    .slice(0, 15)
    .map((h) => `${h.heroName}: ${Math.round(h.winRate * 100)}% over ${h.games} games`)
    .join("; ");

  const prompt = [
    `You are an Overwatch 2 counter-pick coach for a single player ("Jeff").`,
    `Map: ${map.name} (${map.mode}, traits: ${map.traits.join(", ")}).`,
    `Jeff is filling the ${input.role} slot.`,
    `Known enemy heroes: ${enemyHeroes.map((id) => HERO_BY_ID[id]!.name).join(", ") || "unknown"}.`,
    `Jeff's playable ${input.role} pool: ${pool.map((id) => HERO_BY_ID[id]!.name).join(", ")}.`,
    `Jeff's win rates (top by games): ${topWinRates || "no games logged yet"}.`,
    `The rules engine classified the enemy comp as ${rules.archetype} and ranked its top picks: ${rules.recommendations.map((r) => `${r.heroName} (${r.score})`).join(", ")}.`,
    `Recommend from Jeff's pool only. Weigh his personal win rates: a hero he wins on can beat a theoretical counter he loses on.`,
    `Respond with JSON only, no prose, matching exactly:`,
    `{"primary": "<hero name>", "alternates": ["<hero name>", ...], "reasoning": "<2-3 sentences>", "swapTriggers": "<if X happens mid-match, swap to Y>"}`,
  ].join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = JSON.parse(extractJson(text)) as Partial<AnalyzeResult>;
    if (!parsed.primary || typeof parsed.primary !== "string") {
      return { ok: false, error: "AI response wasn't usable — showing rules result." };
    }
    return {
      ok: true,
      data: {
        primary: parsed.primary,
        alternates: Array.isArray(parsed.alternates) ? parsed.alternates.slice(0, 3) : [],
        reasoning: String(parsed.reasoning ?? ""),
        swapTriggers: String(parsed.swapTriggers ?? ""),
      },
    };
  } catch {
    // Any failure (network, parse, API) leaves the rules result standing.
    return { ok: false, error: "AI analysis failed — the rules result still applies." };
  }
}
