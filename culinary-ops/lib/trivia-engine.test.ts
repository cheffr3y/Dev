import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANSWER_GRACE_MS,
  CODE_ALPHABET,
  CODE_LENGTH,
  REVEAL_MS,
  buildStateView,
  dueTransition,
  generateRoomCode,
  isAnswerInTime,
  normalizeRoomCode,
  questionClock,
  scoreAnswer,
  shuffleAnswers,
  type EngineGame,
  type ViewQuestion,
} from "./trivia-engine";

// ── scoreAnswer ─────────────────────────────────────────────────────────────
test("scoreAnswer: wrong answers score zero regardless of speed", () => {
  assert.equal(scoreAnswer({ isCorrect: false, elapsedMs: 0, durationMs: 20000 }), 0);
  assert.equal(scoreAnswer({ isCorrect: false, elapsedMs: 19999, durationMs: 20000 }), 0);
});

test("scoreAnswer: instant correct answer earns the full 200", () => {
  assert.equal(scoreAnswer({ isCorrect: true, elapsedMs: 0, durationMs: 20000 }), 200);
});

test("scoreAnswer: buzzer-beater correct answer earns the 100 base", () => {
  assert.equal(scoreAnswer({ isCorrect: true, elapsedMs: 20000, durationMs: 20000 }), 100);
});

test("scoreAnswer: halfway earns 150; faster always beats slower", () => {
  assert.equal(scoreAnswer({ isCorrect: true, elapsedMs: 10000, durationMs: 20000 }), 150);
  const fast = scoreAnswer({ isCorrect: true, elapsedMs: 3000, durationMs: 20000 });
  const slow = scoreAnswer({ isCorrect: true, elapsedMs: 15000, durationMs: 20000 });
  assert.ok(fast > slow);
});

test("scoreAnswer: grace-window answers clamp at the 100 base, never negative", () => {
  assert.equal(
    scoreAnswer({ isCorrect: true, elapsedMs: 20000 + ANSWER_GRACE_MS, durationMs: 20000 }),
    100,
  );
});

// ── isAnswerInTime ──────────────────────────────────────────────────────────
test("isAnswerInTime: accepts within duration plus grace, rejects beyond", () => {
  assert.ok(isAnswerInTime(0, 20000));
  assert.ok(isAnswerInTime(20000, 20000));
  assert.ok(isAnswerInTime(20000 + ANSWER_GRACE_MS, 20000));
  assert.ok(!isAnswerInTime(20000 + ANSWER_GRACE_MS + 1, 20000));
  assert.ok(!isAnswerInTime(-1, 20000));
});

// ── dueTransition ───────────────────────────────────────────────────────────
function game(over: Partial<EngineGame>): EngineGame {
  return {
    status: "IN_QUESTION",
    currentIndex: 0,
    questionCount: 10,
    questionSecs: 20,
    questionDeadline: new Date("2026-07-20T12:00:20Z"),
    revealDeadline: null,
    ...over,
  };
}
const before = new Date("2026-07-20T12:00:10Z");
const after = new Date("2026-07-20T12:00:20Z");

test("dueTransition: question stays live while time remains and someone hasn't answered", () => {
  assert.equal(dueTransition(game({}), 0, before), null);
  assert.equal(dueTransition(game({}), 1, before), null);
});

test("dueTransition: both answered early moves to REVEAL before the deadline", () => {
  assert.deepEqual(dueTransition(game({}), 2, before), { to: "REVEAL" });
});

test("dueTransition: deadline passing moves to REVEAL even with one or zero answers", () => {
  assert.deepEqual(dueTransition(game({}), 0, after), { to: "REVEAL" });
  assert.deepEqual(dueTransition(game({}), 1, after), { to: "REVEAL" });
});

test("dueTransition: reveal window holds, then advances to the next question", () => {
  const g = game({ status: "REVEAL", revealDeadline: new Date("2026-07-20T12:00:26Z") });
  assert.equal(dueTransition(g, 2, new Date("2026-07-20T12:00:23Z")), null);
  assert.deepEqual(dueTransition(g, 2, new Date("2026-07-20T12:00:26Z")), {
    to: "IN_QUESTION",
    nextIndex: 1,
  });
});

test("dueTransition: reveal after the last question finishes the game", () => {
  const g = game({
    status: "REVEAL",
    currentIndex: 9,
    revealDeadline: new Date("2026-07-20T12:00:26Z"),
  });
  assert.deepEqual(dueTransition(g, 2, new Date("2026-07-20T12:00:26Z")), { to: "FINISHED" });
});

test("dueTransition: LOBBY, FINISHED, and ABANDONED never auto-advance", () => {
  for (const status of ["LOBBY", "FINISHED", "ABANDONED"] as const) {
    assert.equal(dueTransition(game({ status }), 2, after), null);
  }
});

// ── questionClock ───────────────────────────────────────────────────────────
test("questionClock: stamps start and deadline, clears the reveal window", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  const clock = questionClock(20, now);
  assert.equal(clock.questionStartedAt, now);
  assert.equal(clock.questionDeadline.getTime(), now.getTime() + 20000);
  assert.equal(clock.revealDeadline, null);
  assert.equal(REVEAL_MS, 6000);
});

// ── shuffleAnswers ──────────────────────────────────────────────────────────
test("shuffleAnswers: correctIndex always points at the correct answer", () => {
  // Deterministic RNG cycling through fixed values covers several permutations.
  const seq = [0.1, 0.9, 0.5, 0.3, 0.7];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  for (let run = 0; run < 5; run++) {
    const { answers, correctIndex } = shuffleAnswers("right", ["a", "b", "c"], rng);
    assert.equal(answers[correctIndex], "right");
    assert.deepEqual([...answers].sort(), ["a", "b", "c", "right"]);
  }
});

test("shuffleAnswers: works for true/false style two-answer questions", () => {
  const { answers, correctIndex } = shuffleAnswers("True", ["False"], () => 0.99);
  assert.equal(answers.length, 2);
  assert.equal(answers[correctIndex], "True");
});

// ── room codes ──────────────────────────────────────────────────────────────
test("generateRoomCode: right length, only unambiguous characters", () => {
  const code = generateRoomCode();
  assert.equal(code.length, CODE_LENGTH);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `unexpected char ${ch}`);
  assert.ok(!/[0O1I]/.test(CODE_ALPHABET));
});

test("normalizeRoomCode: trims and uppercases what players type", () => {
  assert.equal(normalizeRoomCode("  k7qf2 "), "K7QF2");
});

// ── buildStateView (security-critical) ──────────────────────────────────────
const viewQuestions: ViewQuestion[] = [
  {
    index: 0,
    category: "General",
    difficulty: "easy",
    prompt: "Q1?",
    answers: ["a", "b", "c", "d"],
    correctIndex: 2,
  },
  {
    index: 1,
    category: "General",
    difficulty: "easy",
    prompt: "Q2?",
    answers: ["e", "f", "g", "h"],
    correctIndex: 0,
  },
];

function view(status: "LOBBY" | "IN_QUESTION" | "REVEAL" | "FINISHED", currentIndex = 0) {
  return buildStateView({
    game: {
      code: "K7QF2",
      status,
      categoryName: "General",
      difficulty: null,
      questionCount: 2,
      questionSecs: 20,
      currentIndex,
      questionDeadline: new Date("2026-07-20T12:00:20Z"),
      revealDeadline: null,
      rematchCode: null,
    },
    players: [
      { id: "p1", name: "Host", isHost: true, score: 150 },
      { id: "p2", name: "Guest", isHost: false, score: 200 },
    ],
    questions: viewQuestions,
    answers: [
      { playerId: "p1", questionIndex: 0, answerIndex: 2, isCorrect: true, points: 150 },
      { playerId: "p2", questionIndex: 1, answerIndex: 3, isCorrect: false, points: 0 },
    ],
    now: new Date("2026-07-20T12:00:05Z"),
    viewer: { playerId: "p1", hasAnswered: true },
  });
}

test("buildStateView: never leaks the correct answer while a question is live", () => {
  const v = view("IN_QUESTION");
  assert.equal(v.correctIndex, null);
  assert.equal(v.recap, null);
  assert.deepEqual(v.answers, []);
  // Belt and braces: the serialized payload must not contain the field at all
  // outside the explicit null.
  const json = JSON.stringify(v);
  assert.ok(!json.includes('"correctIndex":2'));
  assert.equal(v.question?.prompt, "Q1?");
  assert.ok(v.question && !("correctIndex" in v.question));
});

test("buildStateView: reveals the correct answer and round answers in REVEAL", () => {
  const v = view("REVEAL");
  assert.equal(v.correctIndex, 2);
  assert.equal(v.answers.length, 1);
  assert.equal(v.answers[0].playerId, "p1");
});

test("buildStateView: FINISHED exposes the full recap and every answer", () => {
  const v = view("FINISHED", 1);
  assert.equal(v.recap?.length, 2);
  assert.equal(v.answers.length, 2);
  assert.equal(v.question, null);
});

test("buildStateView: LOBBY shows no question at all", () => {
  const v = view("LOBBY");
  assert.equal(v.question, null);
  assert.equal(v.correctIndex, null);
  assert.equal(v.you?.hasAnswered, true);
  assert.equal(v.serverNow, "2026-07-20T12:00:05.000Z");
});
