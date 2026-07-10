import type { OwRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Card, CardHeader, LinkButton, PageHeader, cn } from "@/components/ui";
import { loadUserMatches } from "@/lib/ow/queries";
import { tally, pct, byRole, byHero, byMapMode, type WinRecord } from "@/lib/ow/stats";
import { allInsights, focusStringFor, type InsightTone } from "@/lib/ow/insights";
import { mapModeLabel } from "@/lib/ow/data/maps";
import { startSession, endSession } from "./actions";

const ROLE_LABEL: Record<OwRole, string> = { TANK: "Tank", DPS: "DPS", SUPPORT: "Support" };

export default async function OwDashboard() {
  const user = await requireUser();
  const [matches, activeSession] = await Promise.all([
    loadUserMatches(user.id),
    prisma.owSession.findFirst({
      where: { userId: user.id, endedAt: null },
      orderBy: { startedAt: "desc" },
      include: {
        matches: {
          orderBy: { playedAt: "asc" },
          select: { result: true, rateTilt: true, playedAt: true, role: true, hero: true, map: true, ratePositioning: true, rateUltUsage: true, sessionId: true },
        },
      },
    }),
  ]);

  const overall = tally(matches);
  const roles = byRole(matches);
  const topHeroes = byHero(matches).slice(0, 5);
  const modes = byMapMode(matches);
  const insights = allInsights(matches);
  const focusSuggestion = focusStringFor(matches) ?? "";

  return (
    <div>
      <PageHeader
        title="Overwatch"
        subtitle="Personal competitive tracker"
        action={
          <div className="flex gap-2">
            <LinkButton href="/ow/log">Log match</LinkButton>
            <LinkButton href="/ow/counter" variant="secondary">Counter pick</LinkButton>
            <LinkButton href="/ow/matches" variant="secondary">History</LinkButton>
          </div>
        }
      />

      {matches.length === 0 && (
        <Card className="mb-6 p-6">
          <p className="text-sm text-zinc-600">
            No matches logged yet. Tap <span className="font-medium text-ink">Log match</span> after your next game —
            stats and improvement insights unlock as you build history.
          </p>
        </Card>
      )}

      {/* Session summary / start */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {activeSession ? (
          <SessionCard session={activeSession} />
        ) : (
          <Card className="p-5">
            <CardHeaderPlain>Start a session</CardHeaderPlain>
            <form action={startSession} className="mt-3 space-y-2">
              <input
                name="focusGoal"
                defaultValue={focusSuggestion}
                placeholder="Focus goal (optional)"
                className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
              />
              {focusSuggestion && <p className="text-xs text-zinc-400">Suggested from your last 10 matches — edit or clear.</p>}
              <button className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                Start session
              </button>
            </form>
          </Card>
        )}

        {/* Overall record */}
        <Card className="p-5">
          <CardHeaderPlain>Overall</CardHeaderPlain>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <p className="font-display text-4xl leading-none text-ink">{matches.length ? `${pct(overall.winRate)}%` : "—"}</p>
              <p className="mt-1 text-xs text-zinc-500">win rate</p>
            </div>
            <p className="text-sm text-zinc-600">
              {overall.wins}W · {overall.losses}L{overall.draws ? ` · ${overall.draws}D` : ""}
            </p>
          </div>
        </Card>
      </div>

      {/* Insight cards */}
      {insights.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Insights</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {insights.map((c) => (
              <InsightCardView key={c.id} tone={c.tone} title={c.title} body={c.body} />
            ))}
          </div>
        </section>
      )}

      {/* Rolling stats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>Win rate by role</CardHeader>
          <div className="space-y-3 p-5">
            {(["TANK", "DPS", "SUPPORT"] as OwRole[]).map((r) => (
              <WinBar key={r} label={ROLE_LABEL[r]} record={roles[r]} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>Top heroes</CardHeader>
          <div className="space-y-3 p-5">
            {topHeroes.length === 0 ? (
              <p className="text-sm text-zinc-400">No heroes logged yet.</p>
            ) : (
              topHeroes.map((h) => <WinBar key={h.heroId} label={h.heroName} record={h} />)
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>Win rate by map mode</CardHeader>
          <div className="space-y-3 p-5">
            {modes.length === 0 ? (
              <p className="text-sm text-zinc-400">No maps logged yet.</p>
            ) : (
              modes.map((m) => <WinBar key={m.mode} label={mapModeLabel(m.mode)} record={m} />)
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CardHeaderPlain({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">{children}</p>;
}

function SessionCard({
  session,
}: {
  session: {
    id: string;
    startedAt: Date;
    focusGoal: string | null;
    matches: { result: string; rateTilt: number }[];
  };
}) {
  const rec = {
    wins: session.matches.filter((m) => m.result === "WIN").length,
    losses: session.matches.filter((m) => m.result === "LOSS").length,
    draws: session.matches.filter((m) => m.result === "DRAW").length,
  };
  const avgTilt =
    session.matches.length > 0
      ? session.matches.reduce((s, m) => s + m.rateTilt, 0) / session.matches.length
      : 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <CardHeaderPlain>Active session</CardHeaderPlain>
        <form action={endSession}>
          <input type="hidden" name="id" value={session.id} />
          <button className="text-xs text-red-600 hover:underline">End</button>
        </form>
      </div>
      <div className="mt-3 flex items-end gap-6">
        <p className="font-display text-3xl leading-none text-ink">
          {rec.wins}<span className="text-zinc-400">W</span> {rec.losses}<span className="text-zinc-400">L</span>
          {rec.draws ? <> {rec.draws}<span className="text-zinc-400">D</span></> : null}
        </p>
        <p className="text-sm text-zinc-600">
          {session.matches.length} {session.matches.length === 1 ? "game" : "games"}
          {session.matches.length > 0 && <> · avg tilt {avgTilt.toFixed(1)}</>}
        </p>
      </div>
      {session.focusGoal && (
        <p className="mt-3 rounded-md bg-pale-gold px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Focus:</span> {session.focusGoal}
        </p>
      )}
    </Card>
  );
}

const TONE_CLASS: Record<InsightTone, string> = {
  good: "border-emerald-600/30 bg-pale-sage",
  warn: "border-amber-300 bg-amber-50",
  info: "border-blue-600/25 bg-blue-100",
  muted: "border-hairline bg-zinc-50",
};

function InsightCardView({ tone, title, body }: { tone: InsightTone; title: string; body: string }) {
  return (
    <div className={cn("rounded-lg border p-4", TONE_CLASS[tone])}>
      <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">{title}</p>
      <p className="mt-1.5 text-sm text-ink">{body}</p>
    </div>
  );
}

function WinBar({ label, record }: { label: string; record: WinRecord }) {
  const decisive = record.wins + record.losses;
  const rate = pct(record.winRate);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-zinc-500">
          {record.games === 0 ? "—" : (
            <>
              {rate}% <span className="text-zinc-400">· {record.games}g</span>
            </>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
        <div
          className={cn("h-full rounded-full", rate >= 50 ? "bg-sage" : "bg-gold")}
          style={{ width: decisive === 0 ? "0%" : `${rate}%` }}
        />
      </div>
    </div>
  );
}
