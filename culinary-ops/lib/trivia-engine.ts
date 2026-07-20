// Trivia game engine — pure logic only (no Prisma, no I/O) so every rule is
// unit-testable. Timing is server-authoritative: the DB stores deadlines as
// timestamps and this module decides, given "now", what should happen next.
// Both phones poll every ~2s; whichever request arrives first past a deadline
// applies the transition (see advanceGameIfDue in lib/trivia.ts).

export const PLAYERS_PER_GAME = 2;
export const REVEAL_MS = 6_000; // scoreboard pause between questions
export const ANSWER_GRACE_MS = 750; // network slack past the deadline
export const STALE_GAME_MS = 2 * 60 * 60 * 1000; // idle games swept after 2h

export type GameStatus = "LOBBY" | "IN_QUESTION" | "REVEAL" | "FINISHED" | "ABANDONED";

// ── Room codes ──────────────────────────────────────────────────────────────
// 5 chars from a 32-symbol alphabet (no 0/O/1/I — unambiguous when read
// aloud across the room). ~33.5M combinations for games that live ≤2h.
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 5;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// ── Answer shuffling ────────────────────────────────────────────────────────
// Fisher–Yates over correct + incorrect answers; returns the shuffled list
// and where the correct answer landed. RNG injected for deterministic tests.
export function shuffleAnswers(
  correct: string,
  incorrect: string[],
  random: () => number = Math.random,
): { answers: string[]; correctIndex: number } {
  const answers = [correct, ...incorrect];
  for (let i = answers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [answers[i], answers[j]] = [answers[j], answers[i]];
  }
  return { answers, correctIndex: answers.indexOf(correct) };
}

// ── Scoring ─────────────────────────────────────────────────────────────────
// Correct answers earn 100 base + up to 100 speed bonus (linear: instant = 200,
// at the buzzer = 100). Wrong or missed = 0. elapsedMs is measured server-side.
export function scoreAnswer(input: {
  isCorrect: boolean;
  elapsedMs: number;
  durationMs: number;
}): number {
  if (!input.isCorrect) return 0;
  const frac = 1 - input.elapsedMs / input.durationMs;
  const clamped = Math.min(1, Math.max(0, frac));
  return 100 + Math.round(100 * clamped);
}

// An answer is accepted while the question is live, with a small grace window
// for network latency past the deadline.
export function isAnswerInTime(elapsedMs: number, durationMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs <= durationMs + ANSWER_GRACE_MS;
}

// ── State machine ───────────────────────────────────────────────────────────
// Given the current row and "now", return the transition that is due, or null.
// The caller applies it with an optimistic updateMany guarded on
// { status, currentIndex } so two concurrent polls can't double-advance.

export type EngineGame = {
  status: GameStatus;
  currentIndex: number;
  questionCount: number;
  questionSecs: number;
  questionDeadline: Date | null;
  revealDeadline: Date | null;
};

export type Transition =
  | { to: "REVEAL" }
  | { to: "IN_QUESTION"; nextIndex: number }
  | { to: "FINISHED" };

export function dueTransition(
  game: EngineGame,
  answeredCount: number,
  now: Date,
): Transition | null {
  if (game.status === "IN_QUESTION") {
    const deadlinePassed =
      game.questionDeadline !== null && now.getTime() >= game.questionDeadline.getTime();
    if (answeredCount >= PLAYERS_PER_GAME || deadlinePassed) return { to: "REVEAL" };
    return null;
  }
  if (game.status === "REVEAL") {
    const revealOver =
      game.revealDeadline !== null && now.getTime() >= game.revealDeadline.getTime();
    if (!revealOver) return null;
    const nextIndex = game.currentIndex + 1;
    if (nextIndex < game.questionCount) return { to: "IN_QUESTION", nextIndex };
    return { to: "FINISHED" };
  }
  return null; // LOBBY advances only via host Start; FINISHED/ABANDONED are terminal
}

// Deadlines stamped when a question goes live.
export function questionClock(questionSecs: number, now: Date) {
  return {
    questionStartedAt: now,
    questionDeadline: new Date(now.getTime() + questionSecs * 1000),
    revealDeadline: null,
  };
}

// ── Client state view ───────────────────────────────────────────────────────
// The single JSON shape both phones poll for. Built here (pure) so a test can
// assert the security property: correctIndex is NEVER exposed while the
// current question is live.

export type ViewQuestion = {
  index: number;
  category: string;
  difficulty: string;
  prompt: string;
  answers: string[];
  correctIndex: number;
};

export type ViewPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
};

export type ViewAnswer = {
  playerId: string;
  questionIndex: number;
  answerIndex: number;
  isCorrect: boolean;
  points: number;
};

export type StateView = {
  code: string;
  status: GameStatus;
  categoryName: string | null;
  difficulty: string | null;
  questionCount: number;
  questionSecs: number;
  currentIndex: number;
  questionDeadline: string | null;
  revealDeadline: string | null;
  rematchCode: string | null;
  serverNow: string; // client derives clock skew from this; display only
  players: ViewPlayer[];
  question: Omit<ViewQuestion, "correctIndex"> | null; // the live/current question
  correctIndex: number | null; // only set during REVEAL
  answers: ViewAnswer[]; // revealed answers (current question in REVEAL, all in FINISHED)
  recap: ViewQuestion[] | null; // full questions incl. correct answers; FINISHED only
  you: { playerId: string; hasAnswered: boolean } | null;
};

export function buildStateView(input: {
  game: {
    code: string;
    status: GameStatus;
    categoryName: string | null;
    difficulty: string | null;
    questionCount: number;
    questionSecs: number;
    currentIndex: number;
    questionDeadline: Date | null;
    revealDeadline: Date | null;
    rematchCode: string | null;
  };
  players: ViewPlayer[];
  questions: ViewQuestion[];
  answers: ViewAnswer[];
  now: Date;
  viewer: { playerId: string; hasAnswered: boolean } | null;
}): StateView {
  const { game, now } = input;
  const showCurrent = game.status === "IN_QUESTION" || game.status === "REVEAL";
  const current = showCurrent
    ? (input.questions.find((q) => q.index === game.currentIndex) ?? null)
    : null;
  const revealed = game.status === "REVEAL" || game.status === "FINISHED";

  return {
    code: game.code,
    status: game.status,
    categoryName: game.categoryName,
    difficulty: game.difficulty,
    questionCount: game.questionCount,
    questionSecs: game.questionSecs,
    currentIndex: game.currentIndex,
    questionDeadline: game.questionDeadline?.toISOString() ?? null,
    revealDeadline: game.revealDeadline?.toISOString() ?? null,
    rematchCode: game.rematchCode,
    serverNow: now.toISOString(),
    players: input.players,
    question: current
      ? {
          index: current.index,
          category: current.category,
          difficulty: current.difficulty,
          prompt: current.prompt,
          answers: current.answers,
        }
      : null,
    // The correct answer is only ever disclosed once the question closes.
    correctIndex: revealed && current ? current.correctIndex : null,
    answers: revealed
      ? input.answers.filter(
          (a) =>
            game.status === "FINISHED" ||
            (a.questionIndex === game.currentIndex && game.status === "REVEAL"),
        )
      : [],
    recap: game.status === "FINISHED" ? input.questions : null,
    you: input.viewer,
  };
}
