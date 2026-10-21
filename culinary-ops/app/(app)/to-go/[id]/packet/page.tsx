import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadToGoRollup } from "@/lib/to-go-data";
import { buildToGoRollup } from "@/lib/to-go-rollup";
import { TO_GO_PACKETS, toGoPacketMode } from "@/lib/to-go-options";
import { effectiveAllergens } from "@/lib/allergens";
import { num, money } from "@/lib/costing";
import { CostIntegrityBanner } from "@/components/CostAudit";
import { MenuOrderGuide } from "@/components/MenuOrderGuide";
import { PrintButton } from "@/components/PrintButton";
import { MenuRecipeCard } from "@/components/MenuRecipeCard";
import { RecipePrintSettings } from "@/components/RecipeDossier";
import { LocalTime } from "@/components/LocalTime";
import { ToGoAllergens, ToGoCosting, ToGoForecast, ToGoPacking, ToGoReadiness } from "@/components/ToGoSheets";

export default async function ToGoPacket({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string | string[] }>;
}) {
  await requireUser();
  const { id } = await params;
  const mode = toGoPacketMode((await searchParams).mode);
  const [rollup, recipes] = await loadToGoRollup(id);
  if (!rollup) notFound();
  const plan = buildToGoRollup(rollup, recipes);
  const printedAt = new Date();
  const show = (section: string) => mode === "all" || mode === section;
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const rootIds = new Set(plan.rows.flatMap(row => row.recipe ? [row.recipe.id] : []));
  const bookIds = new Set([...rootIds, ...plan.menuPlan.dependencies.map(row => row.recipe.id)]);
  const book = recipes.filter(recipe => bookIds.has(recipe.id));
  const unlinked = plan.rows.filter(row => !row.recipe);
  return <div className="to-go-packet">
    <div className="no-print mb-6 flex flex-wrap items-center gap-3"><Link href={`/to-go/${id}`} className="mr-auto text-sm text-gold hover:underline">← {rollup.name}</Link>{TO_GO_PACKETS.map(packet => <Link key={packet.value} href={`/to-go/${id}/packet?mode=${packet.value}`} className={`text-xs ${mode === packet.value ? "font-bold text-ink" : "text-gold underline"}`}>{packet.label}</Link>)}<PrintButton /></div>
    <RecipePrintSettings />
    <header className="mb-8 border-t-4 border-ink pt-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">MISE · Holiday & To-Go · {rollup.venue?.name ?? "Company-wide"}</p>
      <h1 className="mt-4 font-display text-4xl text-ink">{rollup.name}</h1>
      <p className="mt-2 font-display text-xl text-gold">{TO_GO_PACKETS.find(packet => packet.value === mode)?.label}</p>
      <p className="mt-3 text-xs text-zinc-500">{rollup.status} · {plan.rows.length} items · Prepared <LocalTime date={printedAt} /></p>
      <p className="mt-3 text-sm">Sales estimates are planning assumptions. Production targets can be set later as demand becomes clearer.</p>
      {rollup.orderCutoff && <p className="mt-2 text-sm">Order cutoff: {rollup.orderCutoff}</p>}
      {rollup.pickupNotes && <p className="mt-2 whitespace-pre-wrap text-sm">Pickup: {rollup.pickupNotes}</p>}
      {rollup.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{rollup.notes}</p>}
    </header>
    {show("forecast") && <section id="forecast" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Sales forecast & production</h2><ToGoForecast plan={plan} /></section>}
    {show("costing") && <section id="costing" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Costing & pricing</h2><CostIntegrityBanner unpriced={plan.menuPlan.unpricedNames} stale={plan.menuPlan.staleNames} /><p className="mb-4 text-sm">Forecast revenue {money(plan.forecastRevenue)} ({plan.revenueCoverage}/{plan.rows.length} items) · Food + packaging {money(plan.forecastCost)} ({plan.costCoverage}/{plan.rows.length}) · Margin before labor {money(plan.forecastMargin)} ({plan.marginCoverage}/{plan.rows.length}). Totals include only items with the required inputs.</p><ToGoCosting plan={plan} /></section>}
    {show("packing") && <section id="packing" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Packing & customer instructions</h2><ToGoPacking plan={plan} /></section>}
    {show("allergens") && <section id="allergens" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Allergen guide</h2><ToGoAllergens plan={plan} /></section>}
    {show("order-guide") && <section id="order-guide" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Vendor checklist</h2><p className="mb-4 text-sm">Linked recipes and all sub-recipes. Check stock and enter vendor pack quantities manually. Unlinked menu items and packaging supplies are not included.</p><MenuOrderGuide plan={plan.menuPlan} /></section>}
    {show("forecast") && <section id="readiness" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Still to decide / review</h2><ToGoReadiness plan={plan} /></section>}
    {show("recipes") && <>
      <section id="recipe-index" className="to-go-print-section mb-8"><h2 className="mb-4 font-display text-2xl">Recipe & sub-recipe book</h2><p className="mb-4 text-sm">Every recipe is shown at its saved standard batch yield. Use the combined recipe demand sheet for working production quantities; no single-serving weight is assumed.</p>{unlinked.length > 0 && <p className="mb-4 text-sm text-amber-900">Recipes still to link: {unlinked.map(row => row.name).join(", ")}.</p>}<ol className="list-decimal space-y-2 pl-5 text-sm">{book.map(recipe => <li key={recipe.id}><a href={`#recipe-${recipe.id}`} className="text-gold underline">{recipe.name}</a> · {num(recipe.yieldQty)} {recipe.yieldUnit} · {rootIds.has(recipe.id) ? "Menu recipe" : "Sub-recipe"}</li>)}</ol></section>
      {book.map(recipe => <MenuRecipeCard key={recipe.id} recipe={recipe} kind="foundation" context={rootIds.has(recipe.id) ? `Holiday menu · ${plan.rows.filter(row => row.recipeId === recipe.id).map(row => row.name).join(", ")}` : `Used in: ${plan.menuPlan.dependencies.find(row => row.recipe.id === recipe.id)?.usedIn.join(", ") ?? "Holiday builds"}`} id={`recipe-${recipe.id}`} allergenKeys={effectiveAllergens(recipe.id, byId)} printedAt={printedAt} />)}
    </>}
  </div>;
}
