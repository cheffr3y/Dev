import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { money, num, buildPriceGapMap } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildForecast } from "@/lib/festival";
import { buildDayPlan, banquetRecipeSelect, type BanquetParty } from "@/lib/banquet";
import { PrintButton } from "@/components/PrintButton";
import { FestivalTabs } from "../FestivalTabs";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Kitchen prep / pull sheet for a festival — the printable companion to the
// forecast. Every recipe-linked menu item is scaled to its final prep portions
// (forecast + buffer, chef override winning), sub-recipes explode into batches,
// and everything rolls into one raw-item pull list summed by category. The theo
// food cost is shown with an honesty flag when any ingredient is unpriced.
export default async function FestivalPrepSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [festival, recipeRows] = await Promise.all([
    prisma.festival.findUnique({
      where: { id },
      include: {
        menuItems: {
          include: { recipe: { select: { id: true, name: true, yieldUnit: true } }, tent: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true } }),
  ]);
  if (!festival) notFound();

  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    festival.menuItems.map((mi) => ({
      id: mi.id,
      mixPct: mi.mixPct,
      price: mi.price,
      chefOverride: mi.chefOverride,
      bufferPctOverride: mi.bufferPctOverride,
    })),
  );
  const rowById = new Map(forecast.rows.map((r) => [r.id, r]));

  const linked = festival.menuItems.filter((mi) => mi.recipe);
  const unlinked = festival.menuItems.filter((mi) => !mi.recipe);

  const party: BanquetParty = {
    id: festival.id,
    name: festival.name,
    guestCount: Math.round(festival.expectedAttendance * festival.captureRate),
    lines: linked.map((mi) => ({
      recipeId: mi.recipeId!,
      recipeName: mi.recipe!.name,
      orderedQty: rowById.get(mi.id)?.finalPrepPortions ?? 0,
      unit: mi.recipe!.yieldUnit,
    })),
  };
  const plan = buildDayPlan([party], recipeRows);
  const subs = plan.recipeRollup.filter((r) => r.isSubRecipe);

  // Price honesty — which ingredients in the scaled tree (any sub-recipe depth)
  // have no cost on file, or a cost that hasn't been re-checked recently.
  const gapMap = buildPriceGapMap(
    recipeRows.map((r) => ({
      id: r.id,
      items: r.items.map((ri) => ({ itemId: ri.item.id, unitCost: ri.item.unitCost, priceUpdatedAt: ri.item.priceUpdatedAt })),
      components: r.components,
    })),
  );
  const nameByItemId = new Map<string, string>();
  for (const r of recipeRows) for (const ri of r.items) nameByItemId.set(ri.item.id, ri.item.name);
  const unpriced = new Set<string>();
  const stale = new Set<string>();
  for (const mi of linked) {
    const gap = gapMap.get(mi.recipeId!);
    for (const iid of gap?.unpriced ?? []) unpriced.add(iid);
    for (const iid of gap?.stale ?? []) stale.add(iid);
  }
  const names = (set: Set<string>) => [...set].map((iid) => nameByItemId.get(iid) ?? iid).sort((a, b) => a.localeCompare(b));
  const unpricedNames = names(unpriced);
  const staleNames = names(stale);

  const list = plan.shoppingList;
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/festivals/${festival.id}`} className="text-sm text-blue-600 hover:underline">
          ← {festival.name}
        </Link>
        <PrintButton label="Print prep sheet" />
      </div>

      <div className="no-print">
        <FestivalTabs festivalId={festival.id} />
      </div>

      {linked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">Nothing to prep yet.</p>
          <p className="mt-1 text-sm text-zinc-400">
            Link recipes to menu items on the{" "}
            <Link href={`/festivals/${festival.id}/menu`} className="text-blue-600 hover:underline">
              Menu &amp; Forecast
            </Link>{" "}
            page and they&apos;ll scale into this sheet.
          </p>
        </div>
      ) : (
        <div className="print-sheet mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Festival Prep Sheet</span>
            <span>{Math.round(festival.captureRate * 100)}% capture · {Math.round(festival.bufferPct * 100)}% buffer</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">{festival.name}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {fmtDate(festival.date)} · {festival.expectedAttendance.toLocaleString()} attendance →{" "}
            {party.guestCount.toLocaleString()} projected covers
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {list.itemCount} ingredient{list.itemCount === 1 ? "" : "s"} across {linked.length} dish
            {linked.length === 1 ? "" : "es"} · sub-recipes broken down to raw items · est. food cost {money(plan.totalCost)}.
          </p>

          {list.unscaledRecipes.length > 0 && (
            <div className="mt-4 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
              ⚠ Couldn&apos;t scale {list.unscaledRecipes.join(", ")} — portions don&apos;t convert to the base yield.
              Counted as one base batch each; verify by hand.
            </div>
          )}
          {unpricedNames.length > 0 && (
            <div className="mt-3 border-2 border-red-600 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">
              ⚠ Est. food cost is understated — no price on file for {unpricedNames.length} ingredient
              {unpricedNames.length === 1 ? "" : "s"}: {unpricedNames.join(", ")}. Price them in the{" "}
              <Link href="/items?flag=missing" className="underline">
                Catalog
              </Link>
              .
            </div>
          )}
          {staleNames.length > 0 && (
            <div className="mt-3 border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              ⌛ {staleNames.length} ingredient{staleNames.length === 1 ? "" : "s"} haven&apos;t been re-costed recently
              (verify before trusting the cost): {staleNames.join(", ")}.{" "}
              <Link href="/items?flag=stale" className="underline">
                Review in Catalog
              </Link>
              .
            </div>
          )}
          {unlinked.length > 0 && (
            <div className="mt-3 border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Forecast-only (no recipe linked, not in this sheet): {unlinked.map((mi) => mi.name).join(", ")}.
            </div>
          )}

          {/* Dishes — portions to serve, straight off the forecast. */}
          <section className="mt-8 break-inside-avoid">
            <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
              Dishes — portions to make
            </h2>
            <table className="mt-1 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {linked.map((mi) => {
                  const row = rowById.get(mi.id);
                  return (
                    <tr key={mi.id}>
                      <td className="py-2 pr-4 align-top text-zinc-900">
                        {mi.recipe!.name}
                        <span className="block text-xs font-normal text-zinc-500">
                          {mi.tent.name}
                          {row?.overridden ? " · chef override" : ` · ${Math.round(mi.mixPct * 100)}% mix`}
                        </span>
                      </td>
                      <td className="py-2 text-right align-top font-semibold tabular-nums text-zinc-900">
                        {num(row?.finalPrepPortions ?? 0)}{" "}
                        <span className="font-normal text-zinc-600">{unitLabel(mi.recipe!.yieldUnit)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Sub-recipes — batches to build ahead. */}
          {subs.length > 0 && (
            <section className="mt-8 break-inside-avoid">
              <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                Sub-recipes — batches to build
              </h2>
              <table className="mt-1 w-full text-sm">
                <tbody className="divide-y divide-zinc-100">
                  {subs.map((r) => (
                    <tr key={r.recipeId}>
                      <td className="py-2 pr-4 align-top text-zinc-900">{r.recipeName}</td>
                      <td className="py-2 text-right align-top font-semibold tabular-nums text-zinc-900">
                        {num(r.totalQty)} <span className="font-normal text-zinc-600">{unitLabel(r.yieldUnit)}</span>
                        <span className="ml-1 font-normal text-zinc-400">({num(r.totalBatches)}×)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Raw pull list — everything to pull/buy, summed by category. */}
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
                        <td className="py-2 pr-4 align-top text-zinc-900">
                          {it.name}
                          {unpriced.has(it.itemId) && <span className="ml-1 text-xs font-medium text-red-600">(no price)</span>}
                          {!unpriced.has(it.itemId) && stale.has(it.itemId) && (
                            <span className="ml-1 text-xs font-medium text-amber-600">(stale price)</span>
                          )}
                        </td>
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

          {(festival.weatherNotes || festival.notes) && (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 break-inside-avoid">
              {festival.weatherNotes && (
                <section>
                  <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                    Weather
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{festival.weatherNotes}</p>
                </section>
              )}
              {festival.notes && (
                <section>
                  <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                    Notes
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{festival.notes}</p>
                </section>
              )}
            </div>
          )}

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Scaled from final prep portions (forecast + buffer) · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}
