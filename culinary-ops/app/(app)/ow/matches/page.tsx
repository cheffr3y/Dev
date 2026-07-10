import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader, LinkButton, EmptyState } from "@/components/ui";
import { heroName } from "@/lib/ow/data/heroes";
import { mapName } from "@/lib/ow/data/maps";
import { MatchHistory, type HistoryRow } from "@/components/ow/MatchHistory";

export default async function MatchesPage() {
  const user = await requireUser();
  const matches = await prisma.owMatch.findMany({
    where: { userId: user.id },
    orderBy: { playedAt: "desc" },
    select: { id: true, playedAt: true, role: true, hero: true, map: true, result: true, rateTilt: true, deaths: true },
  });

  const rows: HistoryRow[] = matches.map((m) => ({
    id: m.id,
    playedAt: m.playedAt.toISOString(),
    role: m.role,
    hero: heroName(m.hero),
    map: mapName(m.map),
    result: m.result,
    rateTilt: m.rateTilt,
    deaths: m.deaths,
  }));

  return (
    <div>
      <PageHeader
        title="Match history"
        subtitle={`${matches.length} logged`}
        action={<LinkButton href="/ow" variant="secondary">← Dashboard</LinkButton>}
      />
      {matches.length === 0 ? (
        <EmptyState title="No matches yet" hint="Log a match to start building your history." />
      ) : (
        <MatchHistory rows={rows} />
      )}
    </div>
  );
}
