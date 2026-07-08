import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildForecast, buildFestivalOrderGuide, festivalItemMetaSelect, type FestivalItemMeta, type OnHandEntry } from "@/lib/festival";
import { buildDayPlan, banquetRecipeSelect, type BanquetParty } from "@/lib/banquet";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { upsertFestivalOnHand, updateItemPurchasing } from "../../actions";
import { FestivalTabs } from "../FestivalTabs";
import { INPUT_CELL, CALC_CELL, RESULT_CELL, WorksheetLegend } from "../../worksheet";

// Vendor-grouped order guide: the builds' raw-item needs, converted to each
// item's purchase unit, divided by yield factor (smoked/cooked proteins need
// more raw in than finished out), less what's already on hand for this
// festival, rounded UP to pack size, and costed.
export default async function FestivalOrderGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [festival, recipeRows] = await Promise.all([
    prisma.festival.findUnique({
      where: { id },
      include: {
        menuItems: {
          include: { recipe: { select: { id: true, name: true, yieldUnit: true } } },
          orderBy: { sortOrder: "asc" },
        },
        onHand: true,
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

  // Purchasing metadata + venue inventory hint for every item on the list.
  const itemIds = plan.shoppingList.categories.flatMap((c) => c.items.map((i) => i.itemId));
  const [items, venueInventory] = await Promise.all([
    itemIds.length
      ? prisma.item.findMany({ where: { id: { in: itemIds } }, select: festivalItemMetaSelect })
      : Promise.resolve([]),
    festival.venueId && itemIds.length
      ? prisma.inventoryItem.findMany({
          where: { venueId: festival.venueId, itemId: { in: itemIds } },
          select: { itemId: true, quantity: true, unit: true, venue: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const itemMeta = new Map<string, FestivalItemMeta>(items.map((i) => [i.id, i]));
  const onHandMap = new Map<string, OnHandEntry>(
    festival.onHand.map((oh) => [oh.itemId, { quantity: oh.quantity, unit: oh.unit }]),
  );
  const venueHint = new Map(venueInventory.map((vi) => [vi.itemId, vi]));
  const venueName = venueInventory[0]?.venue.name;

  const guide = buildFestivalOrderGuide(
    plan.shoppingList,
    itemMeta,
    onHandMap,
    [
      ...plan.shoppingList.unscaledRecipes.map(
        (r) => `${r}: portions don't convert to the recipe yield — counted as one base batch; verify by hand.`,
      ),
      ...unlinked.map((mi) => `${mi.name}: no recipe linked — not included in this order guide.`),
    ],
  );

  const onHandById = new Map(festival.onHand.map((oh) => [oh.itemId, oh]));
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/festivals/${festival.id}`} className="text-sm text-blue-600 hover:underline">
          ← {festival.name}
        </Link>
        <PrintButton label="Print order guide" />
      </div>

      <PageHeader
        title="Order Guide"
        subtitle={`${festival.name} · ${festival.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · est. order total ${money(guide.grandTotal)}`}
      />

      <FestivalTabs festivalId={festival.id} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <WorksheetLegend />
      </div>

      {guide.warnings.length > 0 && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {guide.warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}

      {guide.groups.length === 0 ? (
        <Card className="p-6 text-center text-sm text-zinc-500">
          Nothing to order yet — link recipes and set portions on the{" "}
          <Link href={`/festivals/${festival.id}/menu`} className="text-blue-600 hover:underline">
            Menu &amp; Forecast
          </Link>{" "}
          worksheet.
        </Card>
      ) : (
        <div className="space-y-6">
          {guide.groups.map((group) => (
            <Card key={group.vendorName} className="overflow-x-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span>{group.vendorName}</span>
                  <span className="text-zinc-500">{money(group.subtotal)}</span>
                </div>
              </CardHeader>
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Need</th>
                    <th className="px-3 py-2 text-right font-medium">Raw (÷ yield)</th>
                    {venueName && <th className="px-3 py-2 text-right font-medium no-print">@ {venueName}</th>}
                    <th className="px-3 py-2 text-right font-medium">On Hand</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-3 py-2 text-right font-medium">Packs</th>
                    <th className="px-3 py-2 text-right font-medium">Order</th>
                    <th className="px-3 py-2 text-right font-medium">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {group.rows.map((r) => {
                    const meta = itemMeta.get(r.itemId);
                    const hint = venueHint.get(r.itemId);
                    const savedOnHand = onHandById.get(r.itemId);
                    return (
                      <tr key={r.itemId} className="align-top">
                        <td className="px-4 py-2">
                          <span className="font-medium text-zinc-800">{r.name}</span>
                          {r.packLabel && (
                            <span className="ml-1 text-xs text-zinc-400">
                              ({r.missingPack ? `pack: ${r.packLabel}` : `${r.packLabel}/pack`})
                            </span>
                          )}
                          {r.unconvertible && (
                            <p className="mt-0.5 text-xs font-medium text-amber-600">⚠ some amounts didn&apos;t convert</p>
                          )}
                          {canEdit && r.missingPack && meta && (
                            <details className="mt-1 no-print">
                              <summary className="cursor-pointer text-xs text-blue-600">
                                set pack &amp; yield <span className="text-zinc-400">(updates Catalog)</span>
                              </summary>
                              <form action={updateItemPurchasing} className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                                <input type="hidden" name="itemId" value={r.itemId} />
                                <input type="hidden" name="festivalId" value={festival.id} />
                                <input
                                  name="packQty"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  placeholder="pack qty"
                                  defaultValue={meta.packQty ?? ""}
                                  className={`w-20 ${INPUT_CELL}`}
                                />
                                <input
                                  name="packUnit"
                                  placeholder={r.unit}
                                  defaultValue={meta.packUnit ?? ""}
                                  className={`w-16 ${INPUT_CELL} text-left`}
                                />
                                <span className="text-zinc-400">yield</span>
                                <input
                                  name="yieldFactor"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max="1"
                                  defaultValue={num(meta.yieldFactor)}
                                  className={`w-14 ${INPUT_CELL}`}
                                />
                                <button className="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-zinc-100">✓</button>
                              </form>
                            </details>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right ${CALC_CELL}`}>
                          {num(r.need)} <span className="text-zinc-400">{unitLabel(r.unit)}</span>
                        </td>
                        <td className={`px-3 py-2 text-right ${CALC_CELL}`}>
                          {num(r.rawNeed)}
                          {meta && meta.yieldFactor !== 1 && (
                            <span className="ml-1 text-xs text-zinc-400">÷{num(meta.yieldFactor)}</span>
                          )}
                        </td>
                        {venueName && (
                          <td className={`px-3 py-2 text-right text-xs no-print ${CALC_CELL}`}>
                            {hint ? `${num(hint.quantity)} ${unitLabel(hint.unit)}` : "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right">
                          {canEdit ? (
                            <form action={upsertFestivalOnHand} className="inline-flex items-center justify-end gap-1">
                              <input type="hidden" name="festivalId" value={festival.id} />
                              <input type="hidden" name="itemId" value={r.itemId} />
                              <input type="hidden" name="unit" value={savedOnHand?.unit ?? r.unit} />
                              <input
                                name="quantity"
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={savedOnHand ? num(savedOnHand.quantity) : ""}
                                placeholder="0"
                                className={`w-16 ${INPUT_CELL}`}
                              />
                              <span className="text-xs text-zinc-400">{unitLabel(savedOnHand?.unit ?? r.unit)}</span>
                              <button className="no-print rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">
                                ✓
                              </button>
                            </form>
                          ) : (
                            <span className={CALC_CELL}>{num(r.onHand)}</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right ${CALC_CELL}`}>{num(r.net)}</td>
                        <td className={`px-3 py-2 text-right ${CALC_CELL}`}>{r.packCount != null ? r.packCount : "—"}</td>
                        <td className={`px-3 py-2 text-right ${RESULT_CELL}`}>
                          {num(r.orderQty)} <span className="font-normal text-zinc-500">{unitLabel(r.unit)}</span>
                        </td>
                        <td className={`px-3 py-2 text-right ${CALC_CELL}`}>{money(r.estCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                    <td className="px-4 py-2 text-zinc-700" colSpan={venueName ? 8 : 7}>
                      {group.vendorName} subtotal
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-900">{money(group.subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          ))}

          <Card>
            <div className="flex items-center justify-between p-4">
              <p className="text-sm font-medium text-zinc-700">Estimated order total</p>
              <p className="font-display text-2xl text-ink">{money(guide.grandTotal)}</p>
            </div>
          </Card>
        </div>
      )}

      <p className="mt-8 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
        Printed {printedOn} · Raw need ÷ yield factor, less on-hand, rounded up to pack · Mise · Culinary Ops
      </p>
    </div>
  );
}
