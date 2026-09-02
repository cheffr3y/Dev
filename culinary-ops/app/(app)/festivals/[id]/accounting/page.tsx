import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { buildForecast } from "@/lib/festival";
import { banquetRecipeSelect, buildBanquetPlan, type BanquetLine } from "@/lib/banquet";
import { money, num, priceGapNames } from "@/lib/costing";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { PriceIntegrityNotice } from "@/components/PriceIntegrityNotice";
import { STATUS_COLOR } from "@/lib/event-status";
import { FestivalTabs } from "../FestivalTabs";
import { AccountingWorksheet } from "./AccountingWorksheet";

export default async function FestivalAccountingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const festival = await prisma.festival.findUnique({
    where: { id },
    include: {
      menuItems: {
        include: {
          tent: { select: { name: true } },
          recipe: { select: { id: true, name: true, yieldUnit: true } },
        },
        orderBy: [{ tent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      },
    },
  });
  if (!festival) notFound();

  const linked = festival.menuItems.filter((item) => item.recipe != null);
  const recipes = linked.length
    ? await prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true } })
    : [];
  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    festival.menuItems.map((item) => ({
      id: item.id,
      mixPct: item.mixPct,
      price: item.price,
      chefOverride: item.chefOverride,
      bufferPctOverride: item.bufferPctOverride,
    })),
  );
  const forecastById = new Map(forecast.rows.map((row) => [row.id, row]));
  const lines: BanquetLine[] = linked.map((item) => ({
    recipeId: item.recipeId!,
    recipeName: item.recipe!.name,
    orderedQty: forecastById.get(item.id)?.finalPrepPortions ?? 0,
    unit: item.recipe!.yieldUnit,
  }));
  const plan = buildBanquetPlan(lines, recipes);
  const costByMenuItemId = new Map(linked.map((item, index) => [item.id, plan.lineCosts[index]?.cost ?? 0]));

  const nameByItemId = new Map<string, string>();
  for (const recipe of recipes) for (const ri of recipe.items) nameByItemId.set(ri.item.id, ri.item.name);
  const priceGaps = priceGapNames(
    recipes.map((recipe) => ({
      id: recipe.id,
      items: recipe.items.map((ri) => ({
        itemId: ri.item.id,
        unitCost: ri.item.unitCost,
        priceUpdatedAt: ri.item.priceUpdatedAt,
      })),
      components: recipe.components,
    })),
    linked.map((item) => item.recipeId!),
    nameByItemId,
  );

  return (
    <div>
      <div className="no-print mb-4">
        <Link href={`/festivals/${festival.id}`} className="text-sm text-blue-600 hover:underline">
          ← {festival.name}
        </Link>
      </div>
      <PageHeader
        title="Accounting"
        subtitle={`${festival.name} · live proposal cost-out from menu, recipes & sub-recipes`}
        action={
          <div className="flex items-center gap-2">
            <Badge color={STATUS_COLOR[festival.status]}>{festival.status.toLowerCase()}</Badge>
            <LinkButton href={`/festivals/${festival.id}/proposal`} variant="gold">
              View proposal →
            </LinkButton>
          </div>
        }
      />
      <FestivalTabs festivalId={festival.id} />

      <PriceIntegrityNotice unpriced={priceGaps.unpriced} stale={priceGaps.stale} className="mb-4" />
      {festival.menuItems.some((item) => !item.recipe) && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ Food cost is incomplete: {festival.menuItems.filter((item) => !item.recipe).map((item) => item.name).join(", ")} has no linked recipe.
        </div>
      )}

      <AccountingWorksheet
        festivalId={festival.id}
        revenue={forecast.totals.revenue}
        foodCost={plan.totalCost}
        canEdit={canEdit}
        initial={{
          laborHours: festival.laborHours,
          laborRate: festival.laborRate,
          boothFee: festival.boothFee,
          equipmentCost: festival.equipmentCost,
          disposablesCost: festival.disposablesCost,
          transportCost: festival.transportCost,
          otherCost: festival.otherCost,
          salesFeePct: festival.salesFeePct,
          targetMarginPct: festival.targetMarginPct,
        }}
      />

      <Card className="mt-6">
        <CardHeader>Menu contribution — recipe and sub-recipe cost included</CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">Tent / item</th>
                <th className="px-3 py-2 text-right font-medium">Sell qty</th>
                <th className="px-3 py-2 text-right font-medium">Prep qty</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">Food cost</th>
                <th className="px-3 py-2 text-right font-medium">Cost / sold</th>
                <th className="px-3 py-2 text-right font-medium">Food cost %</th>
                <th className="px-4 py-2 text-right font-medium">Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {festival.menuItems.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400">Add menu items to start costing the proposal.</td></tr>
              )}
              {festival.menuItems.map((item) => {
                const fc = forecastById.get(item.id)!;
                const foodCost = costByMenuItemId.get(item.id);
                const perSold = foodCost != null && fc.chosenPortions > 0 ? foodCost / fc.chosenPortions : null;
                const foodPct = foodCost != null && fc.projRevenue > 0 ? (foodCost / fc.projRevenue) * 100 : null;
                const contribution = foodCost == null ? null : fc.projRevenue - foodCost;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-zinc-800">{item.name}</div>
                      <div className="text-xs text-zinc-500">
                        {item.tent.name} · {item.recipe ? item.recipe.name : "no recipe linked"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(fc.chosenPortions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(fc.finalPrepPortions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(item.price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(fc.projRevenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{foodCost == null ? "—" : money(foodCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{perSold == null ? "—" : money(perSold)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{foodPct == null ? "—" : `${foodPct.toFixed(1)}%`}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{contribution == null ? "—" : money(contribution)}</td>
                  </tr>
                );
              })}
            </tbody>
            {festival.menuItems.length > 0 && (
              <tfoot className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
                <tr>
                  <td className="px-4 py-3">Menu total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{num(forecast.totals.portions)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right tabular-nums">{money(forecast.totals.revenue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(plan.totalCost)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right tabular-nums">
                    {forecast.totals.revenue > 0 ? `${((plan.totalCost / forecast.totals.revenue) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(forecast.totals.revenue - plan.totalCost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
          Food cost uses final prep quantity, including buffer. Revenue uses forecast sell quantity. Shared event expenses are summarized above, not allocated to individual menu items.
        </p>
      </Card>
    </div>
  );
}
