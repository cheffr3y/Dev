import type { OwRole } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { PageHeader, LinkButton } from "@/components/ui";
import { HEROES } from "@/lib/ow/data/heroes";
import { MAPS } from "@/lib/ow/data/maps";
import { loadUserMatches, playCounts } from "@/lib/ow/queries";
import { MatchLogger } from "@/components/ow/MatchLogger";

export default async function LogMatchPage() {
  const user = await requireUser();
  const matches = await loadUserMatches(user.id);
  const counts = playCounts(matches);
  const lastRole: OwRole = matches[0]?.role ?? "TANK";

  return (
    <div>
      <PageHeader
        title="Log match"
        subtitle="Tap through in under 10 seconds"
        action={<LinkButton href="/ow" variant="secondary">← Dashboard</LinkButton>}
      />
      <MatchLogger
        heroes={HEROES.map((h) => ({ id: h.id, name: h.name, role: h.role, inPool: h.inPool }))}
        maps={MAPS.map((m) => ({ id: m.id, name: m.name, mode: m.mode }))}
        heroPlayCounts={counts.heroes}
        mapPlayCounts={counts.maps}
        lastRole={lastRole}
      />
    </div>
  );
}
