import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { buildForecast } from "@/lib/festival";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { STATUS_COLOR } from "@/lib/event-status";
import { updateFestivalMenuItem, removeFestivalMenuItem, linkRecipeToMenuItem } from "../../actions";
import { AddMenuItemForm } from "../../AddMenuItemForm";
import { FestivalTabs } from "../FestivalTabs";
import { RecipePicker } from "@/components/RecipePicker";
import { INPUT_CELL, CALC_CELL, RESULT_CELL, WorksheetLegend } from "../../worksheet";

export default async function FestivalMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [festival, recipes] = await Promise.all([
    prisma.festival.findUnique({
      where: { id },
      include: {
        tents: {
          orderBy: { sortOrder: "asc" },
          include: {
            menuItems: {
              include: { recipe: { select: { id: true, name: true } } },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    }),
    prisma.recipe.findMany({
      select: { id: true, name: true, prodCode: true, yieldQty: true, yieldUnit: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!festival) notFound();

  const allItems = festival.tents.flatMap((t) => t.menuItems);
  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    allItems.map((mi) => ({
      id: mi.id,
      mixPct: mi.mixPct,
      price: mi.price,
      chefOverride: mi.chefOverride,
      bufferPctOverride: mi.bufferPctOverride,
    })),
  );
  const rowById = new Map(forecast.rows.map((r) => [r.id, r]));

  const mixSumWhole = forecast.totals.mixPctSum * 100;
  const mixOk = Math.abs(mixSumWhole - 100) < 0.5;
  const defaultBufferWhole = Math.round(festival.bufferPct * 100);
  const covers = Math.round(festival.expectedAttendance * festival.captureRate);

  return (
    <div>
      <div className="no-print mb-4">
        <Link href={`/festivals/${festival.id}`} className="text-sm text-blue-600 hover:underline">
          ← {festival.name}
        </Link>
      </div>

      <PageHeader
        title="Menu & Forecast"
        subtitle={`${festival.name} · ${festival.expectedAttendance.toLocaleString()} attendance × ${Math.round(festival.captureRate * 100)}% capture = ~${covers.toLocaleString()} covers`}
        action={<Badge color={STATUS_COLOR[festival.status]}>{festival.status.toLowerCase()}</Badge>}
      />

      <FestivalTabs festivalId={festival.id} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <WorksheetLegend />
        {allItems.length > 0 && !mixOk && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            ⚠ Mix adds to {num(mixSumWhole)}% — should total 100% across all tents.
          </div>
        )}
      </div>

      {festival.tents.length === 0 && (
        <Card className="p-6 text-center text-sm text-zinc-500">
          No tents yet —{" "}
          <Link href={`/festivals/${festival.id}`} className="text-blue-600 hover:underline">
            add tents on the Overview
          </Link>{" "}
          first.
        </Card>
      )}

      <div className="space-y-6">
        {festival.tents.map((tent) => {
          const tentRows = tent.menuItems.map((mi) => ({ mi, fc: rowById.get(mi.id)! }));
          const tentTotals = tentRows.reduce(
            (acc, { fc }) => {
              acc.prep += fc.finalPrepPortions;
              acc.revenue += fc.projRevenue;
              return acc;
            },
            { prep: 0, revenue: 0 },
          );
          return (
            <Card key={tent.id} className="overflow-x-auto">
              <CardHeader>{tent.name}</CardHeader>
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Mix %</th>
                    <th className="px-3 py-2 text-right font-medium">Forecast</th>
                    <th className="px-3 py-2 text-right font-medium">Override</th>
                    <th className="px-3 py-2 text-right font-medium">Buffer %</th>
                    <th className="px-3 py-2 text-right font-medium">Final Prep</th>
                    <th className="px-3 py-2 text-right font-medium">Proj. Revenue</th>
                    {canEdit && <th className="no-print"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {tent.menuItems.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 9 : 8} className="px-4 py-5 text-center text-zinc-400">
                        No items in this tent yet.
                      </td>
                    </tr>
                  )}
                  {tentRows.map(({ mi, fc }) => (
                    <tr key={mi.id} className="align-top">
                      <td className="px-4 py-2">
                        <span className="font-medium text-zinc-800">{mi.name}</span>
                        {mi.recipe ? (
                          <Link href={`/recipes/${mi.recipe.id}`} className="ml-2 text-xs text-blue-600 hover:underline no-print">
                            {mi.recipe.name}
                          </Link>
                        ) : (
                          <span className="ml-2 inline-flex items-center">
                            <Badge color="amber">no recipe linked</Badge>
                          </span>
                        )}
                        {canEdit && !mi.recipe && (
                          <details className="mt-1 no-print">
                            <summary className="cursor-pointer text-xs text-blue-600">link recipe</summary>
                            <form action={linkRecipeToMenuItem} className="mt-1 flex max-w-xs items-center gap-1">
                              <input type="hidden" name="id" value={mi.id} />
                              <input type="hidden" name="festivalId" value={festival.id} />
                              <div className="flex-1">
                                <RecipePicker recipes={recipes} />
                              </div>
                              <button className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">✓</button>
                            </form>
                          </details>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <CellForm id={mi.id} festivalId={festival.id}>
                            <input
                              name="price"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={num(mi.price)}
                              className={`w-16 ${INPUT_CELL}`}
                            />
                          </CellForm>
                        ) : (
                          <span className={CALC_CELL}>{money(mi.price)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <CellForm id={mi.id} festivalId={festival.id}>
                            <input
                              name="mixPct"
                              type="number"
                              step="0.5"
                              min="0"
                              max="100"
                              defaultValue={num(mi.mixPct * 100)}
                              className={`w-14 ${INPUT_CELL}`}
                            />
                          </CellForm>
                        ) : (
                          <span className={CALC_CELL}>{num(mi.mixPct * 100)}%</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right ${CALC_CELL}`}>{fc.forecastPortions.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <CellForm id={mi.id} festivalId={festival.id}>
                            <input
                              name="chefOverride"
                              type="number"
                              step="1"
                              min="0"
                              defaultValue={mi.chefOverride ?? ""}
                              placeholder="—"
                              className={`w-16 ${INPUT_CELL}`}
                            />
                          </CellForm>
                        ) : (
                          <span className={CALC_CELL}>{mi.chefOverride != null ? num(mi.chefOverride) : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <CellForm id={mi.id} festivalId={festival.id}>
                            <input
                              name="bufferPctOverride"
                              type="number"
                              step="1"
                              min="0"
                              max="100"
                              defaultValue={mi.bufferPctOverride != null ? num(mi.bufferPctOverride * 100) : ""}
                              placeholder={String(defaultBufferWhole)}
                              className={`w-14 ${INPUT_CELL}`}
                            />
                          </CellForm>
                        ) : (
                          <span className={CALC_CELL}>
                            {num((mi.bufferPctOverride ?? festival.bufferPct) * 100)}%
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right ${RESULT_CELL}`}>
                        {fc.finalPrepPortions.toLocaleString()}
                        {fc.overridden && (
                          <span className="ml-1 align-middle text-[10px] font-normal text-amber-600" title="Chef override in effect">
                            ●
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right ${CALC_CELL}`}>{money(fc.projRevenue)}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right no-print">
                          <form action={removeFestivalMenuItem}>
                            <input type="hidden" name="id" value={mi.id} />
                            <input type="hidden" name="festivalId" value={festival.id} />
                            <button className="text-xs text-red-500 hover:underline">remove</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {tent.menuItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-200 bg-zinc-50 text-sm">
                      <td className="px-4 py-2 font-medium text-zinc-700" colSpan={6}>
                        {tent.name} totals
                      </td>
                      <td className={`px-3 py-2 text-right ${RESULT_CELL}`}>{tentTotals.prep.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-medium ${CALC_CELL}`}>{money(tentTotals.revenue)}</td>
                      {canEdit && <td className="no-print"></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
              {canEdit && (
                <div className="border-t border-zinc-100 p-4 no-print">
                  <AddMenuItemForm festivalId={festival.id} tentId={tent.id} recipes={recipes} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {allItems.length > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
            <p className={mixOk ? "text-zinc-600" : "font-medium text-amber-700"}>
              Mix total: {num(mixSumWhole)}%{mixOk ? "" : " (should be 100%)"}
            </p>
            <p className="text-zinc-600">
              Portions (chosen): <span className={RESULT_CELL}>{forecast.totals.portions.toLocaleString()}</span>
            </p>
            <p className="text-zinc-600">
              Projected revenue: <span className={RESULT_CELL}>{money(forecast.totals.revenue)}</span>
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

// One inline single-field form: hidden ids + the input + a ✓ submit — the
// events plannedServings pattern, shared by every editable worksheet cell.
function CellForm({ id, festivalId, children }: { id: string; festivalId: string; children: React.ReactNode }) {
  return (
    <form action={updateFestivalMenuItem} className="inline-flex items-center justify-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="festivalId" value={festivalId} />
      {children}
      <button className="no-print rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">✓</button>
    </form>
  );
}
