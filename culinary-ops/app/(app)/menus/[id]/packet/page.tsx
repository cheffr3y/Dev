import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadMenuRollout } from "@/lib/menu-rollout-data";
import { buildMenuRollout, PACKET_MODES, packetMode } from "@/lib/menu-rollout";
import { ALLERGENS, effectiveAllergens } from "@/lib/allergens";
import { preciseNum, money, num, pct } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { AtelierHeader } from "@/components/AtelierHeader";
import { CostAuditStamp, CostIntegrityBanner } from "@/components/CostAudit";
import { MenuOrderGuide } from "@/components/MenuOrderGuide";
import { PrintButton } from "@/components/PrintButton";
import { RecipePrintSettings } from "@/components/RecipeDossier";
import { MenuRecipeCard } from "@/components/MenuRecipeCard";
import { LocalTime } from "@/components/LocalTime";

export default async function MenuPacket({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string | string[] }>;
}) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [rollout, recipes] = await loadMenuRollout(id);
  if (!rollout) notFound();
  const mode = packetMode(query.mode);
  const show = (section: string) => mode === "all" || mode === section;
  const plan = buildMenuRollout(rollout, recipes);
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const printedAt = new Date();
  const renderRecipe = (recipe: typeof recipes[number], scale: number, context: string, anchor: string, converted = true) => (
    <MenuRecipeCard key={anchor} id={anchor} recipe={recipe} scale={scale}
      allergenKeys={effectiveAllergens(recipe.id, byId)} printedAt={printedAt}
      context={`${context} · ${rollout.name}`} converted={converted} />
  );
  const header = (kicker: string) => <AtelierHeader title={rollout.name} venue={rollout.venue?.name ?? "Company-wide"} guests={rollout.expectedCovers} kicker={kicker} runTime="Opening par / launch preparation" />;
  return <div className="atelier-packet mx-auto max-w-[8.5in] text-ink">
    <RecipePrintSettings />
    <div className="no-print mb-5 space-y-3"><div className="flex justify-between gap-3"><Link href={`/menus/${id}`} className="text-sm text-gold underline">← Rollout workspace</Link><PrintButton label="Print launch packet" /></div><nav aria-label="Launch packet sections" className="flex flex-wrap gap-2">{PACKET_MODES.map(option => <Link key={option.mode} href={`/menus/${id}/packet?mode=${option.mode}`} aria-current={mode === option.mode ? "page" : undefined} className={`rounded-full border border-hairline px-3 py-2 text-xs ${mode === option.mode ? "bg-[#2C3E35] text-white" : "bg-canvas text-zinc-600"}`}>{option.label}</Link>)}</nav></div>
    {show("costing") && <CostIntegrityBanner unpriced={plan.unpricedNames} stale={plan.staleNames} />}
    <section className="atelier-cover atelier-paper print-sheet">
      {header("Menu Rollout & Launch Book")}
      <p className="font-display text-2xl italic text-gold">{rollout.subtitle || "A considered guide to opening service"}</p>
      <p className="mt-5 font-mono text-xs text-zinc-500">{rollout.status} · {plan.rows.length} dishes · {plan.dependencies.length} foundational sub-recipes · Prepared <LocalTime date={printedAt} mode="date" /></p>
      {rollout.notes && <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{rollout.notes}</p>}
      <h2 className="mt-8 border-b border-[#E2DDD5] pb-2 font-display text-2xl italic text-[#2C3E35]">Table of Contents</h2>
      <ol className="mt-4 space-y-3 font-mono text-xs">{PACKET_MODES.filter(option => option.mode !== "all" && show(option.mode)).map(option => <li key={option.mode}><a href={`#${option.mode}`} className="text-[#2C3E35]">{option.label}</a></li>)}</ol>
      {show("recipes") && <>
        <p className="mt-5 text-xs text-zinc-500">Recipe quantities follow saved opening par batches. Baseline covers are reference only. Shared sub-recipes show combined demand across the menu.</p>
        <div className="mt-5 grid grid-cols-2 gap-6 text-xs"><section><h3 className="mb-2 font-mono uppercase text-gold">Part A · Plated Menu Builds</h3>{plan.sections.map(section => <div key={section.name} className="mb-3"><h4 className="font-semibold">{section.name}</h4><ul>{section.rows.map(row => <li key={row.id} className="mt-1"><a href={`#dish-${row.id}`}>{row.title}<span className="block font-mono text-[9px] text-zinc-500">{preciseNum(row.parBatches)}× · {preciseNum(row.parBatches * row.recipe.yieldQty)} {unitLabel(row.recipe.yieldUnit)}</span></a></li>)}</ul></div>)}</section><section><h3 className="mb-2 font-mono uppercase text-gold">Part B · Foundational Sub-Recipes</h3><ul>{plan.dependencies.map(dependency => <li key={dependency.recipe.id} className="mt-1"><a href={`#sub-${dependency.recipe.id}`}>{dependency.recipe.name}<span className="block font-mono text-[9px] text-zinc-500">{preciseNum(dependency.openingBatches)}× · {preciseNum(dependency.openingYieldQty)} {unitLabel(dependency.recipe.yieldUnit)}</span></a></li>)}</ul></section></div>
      </>}
    </section>

    {show("costing") && <section id="costing" className="atelier-packet-section atelier-paper print-sheet">
      {header("01 // Executive Costing & Margin Dossier")}
      <div className="mb-6 grid grid-cols-3 gap-4 font-mono text-xs">{[
        ["Average menu price", money(plan.averageMenuPrice)], ["Average food cost", pct(plan.averageFcp)], ["Target food cost", pct(rollout.targetFcp)], ["Average margin", money(plan.averageMargin)], ["Par-weighted food cost", pct(plan.parWeightedFcp)], ["Opening food cost", money(plan.totalOpeningFoodCost)],
      ].map(([label, value]) => <p key={label}><span className="block text-zinc-500">{label}</span><strong className="mt-1 block text-lg font-normal text-[#2C3E35]">{value}</strong></p>)}</div>
      {plan.sections.map(section => <section key={section.name} className="mb-6 atelier-category"><h2 className="font-display text-2xl italic text-[#2C3E35]">{section.name}</h2><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Dish</th><th>Batch</th><th>Cost / yield unit</th><th>Price</th><th>Margin</th><th>FC %</th><th>Par</th><th>Audit</th></tr></thead><tbody>{section.rows.map(row => <tr key={row.id}><td>{row.title}<span className="block text-[9px] text-zinc-500">Per {row.recipe.yieldUnit}</span></td><td>{money(row.batchCost)}</td><td>{money(row.portionCost, 5)}</td><td>{money(row.effectiveMenuPrice)}</td><td>{money(row.grossMargin)}</td><td className={row.fcp != null && row.fcp > rollout.targetFcp ? "text-red-700" : "text-sage"}>{pct(row.fcp)}</td><td>{num(row.parBatches)}×</td><td>{row.priceGaps.unpriced.size > 0 && `⚠ ${row.priceGaps.unpriced.size} unpriced `}{row.priceGaps.stale.size > 0 && `⌛ ${row.priceGaps.stale.size} stale`}{!row.priceGaps.unpriced.size && !row.priceGaps.stale.size && "✓"}</td></tr>)}</tbody></table></section>)}
      <p className="text-[10px] text-zinc-500">Average food cost is unweighted. Par-weighted food cost is opening food cost divided by opening menu revenue for priced dishes. {plan.missingMenuPrices} dishes excluded from price-based ratios. Prices and portion costs use each recipe&apos;s saved yield unit.</p>
      {(plan.unpricedNames.length > 0 || plan.staleNames.length > 0) && <aside className="mt-5 border-l-2 border-gold bg-[#F4F1EA] p-3 text-xs"><h3 className="font-semibold">Price audit exceptions</h3>{plan.unpricedNames.length > 0 && <p className="mt-1">No price: {plan.unpricedNames.join(", ")}</p>}{plan.staleNames.length > 0 && <p className="mt-1">Stale: {plan.staleNames.join(", ")}</p>}<p className="mt-1">Update in Catalog → /items</p></aside>}
      <CostAuditStamp unpriced={plan.priceGaps.unpriced.size} stale={plan.priceGaps.stale.size} date={printedAt} />
    </section>}

    {show("order-guide") && <section id="order-guide" className="atelier-packet-section atelier-paper print-sheet">
      {header("02 // Launch Order Guide & Opening Par Sheet")}
      <p className="mb-4 text-sm">{plan.orderLines.length} raw catalog items · Opening estimate {money(plan.totalOpeningFoodCost)}</p>
      <MenuOrderGuide plan={plan} showPullSheet />
      <CostAuditStamp unpriced={plan.priceGaps.unpriced.size} stale={plan.priceGaps.stale.size} date={printedAt} />
    </section>}

    {show("allergens") && <section id="allergens" className="atelier-packet-section atelier-paper print-sheet">
      {header("03 // FOH & BOH Allergen & Service Study Guide")}
      <div className="overflow-x-auto"><table className="atelier-table allergen-matrix w-full text-center text-[9px]"><thead><tr><th className="text-left">Dish / Station</th>{ALLERGENS.map(allergen => <th key={allergen.key} scope="col">{allergen.label}</th>)}</tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}><th scope="row" className="text-left font-medium">{row.title}<span className="block text-[8px] text-zinc-500">{row.recipe.station || "Kitchen"}</span></th>{ALLERGENS.map(allergen => <td key={allergen.key} aria-label={row.allergens.includes(allergen.key) ? `Contains ${allergen.label}` : `${allergen.label} not recorded`}>{row.allergens.includes(allergen.key) ? "●" : "—"}</td>)}</tr>)}</tbody></table></div>
      <p className="mt-3 text-[9px] text-zinc-500">● = recorded in the dish, an ingredient, or a nested sub-recipe. — = not recorded. Confirm substitutions and cross-contact with the chef before service.</p>
      <div className="mt-6 grid grid-cols-2 gap-5">{plan.rows.map(row => <article key={row.id} className="break-inside-avoid border-b border-[#E2DDD5] pb-3"><p className="font-mono text-[9px] uppercase text-gold">{row.section} · {row.recipe.station || "Kitchen"}</p><h2 className="font-display text-xl text-[#2C3E35]">{row.title}</h2><p className="mt-1 text-xs leading-relaxed">{row.menuDescription || "Service description to be confirmed with the chef."}</p></article>)}</div>
    </section>}

    {show("recipes") && <div id="recipes" className="launch-recipe-book">
      {plan.sections.flatMap(section => section.rows.map(row => renderRecipe(byId.get(row.recipeId)!, row.parBatches, `Part A · ${section.name} · Plated Menu Builds`, `dish-${row.id}`)))}
      {plan.dependencies.map(dependency => renderRecipe(byId.get(dependency.recipe.id)!, dependency.openingBatches, `Part B · Foundational Sub-Recipes & Mise en Place · Used in: ${dependency.usedIn.join(", ")}`, `sub-${dependency.recipe.id}`, dependency.converted))}
    </div>}
  </div>;
}
