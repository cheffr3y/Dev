import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildStateView, normalizeRoomCode } from "@/lib/trivia-engine";
import { advanceGameIfDue } from "@/lib/trivia";

// Poll endpoint — both phones GET this every ~2s. Public by design (see
// auth.config.ts): a room code scopes everything, an optional player token
// only personalizes the payload. Advancing the state machine here is what
// drives the game forward; no server timers exist.

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = normalizeRoomCode(rawCode);

  const found = await prisma.triviaGame.findUnique({ where: { code }, select: { id: true } });
  if (!found) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  await advanceGameIfDue(found.id);

  const game = await prisma.triviaGame.findUniqueOrThrow({
    where: { id: found.id },
    include: {
      players: { orderBy: { isHost: "desc" } },
      questions: { orderBy: { index: "asc" } },
    },
  });

  const answers = await prisma.triviaAnswer.findMany({
    where: { question: { gameId: game.id } },
    include: { question: { select: { index: true } } },
  });

  const token = request.nextUrl.searchParams.get("token");
  const viewerRow = token ? game.players.find((p) => p.token === token) : null;
  const viewer = viewerRow
    ? {
        playerId: viewerRow.id,
        hasAnswered: answers.some(
          (a) => a.playerId === viewerRow.id && a.question.index === game.currentIndex,
        ),
      }
    : null;

  const view = buildStateView({
    game,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      score: p.score,
    })),
    questions: game.questions.map((q) => ({
      index: q.index,
      category: q.category,
      difficulty: q.difficulty,
      prompt: q.prompt,
      answers: q.answers,
      correctIndex: q.correctIndex,
    })),
    answers: answers.map((a) => ({
      playerId: a.playerId,
      questionIndex: a.question.index,
      answerIndex: a.answerIndex,
      isCorrect: a.isCorrect,
      points: a.points,
    })),
    now: new Date(),
    viewer,
  });

  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
