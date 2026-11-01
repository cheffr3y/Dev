import { money, num, pct, preciseNum } from "@/lib/costing";
import { TO_GO_CONFIDENCE } from "@/lib/to-go-options";
import type { ToGoPlan } from "@/lib/to-go-rollup";
import { ALLERGENS } from "@/lib/allergens";

export function ToGoForecast({ plan }: { plan: ToGoPlan }) {
  return <div className="space-y-5">
    <p className="text-sm text-zinc-600">Sales estimates are guesses in each item’s selling unit. An optional production target replaces the estimate for prep; it does not change projected sales. Actual sold is a later comparison.</p>
    <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Item</th><th>Estimated sales</th><th>Confidence</th><th>Prep target</th><th>Recipe amount</th><th>Actual sold</th><th>Sales variance</th></tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}>
      <td className="font-medium">{row.name}<span className="block font-normal text-zinc-500">{row.section}</span></td>
      <td>{num(row.forecastQty)} {row.sellingUnit ?? "unit undecided"}</td>
      <td>{TO_GO_CONFIDENCE.find(option => option.value === row.confidence)?.label ?? row.confidence}</td>
      <td>{num(row.targetQty)} {row.sellingUnit ?? "unit undecided"}<span className="block text-zinc-500">{row.targetQty != null ? row.targetSource : "Not set"}</span></td>
      <td>{row.productionYield != null ? `${num(row.productionYield)} ${row.recipe!.yieldUnit}` : "Needs recipe / selling spec"}</td>
      <td>{num(row.actualSoldQty)} {row.sellingUnit ?? ""}</td><td>{row.salesVariance == null ? "—" : `${row.salesVariance > 0 ? "+" : ""}${num(row.salesVariance)} ${row.sellingUnit}`}</td>
    </tr>)}</tbody></table></div>
    <h3 className="font-display text-xl text-ink">Combined recipe demand</h3>
    <p className="text-xs text-zinc-500">Working quantities from the targets above. Shared sub-recipes are combined once; fractional batches are not rounded up.</p>
    {plan.productionExcluded.length > 0 && <p role="status" className="text-sm text-amber-900">Incomplete production rollup: {plan.productionExcluded.map(row => row.name).join(", ")} excluded until recipe links, yields and selling specifications are ready.</p>}
    {plan.production.recipeRollup.length > 0 ? <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Recipe / sub-recipe</th><th>Total to make</th><th>Standard batches</th><th>Used by</th></tr></thead><tbody>{plan.production.recipeRollup.map(row => <tr key={row.recipeId}><td>{row.recipeName}{row.isSubRecipe && <span className="block text-zinc-500">Sub-recipe</span>}</td><td>{num(row.totalQty)} {row.yieldUnit}</td><td>{preciseNum(row.totalBatches)}</td><td>{row.splits.map(split => split.partyName).join(", ")}</td></tr>)}</tbody></table></div> : <p className="text-sm text-zinc-500">Recipe demand appears when an item has a quantity, a linked recipe and a usable selling specification.</p>}
  </div>;
}

export function ToGoCosting({ plan }: { plan: ToGoPlan }) {
  return <div className="space-y-3"><p className="text-sm text-zinc-600">All prices and costs are per selling unit. Food + packaging excludes labor, overhead and sales fees. Blank costs stay unknown; ingredient pricing gaps are flagged.</p>{plan.menuPlan.unpricedNames.length > 0 && <p className="text-xs text-amber-900">Food costs withheld for missing ingredient prices: {plan.menuPlan.unpricedNames.join(", ")}.</p>}{plan.menuPlan.staleNames.length > 0 && <p className="text-xs text-amber-900">Estimated costs include stale prices requiring review: {plan.menuPlan.staleNames.join(", ")}.</p>}<div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Item / selling unit</th><th>Food cost</th><th>Packaging</th><th>Food + packaging</th><th>Sell price</th><th>Margin per unit</th><th>Food cost %</th><th>Food + pack %</th><th>Forecast revenue</th></tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}><td>{row.name}<span className="block text-zinc-500">per {row.sellingUnit ?? "unit undecided"}</span></td><td>{money(row.foodCost)}</td><td>{money(row.packagingCost)}</td><td>{money(row.unitCost)}</td><td>{money(row.price)}</td><td>{money(row.margin)}</td><td>{pct(row.foodCostPct)}</td><td>{pct(row.totalCostPct)}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></div>;
}

export function ToGoPacking({ plan }: { plan: ToGoPlan }) {
  return <div className="space-y-3"><p className="text-sm text-zinc-600">Targets use selling units. Pounds and quarts are food quantities; container counts must be specified in the packing notes.</p><div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Check / item</th><th>Target for packing</th><th>Packing specification</th><th>Customer storage and reheating</th></tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}><td className="print-write-in">[  ] {row.name}<span className="block text-zinc-500">{row.description}</span></td><td>{num(row.targetQty)} {row.sellingUnit ?? "unit undecided"}<span className="block text-zinc-500">{row.targetQty != null ? row.targetSource : "Not set"}</span></td><td className="whitespace-pre-wrap">{row.packingNotes || "Specification pending"}</td><td className="whitespace-pre-wrap">{row.customerInstructions || "Instructions pending chef review"}</td></tr>)}</tbody></table></div></div>;
}

export function ToGoAllergens({ plan }: { plan: ToGoPlan }) {
  const byId = new Map(plan.menuPlan.rows.map(row => [row.id, row]));
  return <div className="space-y-3"><p className="text-sm text-zinc-600">Derived from linked recipes and sub-recipes. Review packaged accompaniments and cross-contact before approving customer labels.</p><div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Item</th><th>Recipe allergens</th><th>Packing / accompaniments to review</th></tr></thead><tbody>{plan.rows.map(row => {
    const linked = byId.get(row.id);
    return <tr key={row.id}><td>{row.name}</td><td>{linked ? linked.allergens.map(key => ALLERGENS.find(allergen => allergen.key === key)?.label ?? key).join(", ") || "None recorded — verify" : "Recipe not linked — not evaluated"}</td><td>{row.packingNotes || "Specification pending"}</td></tr>;
  })}</tbody></table></div></div>;
}

export function ToGoReadiness({ plan }: { plan: ToGoPlan }) {
  if (!plan.rows.length) return <p className="text-sm text-zinc-500">Add menu items to begin the rollup.</p>;
  const pending = plan.rows.filter(row => row.warnings.length > 0);
  return pending.length > 0 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Draft items are allowed. Fill in missing details as recipes and sales assumptions develop.</p>{pending.map(row => <div key={row.id} className="border-b border-hairline pb-3 text-sm"><p className="font-medium">{row.name}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-900">{row.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>{row.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-600">{row.notes}</p>}</div>)}</div> : <p className="text-sm text-sage">All items have sales estimates, selling specifications and complete current ingredient costs.</p>;
}
