import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildBanquetPlan, banquetRecipeSelect, type BanquetLine } from "@/lib/banquet";
import { PrintButton } from "@/components/PrintButton";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Kitchen prep / pull sheet for a banquet — the companion to the BEO. Every
// dish scaled to its ordered count, sub-recipes exploded to raw items, summed
// and grouped by category with a check-off box for the shopper.
export default async function BanquetPrepSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [banquet, recipeRows] = await Promise.all([
    prisma.banquet.findUnique({
      where: { id },
      include: {
        venue: true,
        menuItems: { include: { recipe: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.recipe.findMany({ select: banquetRecipeSelect }),
  ]);
  if (!banquet) notFound();

  const lines: BanquetLine[] = banquet.menuItems.map((mi) => ({
    recipeId: mi.recipeId,
    recipeName: mi.recipe.name,
    orderedQty: mi.orderedQty,
    unit: mi.unit,
  }));
  const { shoppingList: list } = buildBanquetPlan(lines, recipeRows);

  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/banquets/${banquet.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to banquet
        </Link>
        <PrintButton label="Print prep sheet" />
      </div>

      {list.itemCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No ingredients to list.</p>
          <p className="mt-1 text-sm text-zinc-400">Add food lines to the banquet to build the prep sheet.</p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Banquet Prep Sheet</span>
            <span>{banquet.venue.name}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">{banquet.name}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {fmtDate(banquet.date)}
            {banquet.timeLabel ? ` · ${banquet.timeLabel}` : ""}
            {banquet.guestCount > 0 ? ` · ${banquet.guestCount} guests` : ""}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {list.itemCount} ingredient{list.itemCount === 1 ? "" : "s"} across {lines.length} dish
            {lines.length === 1 ? "" : "es"} · sub-recipes broken down to raw items.
          </p>

          {list.unscaledRecipes.length > 0 && (
            <div className="mt-4 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
              ⚠ Couldn&apos;t scale {list.unscaledRecipes.join(", ")} — ordered units don&apos;t convert to the base yield.
              Amounts below assume one base batch each; verify by hand.
            </div>
          )}

          {/* Dish summary — what each ordered count works out to. */}
          <section className="mt-8 break-inside-avoid">
            <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
              Dishes
            </h2>
            <table className="mt-1 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {banquet.menuItems.map((mi) => (
                  <tr key={mi.id}>
                    <td className="py-2 pr-4 align-top text-zinc-900">
                      {mi.recipe.name}
                      {mi.description && <span className="block text-xs font-normal text-zinc-500">{mi.description}</span>}
                    </td>
                    <td className="py-2 text-right align-top font-semibold tabular-nums text-zinc-900">
                      {num(mi.orderedQty)} <span className="font-normal text-zinc-600">{unitLabel(mi.unit)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

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

          {(banquet.specialInstructions || banquet.setupNotes) && (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 break-inside-avoid">
              {banquet.specialInstructions && (
                <section>
                  <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                    Special instructions
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{banquet.specialInstructions}</p>
                </section>
              )}
              {banquet.setupNotes && (
                <section>
                  <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                    Setup
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{banquet.setupNotes}</p>
                </section>
              )}
            </div>
          )}

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Quantities summed across all ordered dishes · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}
