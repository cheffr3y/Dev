import { useId } from "react";
import { money, num, pct } from "@/lib/recipes/costing";
import { unitLabel } from "@/lib/recipes/units";
import type { RecipeCostSheet } from "@/lib/recipes/recipe-cost-sheet";

export function RecipeCosting({ costs }: { costs: RecipeCostSheet }) {
  const titleId = useId();
  const groups = [
    { label: "Ingredients", lines: costs.ingredients, subtotal: costs.ingredientsCost },
    { label: "Sub-recipes", lines: costs.components, subtotal: costs.componentsCost },
  ].filter((group) => group.lines.length > 0);
  return (
    <section aria-labelledby={titleId} className="recipe-costing mt-6">
      <h2 id={titleId} className="recipe-section-title border-b border-hairline pb-2 font-display text-[23px] italic text-[#2C3E35]">Recipe Costing</h2>
      <dl className="recipe-cost-summary my-3 grid grid-cols-2 gap-3 border-b border-hairline pb-3">
        {[
          { label: "Total batch cost", value: money(costs.totalCost) },
          { label: `Cost / ${costs.costUnit}`, value: money(costs.perUnit, 5) },
          ...(costs.menuPrice != null && costs.menuPrice > 0 ? [
            { label: `Menu price / ${costs.costUnit}`, value: money(costs.menuPrice, 5) },
            { label: "Food cost %", value: pct(costs.foodCostPercent) },
          ] : []),
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="font-mono text-[9px] uppercase tracking-wide text-zinc-500">{stat.label}</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-[#2C3E35]">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-left text-[11px]">
        <thead className="font-mono text-[9px] uppercase text-zinc-500">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Item</th>
            <th scope="col" className="px-2 py-1 text-right font-medium">Qty</th>
            <th scope="col" className="px-2 py-1 text-right font-medium">Unit cost</th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">Line cost</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.label}>
            <tr><th scope="rowgroup" colSpan={4} className="pt-3 pb-1 font-mono text-[9px] uppercase text-gold">{group.label}</th></tr>
            {group.lines.map((line) => (
              <tr key={line.id} className="border-b border-dotted border-[#E2DDD5]">
                <th scope="row" className="py-1.5 pr-3 font-medium">
                  {line.name}
                  {!line.converted && <span className="block text-[9px] font-normal text-amber-800">Unit mismatch — verify cost</span>}
                </th>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums">{num(line.quantity)} {unitLabel(line.unit)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{money(line.unitCost, 5)} / {line.costUnit}</td>
                <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums">{money(line.cost)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <th scope="row" colSpan={3} className="py-2">{group.label} subtotal</th>
              <td className="py-2 text-right font-mono tabular-nums">{money(group.subtotal)}</td>
            </tr>
          </tbody>
        ))}
        <tfoot className="border-t border-[#2C3E35] text-[#2C3E35]">
          <tr>
            <th scope="row" colSpan={3} className="py-2">Total batch cost</th>
            <td className="py-2 text-right font-mono font-semibold tabular-nums">{money(costs.totalCost)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[9px] text-zinc-500">Ingredient and sub-recipe costs at current catalog prices. Unit costs stay fixed when the batch is scaled.</p>
    </section>
  );
}
