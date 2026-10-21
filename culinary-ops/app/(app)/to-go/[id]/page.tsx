import { getVenues } from "@/lib/venue";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadToGoRollup } from "@/lib/to-go-data";
import { buildToGoRollup } from "@/lib/to-go-rollup";
import { TO_GO_PACKETS } from "@/lib/to-go-options";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { Card, CardHeader, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { CostIntegrityBanner } from "@/components/CostAudit";
import { HmrAllergens, HmrPricing } from "@/components/HmrProposal";
import { MenuOrderGuide } from "@/components/MenuOrderGuide";
import { CopyHmrForm, ToGoHeaderForm, ToGoItemForm } from "../ToGoForms";
import { removeToGoItem } from "../actions";

export default async function ToGoWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [[rollup, recipes], venues] = await Promise.all([loadToGoRollup(id), getVenues()]);
  if (!rollup) notFound();
  const canEdit = hasRole(user, "MANAGER");
  const plan = buildToGoRollup(rollup, recipes);
  return <div>
    <Link href="/to-go" className="mb-4 inline-block text-sm text-gold hover:underline">← HMR Rollouts</Link>
    <PageHeader title={rollup.name} subtitle={`${rollup.venue?.name ?? "Company-wide"} · ${rollup.status}`} />
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <LinkButton href={`/to-go/${id}/packet?mode=proposal`} variant="gold">Print menu proposal</LinkButton>
      <details className="relative"><summary className="cursor-pointer text-sm text-gold">Other printouts</summary><div className="mt-3 flex flex-wrap gap-3">{TO_GO_PACKETS.filter(packet => packet.value !== "proposal").map(packet => <Link key={packet.value} href={`/to-go/${id}/packet?mode=${packet.value}`} className="text-xs text-gold underline">{packet.label}</Link>)}</div></details>
    </div>
    <p className="mb-5 text-sm text-zinc-600">Propose the dishes, descriptions and prices. Add storage and reheating notes as the menu develops.</p>
    {(rollup.orderCutoff || rollup.pickupNotes) && <Card className="mb-6 space-y-2 p-5 text-sm">{rollup.orderCutoff && <p>Order cutoff: {rollup.orderCutoff}</p>}{rollup.pickupNotes && <p className="whitespace-pre-wrap">Pickup: {rollup.pickupNotes}</p>}</Card>}
    <div className="mb-6 grid grid-cols-2 gap-4"><StatCard label="Menu items" value={plan.rows.length} /><StatCard label="Recipes linked" value={plan.rows.filter(row => row.recipe).length} sub="Food costs update from the recipe library" /></div>
    {plan.sections.map(section => <Card key={section.name} className="mb-6"><CardHeader>{section.name}</CardHeader><div className="divide-y divide-hairline">{section.rows.map(row => <div key={row.id} className="p-5">
      <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-display text-xl text-ink">{row.name}</h2>{row.description && <p className="mt-1 text-sm text-zinc-500">{row.description}</p>}</div>{row.price != null && row.sellingUnit && <p className="text-sm">{money(row.price)} / {row.sellingUnit}</p>}</div>
      {row.recipe && <Link href={`/recipes/${row.recipe.id}`} className="mt-2 inline-block text-xs text-gold underline">{row.recipe.name} · {num(row.recipe.yieldQty)} {row.recipe.yieldUnit} standard yield</Link>}
      {row.customerInstructions && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600"><span className="font-medium">Storage & reheating: </span>{row.customerInstructions}</p>}
      {canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm text-gold">Edit item</summary><div className="mt-4"><ToGoItemForm key={JSON.stringify(row)} rollupId={id} line={row} recipes={recipes} /><form action={removeToGoItem} className="mt-3"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="rollupId" value={id} /><button className="text-xs text-red-700">Remove from rollout</button></form></div></details>}
    </div>)}</div></Card>)}
    {canEdit && <Card className="mb-6 p-5"><h2 className="mb-3 font-display text-2xl text-ink">Add an item</h2><ToGoItemForm key={rollup.items.length} rollupId={id} recipes={recipes} nextSortOrder={Math.max(-1, ...rollup.items.map(row => row.sortOrder)) + 1} /><datalist id="to-go-sections"><option>Meals</option><option>First Bites</option><option>Sides</option><option>Desserts</option><option>Meal Kits</option></datalist></Card>}
    <div className="space-y-4">
      <details data-hmr-report="costing"><summary className="cursor-pointer text-sm font-medium text-gold">Recipe costs & proposed pricing</summary><Card className="mt-3 p-5"><CostIntegrityBanner unpriced={plan.menuPlan.unpricedNames} stale={plan.menuPlan.staleNames} /><HmrPricing plan={plan} /></Card></details>
      <details data-hmr-report="allergens"><summary className="cursor-pointer text-sm font-medium text-gold">Allergen guide</summary><Card className="mt-3 p-5"><HmrAllergens plan={plan} /></Card></details>
      <details data-hmr-report="vendors"><summary className="cursor-pointer text-sm font-medium text-gold">Vendor checklist</summary><Card className="mt-3 p-5"><p className="mb-4 text-sm text-zinc-500">Ingredient reference for linked recipes.</p><MenuOrderGuide plan={plan.menuPlan} /></Card></details>
      {canEdit && <details><summary className="cursor-pointer text-sm font-medium text-gold">Copy for next month / another rollout</summary><Card className="mt-3 p-5"><CopyHmrForm rollout={rollup} /></Card></details>}
      {canEdit && <details><summary className="cursor-pointer text-sm font-medium text-gold">Rollout settings</summary><Card className="mt-3 p-5"><ToGoHeaderForm rollup={rollup} venues={venues} /></Card></details>}
    </div>
    {rollup.notes && <Card className="mt-6 whitespace-pre-wrap p-5 text-sm">{rollup.notes}</Card>}
  </div>;
}
