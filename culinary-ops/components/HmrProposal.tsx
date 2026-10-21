import type { ToGoPlan } from "@/lib/to-go-rollup";
import { money, pct } from "@/lib/costing";
import { ALLERGENS } from "@/lib/allergens";

export function HmrProposal({ plan }: { plan: ToGoPlan }) {
  return <div className="space-y-6">{plan.sections.map(section => <section key={section.name}>
    <h3 className="mb-3 font-display text-xl text-ink">{section.name}</h3>
    <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Proposed item</th><th>Proposed price</th><th>Storage & reheating notes</th></tr></thead><tbody>{section.rows.map(row => <tr key={row.id}>
      <td><span className="font-medium">{row.name}</span>{row.description && <p className="mt-1 text-xs text-zinc-600">{row.description}</p>}</td>
      <td className="whitespace-nowrap">{row.price != null && row.sellingUnit ? `${money(row.price)} / ${row.sellingUnit}` : "To be decided"}</td>
      <td className="whitespace-pre-wrap text-xs">{row.customerInstructions || "To be developed"}</td>
    </tr>)}</tbody></table></div>
  </section>)}{plan.rows.length === 0 && <p className="text-sm text-zinc-500">Add items to start the menu proposal.</p>}</div>;
}

export function HmrPricing({ plan }: { plan: ToGoPlan }) {
  return <div className="space-y-3">
    <p className="text-sm text-zinc-600">Recipe food cost and proposed price use the same selling unit. Price less food cost is before labor, overhead and other expenses.</p>
    {plan.menuPlan.unpricedNames.length > 0 && <p className="text-xs text-amber-900">Food costs withheld for missing ingredient prices: {plan.menuPlan.unpricedNames.join(", ")}.</p>}
    {plan.menuPlan.staleNames.length > 0 && <p className="text-xs text-amber-900">Estimated costs include stale prices requiring review: {plan.menuPlan.staleNames.join(", ")}.</p>}
    <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs"><thead><tr><th>Item / selling unit</th><th>Recipe food cost</th><th>Proposed price</th><th>Food cost %</th><th>Price less food cost</th></tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}>
      <td>{row.name}<span className="block text-zinc-500">per {row.sellingUnit ?? "unit undecided"}</span></td><td>{money(row.foodCost)}</td><td>{row.sellingUnit ? money(row.price) : "—"}</td><td>{pct(row.foodCostPct)}</td><td>{row.foodCost != null && row.price != null ? money(row.price - row.foodCost) : "—"}</td>
    </tr>)}</tbody></table></div>
  </div>;
}

export function HmrAllergens({ plan }: { plan: ToGoPlan }) {
  const linked = new Map(plan.menuPlan.rows.map(row => [row.id, row]));
  return <div className="space-y-3"><p className="text-sm text-zinc-600">From linked recipes and sub-recipes. Review the final menu and accompaniments before approving customer labels.</p><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Proposed item</th><th>Recipe allergens</th></tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{linked.has(row.id) ? linked.get(row.id)!.allergens.map(key => ALLERGENS.find(allergen => allergen.key === key)?.label ?? key).join(", ") || "None recorded — verify" : "Recipe not linked — not evaluated"}</td></tr>)}</tbody></table></div>;
}
