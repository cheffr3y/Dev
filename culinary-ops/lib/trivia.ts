// Trivia glue over the pure engine (lib/trivia-engine.ts): Open Trivia DB
// fetching, game creation/lookup, and the lazy state-machine driver that both
// the poll endpoint and answer submissions run through.

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  PLAYERS_PER_GAME,
  REVEAL_MS,
  STALE_GAME_MS,
  dueTransition,
  generateRoomCode,
  questionClock,
  shuffleAnswers,
} from "@/lib/trivia-engine";
import { CUSTOM_QUESTIONS } from "@/lib/trivia-custom";
import { FALLBACK_QUESTIONS, type RawQuestion } from "@/lib/trivia-fallback";

// The category the players write themselves in lib/trivia-custom.ts. Not an
// OpenTDB id — getQuestions branches on it and never calls the API.
export const CUSTOM_CATEGORY_ID = -1;

// The full OpenTDB category list (ids are stable; https://opentdb.com/api_category.php).
// A static list avoids a third-party call on every page load.
export const TRIVIA_CATEGORIES = [
  { id: CUSTOM_CATEGORY_ID, name: "House Questions" },
  { id: 9, name: "General Knowledge" },
  { id: 10, name: "Books" },
  { id: 11, name: "Film" },
  { id: 12, name: "Music" },
  { id: 13, name: "Musicals & Theatres" },
  { id: 14, name: "Television" },
  { id: 15, name: "Video Games" },
  { id: 16, name: "Board Games" },
  { id: 17, name: "Science & Nature" },
  { id: 18, name: "Computers" },
  { id: 19, name: "Mathematics" },
  { id: 20, name: "Mythology" },
  { id: 21, name: "Sports" },
  { id: 22, name: "Geography" },
  { id: 23, name: "History" },
  { id: 24, name: "Politics" },
  { id: 25, name: "Art" },
  { id: 26, name: "Celebrities" },
  { id: 27, name: "Animals" },
  { id: 28, name: "Vehicles" },
  { id: 29, name: "Comics" },
  { id: 30, name: "Science: Gadgets" },
  { id: 31, name: "Anime & Manga" },
  { id: 32, name: "Cartoons & Animations" },
] as const;

export const TRIVIA_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function newPlayerToken(): string {
  return randomBytes(16).toString("hex");
}

// ── OpenTDB fetch ───────────────────────────────────────────────────────────
// encode=url3986 makes every field RFC-3986 percent-encoded, which sidesteps
// OpenTDB's default HTML entities entirely — decodeURIComponent restores the
// real text ("Ñ", quotes, ampersands) with no entity table.

type OpenTdbResponse = {
  response_code: number;
  results: Array<{
    category: string;
    difficulty: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
  }>;
};

async function fetchOpenTdb(params: {
  amount: number;
  categoryId?: number | null;
  difficulty?: string | null;
}): Promise<RawQuestion[] | null> {
  const url = new URL("https://opentdb.com/api.php");
  url.searchParams.set("amount", String(params.amount));
  url.searchParams.set("type", "multiple");
  url.searchParams.set("encode", "url3986");
  if (params.categoryId) url.searchParams.set("category", String(params.categoryId));
  if (params.difficulty) url.searchParams.set("difficulty", params.difficulty);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenTdbResponse;
    if (data.response_code !== 0 || !Array.isArray(data.results) || data.results.length === 0) {
      return null;
    }
    return data.results.map((q) => ({
      category: decodeURIComponent(q.category),
      difficulty: decodeURIComponent(q.difficulty),
      question: decodeURIComponent(q.question),
      correct_answer: decodeURIComponent(q.correct_answer),
      incorrect_answers: q.incorrect_answers.map((a) => decodeURIComponent(a)),
    }));
  } catch {
    return null; // network error / timeout — caller falls back
  }
}

// Shuffle a local question pool and take up to `amount`, so back-to-back
// games from the same pool still differ. A pool smaller than `amount` just
// yields a shorter game (createGame stores the actual count).
function samplePool(pool: readonly RawQuestion[], amount: number): RawQuestion[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, amount);
}

// Fetch questions for a new game. "House Questions" comes from the local
// custom file. Otherwise tries OpenTDB with the requested category/difficulty,
// then relaxes the category (OpenTDB code 1 = not enough questions there),
// and finally falls back to the built-in set so creation never fails.
export async function getQuestions(params: {
  amount: number;
  categoryId?: number | null;
  difficulty?: string | null;
}): Promise<{ questions: RawQuestion[]; usedFallback: boolean }> {
  if (params.categoryId === CUSTOM_CATEGORY_ID) {
    return { questions: samplePool(CUSTOM_QUESTIONS, params.amount), usedFallback: false };
  }

  const primary = await fetchOpenTdb(params);
  if (primary) return { questions: primary, usedFallback: false };

  if (params.categoryId) {
    const relaxed = await fetchOpenTdb({ ...params, categoryId: null });
    if (relaxed) return { questions: relaxed, usedFallback: false };
  }

  return { questions: samplePool(FALLBACK_QUESTIONS, params.amount), usedFallback: true };
}

// ── Game creation ───────────────────────────────────────────────────────────

export async function createGame(params: {
  hostUserId: string | null;
  hostName: string;
  categoryId: number | null;
  difficulty: string | null;
  questionCount: number;
  questionSecs: number;
  // Rematch: seed the new game with both existing players (tokens must have
  // been freed from their old rows first — token is globally unique).
  presetPlayers?: Array<{ name: string; isHost: boolean; token: string }>;
}): Promise<{ code: string; hostToken: string; usedFallback: boolean }> {
  // Lazy housekeeping: abandon games nobody touched for 2h.
  await prisma.triviaGame.updateMany({
    where: {
      status: { notIn: ["FINISHED", "ABANDONED"] },
      updatedAt: { lt: new Date(Date.now() - STALE_GAME_MS) },
    },
    data: { status: "ABANDONED" },
  });

  const categoryName =
    TRIVIA_CATEGORIES.find((c) => c.id === params.categoryId)?.name ?? null;
  const { questions, usedFallback } = await getQuestions({
    amount: params.questionCount,
    categoryId: params.categoryId,
    difficulty: params.difficulty,
  });

  const players = params.presetPlayers ?? [
    { name: params.hostName, isHost: true, token: newPlayerToken() },
  ];
  const hostToken = players.find((p) => p.isHost)?.token ?? players[0].token;

  // Retry on the (unlikely) room-code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    try {
      await prisma.triviaGame.create({
        data: {
          code,
          hostUserId: params.hostUserId,
          categoryId: params.categoryId,
          categoryName,
          difficulty: params.difficulty,
          questionCount: questions.length,
          questionSecs: params.questionSecs,
          questions: {
            create: questions.map((q, index) => {
              const { answers, correctIndex } = shuffleAnswers(
                q.correct_answer,
                q.incorrect_answers,
              );
              return {
                index,
                category: q.category,
                difficulty: q.difficulty,
                prompt: q.question,
                answers,
                correctIndex,
              };
            }),
          },
          players: { create: players },
        },
      });
      return { code, hostToken, usedFallback };
    } catch (err) {
      const isUniqueViolation =
        typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
      if (!isUniqueViolation || attempt === 4) throw err;
    }
  }
  throw new Error("could not allocate a room code");
}

// ── Lazy state-machine driver ───────────────────────────────────────────────
// Called at the top of every state poll and every answer submission. Applies
// at most one due transition per call; guarded updateMany means concurrent
// polls from the two phones can never double-advance.

export async function advanceGameIfDue(gameId: string): Promise<void> {
  const game = await prisma.triviaGame.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      status: true,
      currentIndex: true,
      questionCount: true,
      questionSecs: true,
      questionDeadline: true,
      revealDeadline: true,
    },
  });
  if (!game) return;
  if (game.status !== "IN_QUESTION" && game.status !== "REVEAL") return;

  const now = new Date();
  let answeredCount = 0;
  if (game.status === "IN_QUESTION") {
    answeredCount = await prisma.triviaAnswer.count({
      where: { question: { gameId: game.id, index: game.currentIndex } },
    });
  }

  const transition = dueTransition(game, answeredCount, now);
  if (!transition) return;

  const guard = { id: game.id, status: game.status, currentIndex: game.currentIndex };
  if (transition.to === "REVEAL") {
    await prisma.triviaGame.updateMany({
      where: guard,
      data: { status: "REVEAL", revealDeadline: new Date(now.getTime() + REVEAL_MS) },
    });
  } else if (transition.to === "IN_QUESTION") {
    await prisma.triviaGame.updateMany({
      where: guard,
      data: { status: "IN_QUESTION", currentIndex: transition.nextIndex, ...questionClock(game.questionSecs, now) },
    });
  } else {
    await prisma.triviaGame.updateMany({
      where: guard,
      data: { status: "FINISHED" },
    });
  }
}

export { PLAYERS_PER_GAME };
