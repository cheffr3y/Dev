"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  PLAYERS_PER_GAME,
  isAnswerInTime,
  normalizeRoomCode,
  questionClock,
  scoreAnswer,
} from "@/lib/trivia-engine";
import { advanceGameIfDue, createGame, newPlayerToken } from "@/lib/trivia";

// Public, token-scoped mutations for the play surface. No session — a player
// (host included) is whoever holds a TriviaPlayer token for the game found by
// room code. Every action re-checks that pairing; nothing here can read or
// write outside the Trivia* tables.

const codeSchema = z
  .string()
  .trim()
  .min(4)
  .max(8)
  .transform((s) => normalizeRoomCode(s));

const tokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

async function requirePlayer(code: string, token: string) {
  const game = await prisma.triviaGame.findUnique({ where: { code } });
  if (!game) throw new Error("Game not found.");
  const player = await prisma.triviaPlayer.findUnique({ where: { token } });
  if (!player || player.gameId !== game.id) throw new Error("You're not in this game.");
  return { game, player };
}

// ── Join ────────────────────────────────────────────────────────────────────

const joinSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, "Tell us your name").max(24),
});

export async function joinGame(input: {
  code: string;
  name: string;
}): Promise<{ ok: true; code: string; token: string } | { ok: false; error: string }> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the room code and your name." };
  const { code, name } = parsed.data;

  const game = await prisma.triviaGame.findUnique({
    where: { code },
    include: { players: true },
  });
  if (!game) return { ok: false, error: "No game with that code — double-check it." };
  if (game.status !== "LOBBY") {
    return { ok: false, error: "That game has already started." };
  }
  if (game.players.length >= PLAYERS_PER_GAME) {
    return { ok: false, error: "That room is already full." };
  }

  const token = newPlayerToken();
  await prisma.triviaPlayer.create({
    data: { gameId: game.id, name, token },
  });
  return { ok: true, code, token };
}

// ── Host: start ─────────────────────────────────────────────────────────────

const gameActionSchema = z.object({ code: codeSchema, token: tokenSchema });

export async function startGame(input: { code: string; token: string }): Promise<void> {
  const { code, token } = gameActionSchema.parse(input);
  const { game, player } = await requirePlayer(code, token);
  if (!player.isHost) throw new Error("Only the host can start the game.");
  if (game.status !== "LOBBY") return; // already started — poll will catch up

  const playerCount = await prisma.triviaPlayer.count({ where: { gameId: game.id } });
  if (playerCount < PLAYERS_PER_GAME) throw new Error("Waiting for your opponent to join.");

  await prisma.triviaGame.updateMany({
    where: { id: game.id, status: "LOBBY" },
    data: { status: "IN_QUESTION", currentIndex: 0, ...questionClock(game.questionSecs, new Date()) },
  });
}

// ── Answer ──────────────────────────────────────────────────────────────────

const answerSchema = gameActionSchema.extend({
  questionIndex: z.number().int().min(0),
  answerIndex: z.number().int().min(0).max(5),
});

export async function submitAnswer(input: {
  code: string;
  token: string;
  questionIndex: number;
  answerIndex: number;
}): Promise<{ accepted: boolean }> {
  const d = answerSchema.parse(input);
  const { game, player } = await requirePlayer(d.code, d.token);

  // A poll may not have advanced the game yet — do it now so a submit that
  // races the deadline is judged against fresh state.
  await advanceGameIfDue(game.id);
  const fresh = await prisma.triviaGame.findUniqueOrThrow({ where: { id: game.id } });

  if (
    fresh.status !== "IN_QUESTION" ||
    fresh.currentIndex !== d.questionIndex ||
    !fresh.questionStartedAt
  ) {
    return { accepted: false };
  }

  const now = new Date();
  const elapsedMs = now.getTime() - fresh.questionStartedAt.getTime();
  const durationMs = fresh.questionSecs * 1000;
  if (!isAnswerInTime(elapsedMs, durationMs)) return { accepted: false };

  const question = await prisma.triviaQuestion.findUnique({
    where: { gameId_index: { gameId: fresh.id, index: fresh.currentIndex } },
  });
  if (!question || d.answerIndex >= question.answers.length) return { accepted: false };

  const isCorrect = d.answerIndex === question.correctIndex;
  const points = scoreAnswer({ isCorrect, elapsedMs, durationMs });

  try {
    await prisma.$transaction([
      prisma.triviaAnswer.create({
        data: {
          playerId: player.id,
          questionId: question.id,
          answerIndex: d.answerIndex,
          isCorrect,
          elapsedMs,
          points,
        },
      }),
      prisma.triviaPlayer.update({
        where: { id: player.id },
        data: { score: { increment: points }, lastSeenAt: now },
      }),
    ]);
  } catch (err) {
    // Unique (playerId, questionId) violation = double tap; first tap stands.
    const isUniqueViolation =
      typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
    if (isUniqueViolation) return { accepted: false };
    throw err;
  }

  // If that was the second answer, flip to REVEAL right away.
  await advanceGameIfDue(game.id);
  return { accepted: true };
}

// ── Host: rematch ───────────────────────────────────────────────────────────

export async function requestRematch(
  input: { code: string; token: string },
): Promise<{ code: string } > {
  const { code, token } = gameActionSchema.parse(input);
  const { game, player } = await requirePlayer(code, token);
  if (!player.isHost) throw new Error("Only the host can call a rematch.");
  if (game.status !== "FINISHED") throw new Error("The game isn't over yet.");
  if (game.rematchCode) return { code: game.rematchCode }; // already created

  const players = await prisma.triviaPlayer.findMany({
    where: { gameId: game.id },
    orderBy: { isHost: "desc" },
  });

  // Same table, fresh questions, same tokens — both phones hop to the new
  // lobby without retyping anything. Tokens are globally unique, so free them
  // from the finished game's rows before the new game claims them.
  await prisma.$transaction(
    players.map((p) =>
      prisma.triviaPlayer.update({
        where: { id: p.id },
        data: { token: newPlayerToken() },
      }),
    ),
  );

  const created = await createGame({
    hostUserId: game.hostUserId,
    hostName: players[0]?.name ?? "Host",
    categoryId: game.categoryId,
    difficulty: game.difficulty,
    questionCount: game.questionCount,
    questionSecs: game.questionSecs,
    presetPlayers: players.map((p) => ({ name: p.name, isHost: p.isHost, token: p.token })),
  });

  await prisma.triviaGame.update({
    where: { id: game.id },
    data: { rematchCode: created.code },
  });

  return { code: created.code };
}

// ── Host: end early ─────────────────────────────────────────────────────────

export async function endGame(input: { code: string; token: string }): Promise<void> {
  const { code, token } = gameActionSchema.parse(input);
  const { game, player } = await requirePlayer(code, token);
  if (!player.isHost) throw new Error("Only the host can end the game.");
  if (game.status === "FINISHED" || game.status === "ABANDONED") return;
  await prisma.triviaGame.update({
    where: { id: game.id },
    data: { status: "ABANDONED" },
  });
}
