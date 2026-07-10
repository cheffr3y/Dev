import { notFound } from "next/navigation";
import type { OwRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader, LinkButton } from "@/components/ui";
import { HEROES, heroName } from "@/lib/ow/data/heroes";
import { MAPS, mapName } from "@/lib/ow/data/maps";
import { MatchEditor, type EditableMatch } from "@/components/ow/MatchEditor";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const match = await prisma.owMatch.findFirst({ where: { id, userId: user.id } });
  if (!match) notFound();

  const editable: EditableMatch = {
    id: match.id,
    role: match.role,
    hero: match.hero,
    map: match.map,
    result: match.result,
    ratePositioning: match.ratePositioning,
    rateUltUsage: match.rateUltUsage,
    rateTilt: match.rateTilt,
    deaths: match.deaths,
    enemyComp: match.enemyComp,
    heroSwaps: match.heroSwaps,
    notes: match.notes,
  };

  return (
    <div>
      <PageHeader
        title="Edit match"
        subtitle={`${heroName(match.hero)} · ${mapName(match.map)} · ${match.playedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        action={<LinkButton href="/ow/matches" variant="secondary">← History</LinkButton>}
      />
      <MatchEditor
        match={editable}
        heroes={HEROES.map((h) => ({ id: h.id, name: h.name, role: h.role as OwRole }))}
        maps={MAPS.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
