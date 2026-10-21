import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ToGoHeaderForm } from "./ToGoForms";

export default async function ToGoPage() {
  const user = await requireUser();
  const [rollups, venues] = await Promise.all([
    prisma.toGoRollup.findMany({ include: { venue: true, _count: { select: { items: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
  ]);
  return <div><PageHeader title="Holiday & To-Go Rollups" subtitle="Plan the offering, estimate sales and prepare the holiday book." />
    <Card className="mb-6 p-5"><p className="text-sm text-zinc-600">Start with a best guess. Sell solid sides by weight, liquids by volume, and new small bites in the format you choose. Link recipes as they’re ready; refine production targets later.</p></Card>
    {hasRole(user, "MANAGER") && <details open={rollups.length === 0} className="mb-8"><summary className="cursor-pointer font-medium text-gold">+ New Holiday / To-Go Rollup</summary><Card className="mt-3 p-5"><ToGoHeaderForm venues={venues} /></Card></details>}
    {rollups.length === 0 && <p className="text-sm text-zinc-500">No holiday rollups yet.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{rollups.map(rollup => <Card key={rollup.id} className="p-5"><div className="flex items-start justify-between gap-3"><Link href={`/to-go/${rollup.id}`} className="font-display text-2xl text-ink hover:underline">{rollup.name}</Link><Badge>{rollup.status}</Badge></div><p className="mt-2 text-sm text-zinc-500">{rollup.venue?.name ?? "Company-wide"} · {rollup._count.items} items{rollup.orderCutoff ? ` · Order cutoff ${rollup.orderCutoff}` : ""}</p>{rollup.pickupNotes && <p className="mt-2 whitespace-pre-wrap text-sm">{rollup.pickupNotes}</p>}<Link href={`/to-go/${rollup.id}/packet`} className="mt-4 inline-block text-xs text-gold underline">Print complete holiday book</Link></Card>)}</div>
  </div>;
}
