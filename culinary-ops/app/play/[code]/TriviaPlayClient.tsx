"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, cn } from "@/components/ui";
import type { StateView } from "@/lib/trivia-engine";
import { joinGame, requestRematch, startGame, submitAnswer } from "../actions";

const POLL_MS = 2000;

// The player's secret for this room, kept in localStorage so a refresh or
// app-switch keeps their identity. Only ever called on the client.
function storedToken(code: string): string | null {
  return localStorage.getItem(`trivia:player:${code}`);
}

// The whole game runs off one polled StateView. The server owns all timing;
// this component only renders what the latest poll said and fires actions.
export function TriviaPlayClient({ code }: { code: string }) {
  const router = useRouter();
  const [view, setView] = useState<StateView | null>(null);
  const [gone, setGone] = useState(false);
  // serverNow at fetch time minus local clock — added back when rendering
  // countdowns so a phone with a wrong clock still sees the right number.
  const skewRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const token = storedToken(code);
      const qs = token ? `?token=${token}` : "";
      const res = await fetch(`/api/trivia/${code}/state${qs}`, { cache: "no-store" });
      if (res.status === 404) {
        setGone(true);
        return;
      }
      if (!res.ok) return; // transient — keep the last view
      const next = (await res.json()) as StateView;
      skewRef.current = new Date(next.serverNow).getTime() - Date.now();
      setView(next);
    } catch {
      // Offline blip — keep polling.
    }
  }, [code]);

  useEffect(() => {
    const first = setTimeout(poll, 0); // fetch immediately, but off the render tick
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  // Rematch: the host created a fresh game; carry our token over and follow.
  useEffect(() => {
    const token = storedToken(code);
    if (view?.rematchCode && token) {
      localStorage.setItem(`trivia:player:${view.rematchCode}`, token);
      router.push(`/play/${view.rematchCode}`);
    }
  }, [view?.rematchCode, code, router]);

  if (gone) {
    return (
      <Card className="mt-10 p-6 text-center">
        <p className="font-display text-2xl text-ink">Game over</p>
        <p className="mt-2 text-sm text-zinc-500">
          This room doesn&apos;t exist anymore.
        </p>
        <Link href="/play" className="mt-4 inline-block text-sm font-medium text-gold underline">
          Join another game
        </Link>
      </Card>
    );
  }

  if (!view) {
    return <p className="mt-16 text-center text-sm text-zinc-500">Setting the table…</p>;
  }

  const you = view.you;
  const me = you ? view.players.find((p) => p.id === you.playerId) : undefined;
  const isHost = me?.isHost ?? false;

  switch (view.status) {
    case "LOBBY":
      return (
        <Lobby
          view={view}
          code={code}
          isHost={isHost}
          hasJoined={!!me}
          onChanged={poll}
        />
      );
    case "IN_QUESTION":
      return (
        <Question
          key={view.currentIndex} // remount per question: pick/lock state resets itself
          view={view}
          code={code}
          skewRef={skewRef}
          onAnswered={poll}
        />
      );
    case "REVEAL":
      return <Reveal view={view} />;
    case "FINISHED":
      return <Final view={view} code={code} isHost={isHost} />;
    default:
      return (
        <Card className="mt-10 p-6 text-center">
          <p className="font-display text-2xl text-ink">Game ended</p>
          <p className="mt-2 text-sm text-zinc-500">The host closed this game early.</p>
          <Link href="/play" className="mt-4 inline-block text-sm font-medium text-gold underline">
            Join another game
          </Link>
        </Card>
      );
  }
}

// ── Screens ─────────────────────────────────────────────────────────────────

function Header({ view }: { view: StateView }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
        Room {view.code}
      </span>
      <span className="font-mono text-xs text-zinc-500">
        {view.categoryName ?? "Any category"}
      </span>
    </div>
  );
}

function Scoreboard({ view }: { view: StateView }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {view.players.map((p) => (
        <div key={p.id} className="rounded-lg bg-stone p-3 text-center">
          <p className="truncate font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
            {p.name}
          </p>
          <p className="mt-1 font-display text-2xl leading-none text-ink">{p.score}</p>
        </div>
      ))}
    </div>
  );
}

function Lobby({
  view,
  code,
  isHost,
  hasJoined,
  onChanged,
}: {
  view: StateView;
  code: string;
  isHost: boolean;
  hasJoined: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = view.players.length >= 2;

  async function start() {
    const token = storedToken(code);
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await startGame({ code, token });
      onChanged();
    } catch {
      setError("Couldn't start — is your opponent in yet?");
    }
    setBusy(false);
  }

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    const result = await joinGame({ code, name });
    if (!result.ok) {
      setError(result.error);
    } else {
      localStorage.setItem(`trivia:player:${code}`, result.token);
      onChanged();
    }
    setBusy(false);
  }

  return (
    <div className="pt-6">
      <Header view={view} />
      <Card className="p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Room code</p>
        <p className="mt-2 font-display text-5xl tracking-[0.2em] text-ink">{view.code}</p>
        <p className="mt-3 text-sm text-zinc-500">
          {view.questionCount} questions · {view.questionSecs}s each
        </p>

        <div className="mt-6 space-y-2">
          {view.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-stone px-4 py-3"
            >
              <span className="text-sm font-medium text-ink">{p.name}</span>
              <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">
                {p.isHost ? "Host" : "Challenger"}
              </span>
            </div>
          ))}
          {!full && (
            <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-400">
              Waiting for an opponent…
            </div>
          )}
        </div>

        {!hasJoined && !full && (
          <form onSubmit={join} className="mt-6 space-y-3">
            <input
              name="name"
              required
              maxLength={24}
              placeholder="Your name"
              className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-3 text-center text-base text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none"
            />
            <Button type="submit" variant="gold" disabled={busy} className="min-h-12 w-full text-base">
              {busy ? "Joining…" : "Join this game"}
            </Button>
          </form>
        )}

        {isHost && (
          <Button
            onClick={start}
            variant="gold"
            disabled={!full || busy}
            className="mt-6 min-h-12 w-full text-base"
          >
            {full ? (busy ? "Starting…" : "Start the game") : "Waiting for player 2…"}
          </Button>
        )}
        {hasJoined && !isHost && full && (
          <p className="mt-6 animate-pulse text-sm text-zinc-500">
            Waiting for the host to start…
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>
      <p className="mt-4 text-center text-xs text-zinc-400">
        Your opponent joins at <span className="font-mono">/play</span> with this code.
      </p>
    </div>
  );
}

// A question's deadline never changes once stamped, and Question remounts per
// question (keyed on currentIndex), so the initial value can be computed at
// mount; the interval refines it (with clock skew) asynchronously. Refs can't
// be read during render, so the initializer skips the skew — it's corrected
// 200ms later by the first tick.
function useCountdown(deadlineIso: string | null, skewRef: React.RefObject<number>) {
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    deadlineIso === null
      ? null
      : Math.max(0, new Date(deadlineIso).getTime() - Date.now()),
  );
  useEffect(() => {
    if (deadlineIso === null) return;
    const deadline = new Date(deadlineIso).getTime();
    const id = setInterval(
      () => setRemainingMs(Math.max(0, deadline - (Date.now() + (skewRef.current ?? 0)))),
      200,
    );
    return () => clearInterval(id);
  }, [deadlineIso, skewRef]);
  return remainingMs;
}

function Question({
  view,
  code,
  skewRef,
  onAnswered,
}: {
  view: StateView;
  code: string;
  skewRef: React.RefObject<number>;
  onAnswered: () => void;
}) {
  const remainingMs = useCountdown(view.questionDeadline, skewRef);
  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const q = view.question;
  if (!q) return null;

  const answered = picked !== null || (view.you?.hasAnswered ?? false);
  const secondsLeft = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const urgent = secondsLeft !== null && secondsLeft <= 5;
  const spectating = !view.you;

  async function pick(index: number) {
    const token = storedToken(code);
    if (answered || submitting || !token) return;
    setPicked(index);
    setSubmitting(true);
    try {
      await submitAnswer({ code, token, questionIndex: q!.index, answerIndex: index });
    } catch {
      // Too late or transient failure — the reveal will tell the truth.
    }
    setSubmitting(false);
    onAnswered();
  }

  return (
    <div className="pt-6">
      <Header view={view} />
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
          Question {view.currentIndex + 1} of {view.questionCount}
        </span>
        <span
          className={cn(
            "font-display text-4xl leading-none tabular-nums",
            urgent ? "text-red-600" : "text-gold",
          )}
        >
          {secondsLeft ?? "–"}
        </span>
      </div>
      {/* Time bar — display only; the server enforces the real deadline. */}
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-zinc-200">
        <div
          className={cn("h-full rounded-full", urgent ? "bg-red-500" : "bg-gold")}
          style={{
            width: `${remainingMs !== null ? Math.min(100, (remainingMs / (view.questionSecs * 1000)) * 100) : 100}%`,
            transition: "width 200ms linear",
          }}
        />
      </div>

      <Card className="p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">
          {q.category} · {q.difficulty}
        </p>
        <p className="mt-2 text-lg font-medium leading-snug text-ink">{q.prompt}</p>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3">
        {q.answers.map((answer, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={answered || spectating}
            className={cn(
              "min-h-14 rounded-lg border px-4 py-3 text-left text-base font-medium transition-colors",
              picked === i
                ? "border-gold bg-gold text-white"
                : "border-hairline bg-canvas text-ink active:border-gold",
              answered && picked !== i && "opacity-50",
            )}
          >
            {answer}
          </button>
        ))}
      </div>

      {answered && (
        <p className="mt-4 animate-pulse text-center text-sm text-zinc-500">
          Locked in — waiting for your opponent…
        </p>
      )}
      {spectating && (
        <p className="mt-4 text-center text-sm text-zinc-400">Watching this game.</p>
      )}
    </div>
  );
}

function Reveal({ view }: { view: StateView }) {
  const q = view.question;
  if (!q || view.correctIndex === null) return null;
  const byPlayer = new Map(view.answers.map((a) => [a.playerId, a]));

  return (
    <div className="pt-6">
      <Header view={view} />
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
        Question {view.currentIndex + 1} of {view.questionCount}
      </p>
      <Card className="p-5">
        <p className="text-lg font-medium leading-snug text-ink">{q.prompt}</p>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3">
        {q.answers.map((answer, i) => {
          const isCorrect = i === view.correctIndex;
          const pickers = view.players.filter((p) => byPlayer.get(p.id)?.answerIndex === i);
          return (
            <div
              key={i}
              className={cn(
                "flex min-h-14 items-center justify-between rounded-lg border px-4 py-3 text-base",
                isCorrect
                  ? "border-emerald-600/40 bg-pale-sage font-semibold text-emerald-800"
                  : "border-hairline bg-canvas text-zinc-500",
              )}
            >
              <span>{answer}</span>
              <span className="ml-3 shrink-0 font-mono text-[11px] uppercase text-zinc-500">
                {pickers.map((p) => p.name).join(" · ")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-2">
        {view.players.map((p) => {
          const a = byPlayer.get(p.id);
          return (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="font-medium text-ink">{p.name}</span>
              <span className={cn("font-mono", a?.isCorrect ? "text-emerald-700" : "text-zinc-400")}>
                {a ? (a.isCorrect ? `+${a.points}` : "+0") : "no answer"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <Scoreboard view={view} />
      </div>
      <p className="mt-4 animate-pulse text-center text-sm text-zinc-500">Next question…</p>
    </div>
  );
}

function Final({
  view,
  code,
  isHost,
}: {
  view: StateView;
  code: string;
  isHost: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [a, b] = [...view.players].sort((x, y) => y.score - x.score);
  const tie = a && b && a.score === b.score;

  async function rematch() {
    const token = storedToken(code);
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const { code: newCode } = await requestRematch({ code, token });
      localStorage.setItem(`trivia:player:${newCode}`, token);
      window.location.href = `/play/${newCode}`;
    } catch {
      setError("Couldn't set up the rematch — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="pt-6">
      <Header view={view} />
      <Card className="p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Final</p>
        <p className="mt-2 font-display text-4xl leading-tight text-ink">
          {tie ? "Dead heat!" : `${a?.name} wins`}
        </p>
        <div className="mt-5">
          <Scoreboard view={view} />
        </div>
        {isHost && (
          <Button
            onClick={rematch}
            variant="gold"
            disabled={busy}
            className="mt-6 min-h-12 w-full text-base"
          >
            {busy ? "Dealing again…" : "Rematch"}
          </Button>
        )}
        {!isHost && (
          <p className="mt-6 text-sm text-zinc-500">
            If the host calls a rematch, you&apos;ll be pulled in automatically.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      {view.recap && (
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
            The answers
          </p>
          <div className="space-y-2">
            {view.recap.map((q) => (
              <Card key={q.index} className="p-4">
                <p className="text-sm font-medium text-ink">
                  {q.index + 1}. {q.prompt}
                </p>
                <p className="mt-1 text-sm text-emerald-700">{q.answers[q.correctIndex]}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
