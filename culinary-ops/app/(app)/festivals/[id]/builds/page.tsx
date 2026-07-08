import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildForecast } from "@/lib/festival";
import { buildDayPlan, banquetRecipeSelect, type BanquetParty } from "@/lib/banquet";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { FestivalTabs } from "../FestivalTabs";

// Scaled builds for the festival: every linked menu item's final prep portions
// drive the recipe batch math, sub-recipes explode, and the whole thing rolls
// into one make-list + aggregated prep (pull) list — the banquet day-plan
// engine with the festival as its single party.
export default async function FestivalBuildsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [festival, recipeRows] = await Promise.all([
    prisma.festival.findUnique({
      where: { id },
      include: {
        menuItems: {
          include: { recipe: { select: { id: true, name: true, yieldUnit: true } } },
          orderBy: { sortOrder: "asc" },
        },
        tents: { orderBy: { sortOrder: "asc" } },
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

  const dishes = plan.recipeRollup.filter((r) => !r.isSubRecipe);
  const subs = plan.recipeRollup.filter((r) => r.isSubRecipe);
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/festivals/${festival.id}`} className="text-sm text-blue-600 hover:underline">
          ← {festival.name}
        </Link>
        <PrintButton label="Print builds" />
      </div>

      <PageHeader
        title="Scaled Builds"
        subtitle={`${festival.name} · ${festival.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · est. food cost ${money(plan.totalCost)}`}
      />

      <FestivalTabs festivalId={festival.id} />

      {(plan.shoppingList.unscaledRecipes.length > 0 || unlinked.length > 0) && (
        <div className="mb-4 space-y-2">
          {unlinked.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ Not in these builds — no recipe linked: {unlinked.map((mi) => mi.name).join(", ")}. Link recipes on the{" "}
              <Link href={`/festivals/${festival.id}/menu`} className="underline">
                Menu &amp; Forecast
              </Link>{" "}
              page.
            </div>
          )}
          {plan.shoppingList.unscaledRecipes.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ Couldn&apos;t scale {plan.shoppingList.unscaledRecipes.join(", ")} — portions don&apos;t convert to the
              recipe yield. Counted as one base batch; verify by hand.
            </div>
          )}
        </div>
      )}

      {linked.length === 0 ? (
        <Card className="p-6 text-center text-sm text-zinc-500">
          No recipe-linked menu items yet — builds scale from the{" "}
          <Link href={`/festivals/${festival.id}/menu`} className="text-blue-600 hover:underline">
            Menu &amp; Forecast
          </Link>{" "}
          worksheet.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Make list — dishes then sub-recipes */}
          <Card>
            <CardHeader>Make list — batches to build</CardHeader>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Recipe</th>
                  <th className="px-4 py-2 text-right font-medium">Batches</th>
                  <th className="px-4 py-2 text-right font-medium">Make</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {[...dishes, ...subs].map((r) => (
                  <tr key={r.recipeId}>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/recipes/${r.recipeId}`} className="font-medium text-zinc-800 hover:underline">
                          {r.recipeName}
                        </Link>
                        {r.isSubRecipe && <Badge color="gray">sub-recipe</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{num(r.totalBatches)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-zinc-900">
                      {num(r.totalQty)} <span className="font-normal text-zinc-500">{unitLabel(r.yieldUnit)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Aggregated prep list */}
          <Card>
            <CardHeader>Aggregated prep list — raw items</CardHeader>
            {plan.shoppingList.itemCount === 0 ? (
              <p className="p-4 text-sm text-zinc-400">Nothing to pull yet.</p>
            ) : (
              <div className="p-4">
                <div className="space-y-5">
                  {plan.shoppingList.categories.map((cat) => (
                    <section key={cat.category} className="break-inside-avoid">
                      <h3 className="border-b border-zinc-200 pb-1 font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                        {cat.category}
                      </h3>
                      <table className="mt-1 w-full text-sm">
                        <tbody className="divide-y divide-zinc-100">
                          {cat.items.map((it) => (
                            <tr key={it.itemId}>
                              <td className="py-1.5 pr-4 text-zinc-800">{it.name}</td>
                              <td className="py-1.5 text-right tabular-nums text-zinc-600">
                                {it.amounts.map((a, j) => (
                                  <div key={j}>
                                    {num(a.qty)} <span className="text-zinc-400">{a.unit}</span>
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
                <p className="mt-4 text-xs text-zinc-400">
                  {plan.shoppingList.itemCount} ingredient{plan.shoppingList.itemCount === 1 ? "" : "s"} · sub-recipes
                  broken down to raw items · est. food cost {money(plan.totalCost)}.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      <p className="mt-8 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
        Printed {printedOn} · Scaled from final prep portions (forecast + buffer) · Mise · Culinary Ops
      </p>
    </div>
  );
}
