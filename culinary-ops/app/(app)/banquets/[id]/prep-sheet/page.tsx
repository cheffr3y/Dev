import { loadBanquetRevision } from "@/lib/banquets/banquet-baseline-data";
import { BanquetRevision } from "@/components/BanquetRevision";
import { AtelierHeader } from "@/components/AtelierHeader";
import { RecipePrintSettings } from "@/components/RecipeDossier";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { num, priceGapNames } from "@/lib/recipes/costing";
import { unitLabel } from "@/lib/recipes/units";
import { buildBanquetPlan, banquetRecipeSelect, type BanquetLine } from "@/lib/banquets/banquet";
import { PrintButton } from "@/components/PrintButton";
import { ProductionJobQr } from "@/components/ProductionJobQr";
import { jobScanHref } from "@/lib/production/production-job-options";
import { PriceIntegrityNotice } from "@/components/PriceIntegrityNotice";

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

  // Price-check across the dishes being cooked (sub-recipes included).
  const nameByItemId = new Map<string, string>();
  for (const r of recipeRows) for (const ri of r.items) nameByItemId.set(ri.item.id, ri.item.name);
  const priceGaps = priceGapNames(
    recipeRows.map((r) => ({
      id: r.id,
      items: r.items.map((ri) => ({ itemId: ri.item.id, unitCost: ri.item.unitCost, priceUpdatedAt: ri.item.priceUpdatedAt })),
      components: r.components,
    })),
    lines.map((l) => l.recipeId),
    nameByItemId,
  );

  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="atelier-packet mx-auto max-w-[8.5in]">
      <RecipePrintSettings />
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/banquets/${banquet.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to banquet
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/banquets/${banquet.id}/packet`} className="text-sm text-blue-600 hover:underline">
            Cook packet
          </Link>
          <PrintButton label="Print prep sheet" />
        </div>
      </div>

      {list.itemCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No ingredients to list.</p>
          <p className="mt-1 text-sm text-zinc-400">Add food lines to the banquet to build the prep sheet.</p>
        </div>
      ) : (
        <div className="print-sheet atelier-paper">
          <AtelierHeader title={banquet.name} venue={banquet.venue.name} date={banquet.date} guests={banquet.guestCount} runTime={banquet.timeLabel} kicker="Banquet Prep & Pull Sheet" />
          <BanquetRevision data={await loadBanquetRevision(id)} />
          <p className="text-xs text-zinc-500">{list.itemCount} ingredients across {lines.length} dishes · sub-recipes broken down to raw items.</p>

          {list.unscaledRecipes.length > 0 && (
            <div className="mt-4 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
              ⚠ Couldn&apos;t scale {list.unscaledRecipes.join(", ")} — ordered units don&apos;t convert to the base yield.
              Amounts below assume one base batch each; verify by hand.
            </div>
          )}

          <PriceIntegrityNotice unpriced={priceGaps.unpriced} stale={priceGaps.stale} className="mt-4" />

          {/* Dish summary — what each ordered count works out to. */}
          <section className="mt-8 break-inside-avoid">
            <h2 className="border-b border-[#E2DDD5] pb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-gold">
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
                    <td className="p-2"><ProductionJobQr href={jobScanHref({ kind: "BANQUET", lineId: mi.id })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="mt-8 space-y-8">
            {list.categories.map((cat) => (
              <section key={cat.category} className="break-inside-avoid">
                <h2 className="border-b border-[#E2DDD5] pb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-gold">
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
                  <h2 className="border-b border-[#E2DDD5] pb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-gold">
                    Special instructions
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{banquet.specialInstructions}</p>
                </section>
              )}
              {banquet.setupNotes && (
                <section>
                  <h2 className="border-b border-[#E2DDD5] pb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-gold">
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
