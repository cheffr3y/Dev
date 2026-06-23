// Shared render of a built shopping / pull list: the unscaled-recipe warning
// plus every raw ingredient grouped by category as a check-off table. Used by
// the standalone shopping-list page and inlined at the front of the cook packet
// so the prep team can pull or buy everything before building.

import { num } from "@/lib/costing";
import type { ShoppingList } from "@/lib/shopping";

export function ShoppingListBody({ list }: { list: ShoppingList }) {
  return (
    <>
      {list.unscaledRecipes.length > 0 && (
        <div className="mt-4 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ Couldn&apos;t scale {list.unscaledRecipes.join(", ")} — requested units don&apos;t convert to the base
          yield. Amounts below assume one base batch each; verify by hand.
        </div>
      )}

      <div className="mt-8 space-y-8">
        {list.categories.map((cat) => (
          <section key={cat.category} className="break-inside-avoid">
            <h3 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
              {cat.category}
            </h3>
            <table className="mt-1 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {cat.items.map((it) => (
                  <tr key={it.itemId}>
                    {/* Check-off box for the shopper */}
                    <td className="w-6 py-2 align-top">
                      <span className="inline-block h-3.5 w-3.5 border border-zinc-400" />
                    </td>
                    <td className="py-2 pr-4 align-top text-zinc-900">{it.name}</td>
                    <td className="py-2 text-right align-top font-semibold tabular-nums text-zinc-900">
                      {it.amounts.map((a, i) => (
                        <div key={i}>
                          {num(a.qty)} <span className="font-normal text-zinc-600">{a.unit}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </>
  );
}
