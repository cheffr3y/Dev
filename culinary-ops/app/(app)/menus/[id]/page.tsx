import { WorkspaceInspector } from "@/components/WorkspaceInspector";
import { InspectorLink } from "@/components/InspectorLink";
import { getVenues } from "@/lib/venue";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadMenuRollout } from "@/lib/menu-rollout-data";
import { buildMenuRollout, PACKET_MODES } from "@/lib/menu-rollout";
import { requireUser, hasRole } from "@/lib/session";
import { money, num, pct, preciseNum } from "@/lib/costing";
import { Card, CardHeader, Input, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { CostIntegrityBanner } from "@/components/CostAudit";
import { MenuOrderGuide } from "@/components/MenuOrderGuide";
import { MenuItemForm, RolloutForm } from "../MenuForms";
import { removeRolloutItem } from "../actions";

export default async function MenuWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [[rollout, recipes], venues] = await Promise.all([loadMenuRollout(id), getVenues()]);
  if (!rollout) notFound();
  const canEdit = hasRole(user, "MANAGER");
  const plan = buildMenuRollout(rollout, recipes);
  const used = new Set(rollout.items.map(item => item.recipeId));
  return <WorkspaceInspector><div>
    <Link href="/menus" className="mb-4 inline-block text-sm text-gold hover:underline">← Menu Rollouts</Link>
    <PageHeader title={rollout.name} subtitle={`${rollout.venue?.name ?? "Company-wide"} · ${rollout.status} · ${rollout.expectedCovers} baseline covers${rollout.subtitle ? ` · ${rollout.subtitle}` : ""}`} />
    <div className="mb-6 flex flex-wrap gap-2">{PACKET_MODES.map(packet => <LinkButton key={packet.mode} href={`/menus/${id}/packet?mode=${packet.mode}`} variant={packet.mode === "all" ? "gold" : "secondary"}>{packet.mode === "all" ? "Print Master Launch Book (All-in-One)" : packet.label.slice(6)}</LinkButton>)}</div>
    <CostIntegrityBanner unpriced={plan.unpricedNames} stale={plan.staleNames} />
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Total dishes" value={plan.rows.length} sub={`${plan.dependencies.length} required sub-recipes`} />
      <StatCard label="Avg food cost" value={pct(plan.averageFcp)} sub={`Target ${pct(rollout.targetFcp)} · Par-weighted ${pct(plan.parWeightedFcp)}`} />
      <StatCard label="Avg dish margin" value={money(plan.averageMargin)} />
      <StatCard label="Opening par food cost" value={money(plan.totalOpeningFoodCost)} sub="Current catalog estimate" />
    </div>
    {plan.missingMenuPrices > 0 && <p className="mb-4 text-sm text-amber-800">{plan.missingMenuPrices} dishes have no positive menu price. Food cost averages and the par-weighted ratio use priced dishes only.</p>}
    {plan.sections.length === 0 && <Card className="mb-6 p-8 text-center text-zinc-500">Add your first recipe to begin the rollout.</Card>}
    {plan.sections.map(section => <Card key={section.name} className="mb-6"><CardHeader>{section.name}</CardHeader><div className="overflow-x-auto"><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Section / Dish</th><th>Station</th><th>Yield</th><th>Portion cost</th><th>Menu price ($)</th><th>Margin</th><th>Food cost</th><th>Opening par (batches)</th><th>Audit</th></tr></thead><tbody>{section.rows.map(row => <tr key={row.id}>
      <td className="min-w-72"><InspectorLink kind="recipe" id={row.recipeId} className="font-medium text-[#2C3E35] hover:underline">{row.title}</InspectorLink><p className="text-xs text-zinc-500">{row.menuDescription}</p>{canEdit && <details className="mt-2"><summary className="cursor-pointer text-xs text-gold">Edit dish / Save row</summary><div className="mt-3 min-w-80"><MenuItemForm rolloutId={id} line={row} inline /><form action={removeRolloutItem} className="mt-3"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="rolloutId" value={id} /><button className="text-xs text-red-700">Remove from rollout</button></form></div></details>}</td>
      <td>{row.recipe.station || "—"}</td><td className="whitespace-nowrap font-mono text-xs"><span className="block text-zinc-500">Standard: {num(row.recipe.yieldQty)} {row.recipe.yieldUnit}</span><span className="menu-opening-yield mt-1 block text-[#2C3E35]">Opening: {preciseNum(row.recipe.yieldQty * row.parBatches)} {row.recipe.yieldUnit}</span></td><td className="font-mono">{money(row.portionCost, 5)}</td>
      <td>{canEdit ? <Input aria-label={`Menu price for ${row.title}`} form={`menu-line-${row.id}`} className="w-24" name="menuPrice" type="number" min="0" step="0.01" defaultValue={row.menuPrice ?? ""} placeholder={row.recipe.menuPrice != null ? String(row.recipe.menuPrice) : "—"} /> : money(row.effectiveMenuPrice)}</td>
      <td className="font-mono">{money(row.grossMargin)}</td><td><span className={`whitespace-nowrap rounded-full px-2 py-1 font-mono text-xs ${row.fcp == null ? "bg-stone" : row.fcp <= rollout.targetFcp ? "bg-pale-sage text-sage" : "bg-amber-100 text-amber-900"}`}>{pct(row.fcp)}</span></td>
      <td>{canEdit ? <Input aria-label={`Opening par for ${row.title}`} form={`menu-line-${row.id}`} className="w-24" name="parBatches" type="number" min="0" step="any" required defaultValue={row.parBatches} /> : num(row.parBatches)}</td>
      <td className="whitespace-nowrap text-xs text-amber-800">{row.priceGaps.unpriced.size > 0 && `⚠ ${row.priceGaps.unpriced.size} `}{row.priceGaps.stale.size > 0 && `⌛ ${row.priceGaps.stale.size}`}{!row.priceGaps.unpriced.size && !row.priceGaps.stale.size && "✓"}{canEdit && <button form={`menu-line-${row.id}`} className="mt-2 block text-gold underline">Save row</button>}</td>
    </tr>)}</tbody></table></div></Card>)}
    {canEdit && <Card className="mb-6 p-5"><h2 className="mb-4 font-display text-2xl italic text-[#2C3E35]">Add a dish</h2><MenuItemForm key={rollout.items.length} rolloutId={id} recipes={recipes.filter(recipe => !used.has(recipe.id))} nextSortOrder={Math.max(-1, ...rollout.items.map(item => item.sortOrder)) + 1} /></Card>}
    <Card className="mb-6 p-5"><h2 className="mb-1 font-display text-2xl italic text-[#2C3E35]">Vendor Order Guide</h2><p className="mb-5 font-mono text-xs text-zinc-500">Check stock and enter order quantities · Updates when a dish is saved</p><MenuOrderGuide plan={plan} /></Card>
    {rollout.notes && <Card className="mb-6 whitespace-pre-wrap p-5 text-sm">{rollout.notes}</Card>}
    {canEdit && <details><summary className="cursor-pointer text-sm text-gold">Rollout settings</summary><Card className="mt-3 p-5"><RolloutForm rollout={rollout} venues={venues} /></Card></details>}
  </div></WorkspaceInspector>;
}
