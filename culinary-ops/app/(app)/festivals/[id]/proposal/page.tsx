import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildForecast } from "@/lib/festival";
import { buildFestivalAccounting } from "@/lib/festival-accounting";
import { banquetRecipeSelect, buildBanquetPlan, type BanquetLine } from "@/lib/banquet";
import { money, num, priceGapNames } from "@/lib/costing";
import { Badge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { STATUS_COLOR, statusLabel } from "@/lib/event-status";
import { FestivalTabs } from "../FestivalTabs";

export default async function FestivalProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const festival = await prisma.festival.findUnique({
    where: { id },
    include: {
      venue: { select: { name: true } },
      tents: {
        orderBy: { sortOrder: "asc" },
        include: {
          menuItems: {
            include: { recipe: { select: { id: true, name: true, yieldUnit: true } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  if (!festival) notFound();

  const menuItems = festival.tents.flatMap((tent) => tent.menuItems);
  const linked = menuItems.filter((item) => item.recipe != null);
  const recipes = linked.length
    ? await prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true } })
    : [];
  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    menuItems.map((item) => ({
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
  const accounting = buildFestivalAccounting(forecast.totals.revenue, plan.totalCost, {
    laborHours: festival.laborHours,
    laborRate: festival.laborRate,
    boothFee: festival.boothFee,
    equipmentCost: festival.equipmentCost,
    disposablesCost: festival.disposablesCost,
    transportCost: festival.transportCost,
    otherCost: festival.otherCost,
    salesFeePct: festival.salesFeePct,
    targetMarginPct: festival.targetMarginPct,
  });

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

  const projectedCovers = Math.round(festival.expectedAttendance * festival.captureRate);
  const avgCheck = projectedCovers > 0 ? forecast.totals.revenue / projectedCovers : null;
  const targetAvgCheck = projectedCovers > 0 && accounting.targetRevenue != null ? accounting.targetRevenue / projectedCovers : null;
  const margin = accounting.netMarginPct;
  const meetsTarget = margin != null && margin >= festival.targetMarginPct;
  const unlinkedCount = menuItems.length - linked.length;
  const hasCostRisk = unlinkedCount > 0 || priceGaps.unpriced.length > 0 || priceGaps.stale.length > 0;
  const approvalReady = menuItems.length > 0 && !hasCostRisk;
  const preparedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="proposal-print">
      <style>{`@media print { @page { size: letter portrait; margin: 0.45in; } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href={`/festivals/${festival.id}/accounting`} className="text-sm text-blue-600 hover:underline">
          ← Accounting
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>

      <div className="no-print">
        <FestivalTabs festivalId={festival.id} />
      </div>

      <article className="mx-auto max-w-5xl bg-white print:max-w-none">
        <header className="border-b-2 border-ink pb-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Festival menu proposal</p>
              <h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-ink">{festival.name}</h1>
              <p className="mt-3 text-sm text-zinc-600">
                {festival.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                {festival.venue ? ` · ${festival.venue.name}` : ""}
              </p>
            </div>
            <div className="text-right">
              <Badge color={STATUS_COLOR[festival.status]}>{statusLabel(festival.status)}</Badge>
              <p className="mt-3 text-xs text-zinc-500">Prepared {preparedOn}</p>
              <p className="text-xs text-zinc-500">Prepared by {user.name}</p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ProposalMetric label="Projected revenue" value={money(forecast.totals.revenue)} />
          <ProposalMetric label="All-in cost" value={money(accounting.totalCost)} />
          <ProposalMetric label="Projected profit" value={money(accounting.projectedProfit)} tone={accounting.projectedProfit >= 0 ? "good" : "bad"} />
          <ProposalMetric label="Net margin" value={margin == null ? "—" : `${(margin * 100).toFixed(1)}%`} tone={meetsTarget ? "good" : "warn"} />
        </section>

        <section className={`mt-4 rounded-lg border px-5 py-4 ${approvalReady && meetsTarget ? "border-emerald-600/30 bg-pale-sage" : "border-amber-300 bg-amber-50"}`}>
          <p className="font-semibold text-ink">
            {menuItems.length === 0
              ? "Proposal incomplete: add the proposed menu."
              : hasCostRisk
                ? "Proposal incomplete: finish the cost review before approval."
                : meetsTarget
                  ? "Recommendation: proceed at the proposed pricing."
                  : "Recommendation: review pricing or costs before approval."}
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            {menuItems.length === 0
              ? "Menu items, selling prices, and forecast quantities are required before this proposal can be evaluated."
              : hasCostRisk
                ? "One or more menu items or ingredient prices are incomplete; projected profit may be overstated. See Cost confidence below."
                : accounting.targetRevenue == null
              ? "The selected sales-fee rate and target margin cannot be achieved together."
              : meetsTarget
                ? `The forecast exceeds the ${(festival.targetMarginPct * 100).toFixed(0)}% net-margin target.`
                : `${money(accounting.revenueGap)} additional revenue is needed to reach the ${(festival.targetMarginPct * 100).toFixed(0)}% target${accounting.priceMultiplier != null && accounting.priceMultiplier > 1 ? `—equivalent to an average ${((accounting.priceMultiplier - 1) * 100).toFixed(1)}% price lift at the same volume` : ""}.`}
          </p>
        </section>

        <section className="mt-7 break-inside-avoid">
          <SectionTitle>Planning assumptions</SectionTitle>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            <Assumption label="Expected attendance" value={festival.expectedAttendance.toLocaleString()} />
            <Assumption label="Food capture" value={`${(festival.captureRate * 100).toFixed(0)}%`} />
            <Assumption label="Projected covers" value={projectedCovers.toLocaleString()} />
            <Assumption label="Forecast portions" value={forecast.totals.portions.toLocaleString()} />
            <Assumption label="Prep buffer" value={`${(festival.bufferPct * 100).toFixed(0)}% default`} />
            <Assumption label="Average check" value={avgCheck == null ? "—" : money(avgCheck)} />
            <Assumption label="Sales fees" value={`${(festival.salesFeePct * 100).toFixed(1)}%`} />
            <Assumption label="Target net margin" value={`${(festival.targetMarginPct * 100).toFixed(0)}%`} />
          </dl>
        </section>

        <section className="mt-7">
          <SectionTitle>Proposed menu</SectionTitle>
          <div className="mt-3 space-y-5">
            {festival.tents.map((tent) => (
              <div key={tent.id} className="break-inside-avoid">
                <h3 className="mb-1 font-medium text-ink">{tent.name}</h3>
                <table className="w-full text-sm">
                  <thead className="border-y border-zinc-300 bg-zinc-50 text-left font-mono text-[10px] uppercase tracking-[0.04em] text-zinc-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Menu item</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Projected qty</th>
                      <th className="px-3 py-2 text-right font-medium">Revenue</th>
                      <th className="px-3 py-2 text-right font-medium">Food cost</th>
                      <th className="px-3 py-2 text-right font-medium">Food cost %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {tent.menuItems.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-zinc-400">No menu items proposed.</td></tr>}
                    {tent.menuItems.map((item) => {
                      const fc = forecastById.get(item.id)!;
                      const foodCost = costByMenuItemId.get(item.id);
                      const foodPct = foodCost != null && fc.projRevenue > 0 ? (foodCost / fc.projRevenue) * 100 : null;
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-medium text-zinc-800">{item.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(item.price)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(fc.chosenPortions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(fc.projRevenue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{foodCost == null ? "—" : money(foodCost)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{foodPct == null ? "—" : `${foodPct.toFixed(1)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {festival.tents.length === 0 && <p className="text-sm text-zinc-500">No menu has been proposed yet.</p>}
          </div>
        </section>

        <div className="mt-7 grid grid-cols-1 gap-7 sm:grid-cols-2">
          <section className="break-inside-avoid">
            <SectionTitle>Cost structure</SectionTitle>
            <dl className="mt-2 divide-y divide-zinc-100 text-sm">
              <FinancialRow label="Recipe food cost" value={plan.totalCost} />
              <FinancialRow label={`Labor (${num(festival.laborHours)} hrs × ${money(festival.laborRate)})`} value={accounting.laborCost} />
              <FinancialRow label="Booth / vendor fee" value={festival.boothFee} />
              <FinancialRow label="Equipment / rentals" value={festival.equipmentCost} />
              <FinancialRow label="Disposables / packaging" value={festival.disposablesCost} />
              <FinancialRow label="Transport / fuel" value={festival.transportCost} />
              <FinancialRow label="Other event costs" value={festival.otherCost} />
              <FinancialRow label="Sales / card fees" value={accounting.salesFees} />
              <FinancialRow label="Total projected cost" value={accounting.totalCost} strong />
            </dl>
          </section>

          <section className="break-inside-avoid">
            <SectionTitle>Approval thresholds</SectionTitle>
            <dl className="mt-2 divide-y divide-zinc-100 text-sm">
              <TextRow label="Break-even revenue" value={money(accounting.breakEvenRevenue)} />
              <TextRow label={`Revenue for ${(festival.targetMarginPct * 100).toFixed(0)}% margin`} value={accounting.targetRevenue == null ? "Not achievable" : money(accounting.targetRevenue)} />
              <TextRow label="Current average check" value={avgCheck == null ? "—" : money(avgCheck)} />
              <TextRow label="Target average check" value={targetAvgCheck == null ? "—" : money(targetAvgCheck)} />
              <TextRow label="Projected profit" value={money(accounting.projectedProfit)} strong />
              <TextRow label="Projected net margin" value={margin == null ? "—" : `${(margin * 100).toFixed(1)}%`} strong />
            </dl>
          </section>
        </div>

        {(festival.weatherNotes || festival.notes) && (
          <section className="mt-7 break-inside-avoid">
            <SectionTitle>Proposal notes</SectionTitle>
            <div className="mt-3 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
              {festival.weatherNotes && <Note label="Weather / demand context" text={festival.weatherNotes} />}
              {festival.notes && <Note label="Operating notes" text={festival.notes} />}
            </div>
          </section>
        )}

        <section className={`mt-7 break-inside-avoid rounded border px-4 py-3 text-xs ${hasCostRisk ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
          <p className="font-semibold">Cost confidence</p>
          {hasCostRisk ? (
            <p className="mt-1">
              Review before final approval: {unlinkedCount > 0 ? `${unlinkedCount} menu item${unlinkedCount === 1 ? "" : "s"} without a linked recipe; ` : ""}
              {priceGaps.unpriced.length > 0 ? `${priceGaps.unpriced.length} ingredient price${priceGaps.unpriced.length === 1 ? "" : "s"} missing; ` : ""}
              {priceGaps.stale.length > 0 ? `${priceGaps.stale.length} ingredient price${priceGaps.stale.length === 1 ? "" : "s"} due for review.` : ""}
            </p>
          ) : (
            <p className="mt-1">Every proposed menu item has a linked recipe and the costing check found no missing or stale ingredient prices.</p>
          )}
        </section>

        <footer className="mt-8 border-t border-zinc-300 pt-3 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
          Internal planning proposal · Recipe and sub-recipe detail intentionally omitted · Mise Culinary Operations
        </footer>
      </article>
    </div>
  );
}

function ProposalMetric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div className="rounded-lg bg-stone p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-zinc-600">{label}</p>
      <p className={`mt-2 font-display text-2xl leading-none tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="border-b border-zinc-300 pb-2 font-mono text-xs uppercase tracking-[0.12em] text-zinc-700">{children}</h2>;
}

function Assumption({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-0.5 font-medium tabular-nums text-ink">{value}</dd></div>;
}

function FinancialRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 py-2 ${strong ? "border-t border-zinc-300 font-semibold" : ""}`}><dt className="text-zinc-600">{label}</dt><dd className="tabular-nums text-ink">{money(value)}</dd></div>;
}

function TextRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 py-2 ${strong ? "font-semibold" : ""}`}><dt className="text-zinc-600">{label}</dt><dd className="text-right tabular-nums text-ink">{value}</dd></div>;
}

function Note({ label, text }: { label: string; text: string }) {
  return <div className="rounded bg-zinc-50 p-4"><p className="font-medium text-ink">{label}</p><p className="mt-1 whitespace-pre-line">{text}</p></div>;
}
