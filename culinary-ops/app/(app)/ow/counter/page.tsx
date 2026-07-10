import type { OwRole } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { PageHeader, LinkButton } from "@/components/ui";
import { HEROES, poolByRole } from "@/lib/ow/data/heroes";
import { MAPS } from "@/lib/ow/data/maps";
import { loadUserMatches } from "@/lib/ow/queries";
import { personalStatsByHero } from "@/lib/ow/stats";
import { CounterHelper } from "@/components/ow/CounterHelper";

export default async function CounterPage() {
  const user = await requireUser();
  const matches = await loadUserMatches(user.id);
  const personalStats = personalStatsByHero(matches);

  const pools: Record<OwRole, string[]> = {
    TANK: poolByRole("TANK").map((h) => h.id),
    DPS: poolByRole("DPS").map((h) => h.id),
    SUPPORT: poolByRole("SUPPORT").map((h) => h.id),
  };

  return (
    <div>
      <PageHeader
        title="Counter pick"
        subtitle="Rules engine runs instantly · AI is optional"
        action={<LinkButton href="/ow" variant="secondary">← Dashboard</LinkButton>}
      />
      <CounterHelper
        maps={MAPS.map((m) => ({ id: m.id, name: m.name, mode: m.mode }))}
        heroes={HEROES.map((h) => ({ id: h.id, name: h.name, role: h.role }))}
        pools={pools}
        personalStats={personalStats}
      />
    </div>
  );
}
