import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { buildShoppingList, type ShoppingRecipeNode } from "@/lib/shopping";
import { PrintButton } from "@/components/PrintButton";

// Shopping / pull list — the companion to the cook packet. Every raw
// ingredient needed across all printed batches, summed and grouped by
// category. Sub-recipes are exploded down to their purchasable items, so this
// lists only things you actually buy or pull, in the amounts the day requires.

// forDate-derived dates are UTC-midnight; format in UTC so the day is stable.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function ShoppingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [order, recipes] = await Promise.all([
    prisma.prepOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: { recipe: { select: { name: true } } },
          orderBy: [{ recipe: { name: "asc" } }],
        },
      },
    }),
    // Full recipe catalog (lightweight) so sub-recipes can be exploded to raw
    // items — same loading pattern the cost engine uses.
    prisma.recipe.findMany({
      select: {
        id: true,
        yieldQty: true,
        yieldUnit: true,
        items: { select: { quantity: true, unit: true, item: { select: { id: true, name: true, category: true } } } },
        components: { select: { childId: true, quantity: true } },
      },
    }),
  ]);
  if (!order) notFound();

  // Match the cook packet: only printed lines (those with a lot) are in play.
  const printed = order.lines.filter((l) => l.lot);

  const nodes: ShoppingRecipeNode[] = recipes.map((r) => ({
    id: r.id,
    yieldQty: r.yieldQty,
    yieldUnit: r.yieldUnit,
    items: r.items.map((ri) => ({
      itemId: ri.item.id,
      name: ri.item.name,
      category: ri.item.category,
      quantity: ri.quantity,
      unit: ri.unit,
    })),
    components: r.components,
  }));

  const list = buildShoppingList(
    printed.map((l) => ({
      recipeId: l.recipeId,
      recipeName: l.recipe.name,
      requestedQty: l.requestedQty,
      requestedUnit: l.requestedUnit,
    })),
    nodes,
  );

  const forDate = fmtDate(order.forDate);
  const printedOn = fmtDate(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/prep-orders/${order.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to order
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/prep-orders/${order.id}/packet`} className="text-sm text-blue-600 hover:underline">
            Cook packet
          </Link>
          <PrintButton label="Print shopping list" />
        </div>
      </div>

      {printed.length === 0 || list.itemCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">
            {printed.length === 0 ? "No printed lines yet." : "No ingredients to list."}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {printed.length === 0
              ? "Generate the cook packet from the order to build the shopping list."
              : "The printed recipes have no ingredients recorded."}
          </p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Shopping List</span>
            <span>Production {forDate}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">Commissary Prep</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {list.itemCount} ingredient{list.itemCount === 1 ? "" : "s"} across {printed.length} batch
            {printed.length === 1 ? "" : "es"} · sub-recipes broken down to raw items.
          </p>

          {list.unscaledRecipes.length > 0 && (
            <div className="mt-4 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
              ⚠ Couldn&apos;t scale {list.unscaledRecipes.join(", ")} — requested units don&apos;t convert to the base
              yield. Amounts below assume one base batch each; verify by hand.
            </div>
          )}

          <div className="mt-8 space-y-8">
            {list.categories.map((cat) => (
              <section key={cat.category} className="break-inside-avoid">
                <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                  {cat.category}
                </h2>
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

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Quantities summed across all printed batches · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}
