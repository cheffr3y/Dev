import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { buildMenuRollout, PACKET_MODES, ROLLOUT_STATUSES } from "@/lib/menu-rollout";
import { menuRecipeInclude } from "@/lib/menu-rollout-data";
import { pct } from "@/lib/costing";
import { Badge, Card, PageHeader } from "@/components/ui";
import { RolloutForm } from "./MenuForms";

export default async function MenusPage() {
  const user = await requireUser();
  const [rollouts, recipes, venues] = await Promise.all([
    prisma.menuRollout.findMany({ include: { venue: true, items: true }, orderBy: { updatedAt: "desc" } }),
    prisma.recipe.findMany({ include: menuRecipeInclude }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
  ]);
  return <div>
    <PageHeader title="Menu Rollouts" subtitle="Engineer the menu. Prepare the launch. Give every station one source of truth." />
    {hasRole(user, "MANAGER") && <details className="mb-8"><summary className="cursor-pointer font-medium text-gold">+ New Menu Rollout</summary><Card className="mt-3 p-5"><RolloutForm venues={venues} /></Card></details>}
    {rollouts.length === 0 && <Card className="p-10 text-center text-zinc-500">No menu rollouts yet. Create a rollout to curate dishes and opening pars.</Card>}
    {ROLLOUT_STATUSES.map(status => {
      const matches = rollouts.filter(rollout => rollout.status === status);
      if (!matches.length) return null;
      return <section key={status} className="mb-8"><h2 className="mb-3 font-mono text-xs tracking-widest text-gold">{status}</h2><div className="grid gap-4 lg:grid-cols-2">{matches.map(rollout => {
        const plan = buildMenuRollout(rollout, recipes);
        return <Card key={rollout.id} className="p-5"><div className="flex justify-between gap-3"><Link href={`/menus/${rollout.id}`} className="font-display text-2xl text-[#2C3E35] hover:underline">{rollout.name}</Link><Badge>{rollout.items.length} dishes</Badge></div><p className="mt-1 text-sm text-zinc-500">{rollout.subtitle || rollout.venue?.name || "Company-wide"}</p><p className="mt-3 font-mono text-xs text-zinc-600">{rollout.venue?.name ?? "Company-wide"} · Avg food cost {pct(plan.averageFcp)} · Target {pct(rollout.targetFcp)}</p><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gold">{PACKET_MODES.map(packet => <Link key={packet.mode} href={`/menus/${rollout.id}/packet?mode=${packet.mode}`} className="underline">{packet.mode === "all" ? "Master launch book" : packet.mode}</Link>)}</div></Card>;
      })}</div></section>;
    })}
  </div>;
}
