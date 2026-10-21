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
import { ToGoAllergens, ToGoCosting, ToGoForecast, ToGoPacking, ToGoReadiness } from "@/components/ToGoSheets";
import { MenuOrderGuide } from "@/components/MenuOrderGuide";
import { ToGoHeaderForm, ToGoItemForm } from "../ToGoForms";
import { removeToGoItem } from "../actions";

export default async function ToGoWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [[rollup, recipes], venues] = await Promise.all([loadToGoRollup(id), getVenues()]);
  if (!rollup) notFound();
  const canEdit = hasRole(user, "MANAGER");
  const plan = buildToGoRollup(rollup, recipes);
  return <div>
    <Link href="/to-go" className="mb-4 inline-block text-sm text-gold hover:underline">← Holiday & To-Go Rollups</Link>
    <PageHeader title={rollup.name} subtitle={`${rollup.venue?.name ?? "Company-wide"} · ${rollup.status} · Sales estimates can be revised`} />
    <div className="mb-6 flex flex-wrap gap-2">{TO_GO_PACKETS.map(packet => <LinkButton key={packet.value} href={`/to-go/${id}/packet?mode=${packet.value}`} variant={packet.value === "all" ? "gold" : "secondary"}>{packet.label}</LinkButton>)}</div>
    <Card className="mb-6 p-5 text-sm"><p>Estimate sales in lb for solid sides, a volume unit for liquids, or your chosen small-bite format. Blank means unknown; 0 means none. Recipes, pricing and packing specs can be added as they’re ready.</p>{rollup.orderCutoff && <p className="mt-2">Order cutoff: {rollup.orderCutoff}</p>}{rollup.pickupNotes && <p className="mt-2 whitespace-pre-wrap">Pickup: {rollup.pickupNotes}</p>}</Card>
    <CostIntegrityBanner unpriced={plan.menuPlan.unpricedNames} stale={plan.menuPlan.staleNames} />
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><StatCard label="Menu items" value={plan.rows.length} sub={`${plan.rows.filter(row => !row.recipe).length} awaiting recipe links`} /><StatCard label="Forecast sales revenue" value={money(plan.forecastRevenue)} sub={`${plan.revenueCoverage} of ${plan.rows.length} items included`} /><StatCard label="Forecast food + packaging" value={money(plan.forecastCost)} sub={`${plan.costCoverage} of ${plan.rows.length} items included`} /><StatCard label="Forecast margin before labor" value={money(plan.forecastMargin)} sub={`${plan.marginCoverage} of ${plan.rows.length} items included`} /></div>
    {plan.salesByUnit.length > 0 && <p className="mb-6 text-sm text-zinc-600">Estimated sales by unit: {plan.salesByUnit.map(total => `${num(total.qty)} ${total.unit}`).join(" · ")}. Weight, volume and packages remain separate.</p>}
    <Card className="mb-6"><CardHeader>Sales forecast & production</CardHeader><div className="p-5"><ToGoForecast plan={plan} /></div></Card>
    {plan.sections.map(section => <Card key={section.name} className="mb-6"><CardHeader>{section.name}</CardHeader><div className="divide-y divide-hairline">{section.rows.map(row => <div key={row.id} className="p-5"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-display text-xl text-ink">{row.name}</h2><p className="mt-1 text-sm text-zinc-500">{row.description}</p></div><p className="text-sm">{money(row.price)} / {row.sellingUnit ?? "unit undecided"}</p></div><p className="mt-2 text-xs text-zinc-500">{row.recipe ? <Link href={`/recipes/${row.recipe.id}`} className="text-gold underline">{row.recipe.name} · {num(row.recipe.yieldQty)} {row.recipe.yieldUnit} standard yield</Link> : "Recipe link pending"}</p>{row.warnings.length > 0 && <p className="mt-2 text-xs text-amber-900">{row.warnings.length} details to review · {row.warnings[0]}</p>}{row.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">{row.notes}</p>}{canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm text-gold">Edit item / sales estimate</summary><div className="mt-4"><ToGoItemForm key={JSON.stringify(row)} rollupId={id} line={row} recipes={recipes} /><form action={removeToGoItem} className="mt-3"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="rollupId" value={id} /><button className="text-xs text-red-700">Remove from rollup</button></form></div></details>}</div>)}</div></Card>)}
    {canEdit && <Card className="mb-6 p-5"><h2 className="mb-4 font-display text-2xl text-ink">Add an item</h2><ToGoItemForm key={rollup.items.length} rollupId={id} recipes={recipes} nextSortOrder={Math.max(-1, ...rollup.items.map(row => row.sortOrder)) + 1} /><datalist id="to-go-sections"><option>First Bites</option><option>Sides</option><option>Desserts</option><option>Meal Kits</option></datalist></Card>}
    <Card className="mb-6"><CardHeader>Costing & pricing</CardHeader><div className="p-5"><ToGoCosting plan={plan} /></div></Card>
    <Card className="mb-6"><CardHeader>Packing & customer instructions</CardHeader><div className="p-5"><ToGoPacking plan={plan} /></div></Card>
    <Card className="mb-6"><CardHeader>Allergen guide</CardHeader><div className="p-5"><ToGoAllergens plan={plan} /></div></Card>
    <Card className="mb-6"><CardHeader>Vendor checklist</CardHeader><div className="p-5"><p className="mb-4 text-sm text-zinc-500">Manual ordering checklist for linked recipes, including items without sales estimates. Check stock and fill in quantities before ordering.</p><MenuOrderGuide plan={plan.menuPlan} /></div></Card>
    <Card className="mb-6"><CardHeader>Still to decide / review</CardHeader><div className="p-5"><ToGoReadiness plan={plan} /></div></Card>
    {rollup.notes && <Card className="mb-6 whitespace-pre-wrap p-5 text-sm">{rollup.notes}</Card>}
    {canEdit && <details><summary className="cursor-pointer text-sm text-gold">Rollup settings</summary><Card className="mt-3 p-5"><ToGoHeaderForm rollup={rollup} venues={venues} /></Card></details>}
  </div>;
}
