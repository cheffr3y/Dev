import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadToGoRollup } from "@/lib/to-go-data";
import { buildToGoRollup } from "@/lib/to-go-rollup";
import { TO_GO_PACKETS, toGoPacketMode } from "@/lib/to-go-options";
import { effectiveAllergens } from "@/lib/allergens";
import { num } from "@/lib/costing";
import { MenuOrderGuide } from "@/components/MenuOrderGuide";
import { PrintController, PrintOptionLink } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";
import { printOptionHref, type PrintQuery } from "@/lib/print-options";
import { MenuRecipeCard } from "@/components/MenuRecipeCard";
import { LocalTime } from "@/components/LocalTime";
import { HmrAllergens, HmrPricing, HmrProposal } from "@/components/HmrProposal";
import { ToGoForecast, ToGoPacking } from "@/components/ToGoSheets";

export default async function ToGoPacket({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<PrintQuery & { mode?: string | string[] }>;
}) {
  await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const mode = toGoPacketMode(query.mode);
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
  return <PrintController className="to-go-packet">
    <div className="no-print mb-6 flex flex-wrap items-center gap-3"><Link href={`/to-go/${id}`} className="mr-auto text-sm text-gold hover:underline">← {rollup.name}</Link>{TO_GO_PACKETS.map(packet => <PrintOptionLink key={packet.value} href={printOptionHref(`/to-go/${id}/packet?mode=${packet.value}`, query.density)} className={`text-xs ${mode === packet.value ? "font-bold text-ink" : "text-gold underline"}`}>{packet.label}</PrintOptionLink>)}</div>
    <PrintSpecHeader venue={rollup.venue?.name ?? "Company-wide"} title={rollup.name} targetDate={rollup.orderCutoff ?? undefined} targetLabel={rollup.orderCutoff ? `Order cutoff ${rollup.orderCutoff}` : "Menu planning"} printedAt={printedAt} />
    <header className="mb-8 border-t-4 border-ink pt-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">MISE · HMR Rollout · {rollup.venue?.name ?? "Company-wide"}</p>
      <h1 className="mt-4 font-display text-4xl text-ink">{rollup.name}</h1>
      <p className="mt-2 font-display text-xl text-gold">{TO_GO_PACKETS.find(packet => packet.value === mode)?.label ?? "Saved planning packet"}</p>
      <p className="mt-3 text-xs text-zinc-500">{rollup.status} · {plan.rows.length} proposed items · Prepared <LocalTime date={printedAt} /></p>
      {rollup.orderCutoff && <p className="mt-2 text-sm">Order cutoff: {rollup.orderCutoff}</p>}
      {rollup.pickupNotes && <p className="mt-2 whitespace-pre-wrap text-sm">Pickup: {rollup.pickupNotes}</p>}
      {rollup.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{rollup.notes}</p>}
    </header>
    {show("proposal") && <section id="proposal" className="mb-8"><h2 className="mb-4 font-display text-2xl">Menu proposal</h2><HmrProposal plan={plan} /></section>}
    {show("costing") && <section id="costing" className={mode === "all" ? "to-go-print-section mb-8" : "mb-8"}><h2 className="mb-4 font-display text-2xl">Recipe costs & proposed pricing</h2><HmrPricing plan={plan} /></section>}
    {show("allergens") && <section id="allergens" className={mode === "all" ? "to-go-print-section mb-8" : "mb-8"}><h2 className="mb-4 font-display text-2xl">Allergen guide</h2><HmrAllergens plan={plan} /></section>}
    {show("order-guide") && <section id="order-guide" className={mode === "all" ? "to-go-print-section mb-8" : "mb-8"}><h2 className="mb-4 font-display text-2xl">Vendor checklist</h2><p className="mb-4 text-sm">Ingredient reference for linked recipes and sub-recipes. Check stock and enter vendor pack quantities manually.</p><MenuOrderGuide plan={plan.menuPlan} /></section>}
    {mode === "forecast" && <section id="forecast"><ToGoForecast plan={plan} /></section>}
    {mode === "packing" && <section id="packing"><ToGoPacking plan={plan} /></section>}
    {show("recipes") && <>
      <section id="recipe-index" className={mode === "all" ? "to-go-print-section mb-8" : "mb-8"}><h2 className="mb-4 font-display text-2xl">Recipe & sub-recipe book</h2><p className="mb-4 text-sm">Every recipe uses its saved standard batch yield.</p>{unlinked.length > 0 && <p className="mb-4 text-sm text-amber-900">Recipes still to link: {unlinked.map(row => row.name).join(", ")}.</p>}<ol className="list-decimal space-y-2 pl-5 text-sm">{book.map(recipe => <li key={recipe.id}><a href={`#recipe-${recipe.id}`} className="text-gold underline">{recipe.name}</a> · {num(recipe.yieldQty)} {recipe.yieldUnit} · {rootIds.has(recipe.id) ? "Menu recipe" : "Sub-recipe"}</li>)}</ol></section>
      {book.map(recipe => <MenuRecipeCard key={recipe.id} recipe={recipe} kind="foundation" context={rootIds.has(recipe.id) ? `HMR menu · ${plan.rows.filter(row => row.recipeId === recipe.id).map(row => row.name).join(", ")}` : `Used in: ${plan.menuPlan.dependencies.find(row => row.recipe.id === recipe.id)?.usedIn.join(", ") ?? "HMR builds"}`} id={`recipe-${recipe.id}`} allergenKeys={effectiveAllergens(recipe.id, byId)} printedAt={printedAt} />)}
    </>}
  </PrintController>;
}
