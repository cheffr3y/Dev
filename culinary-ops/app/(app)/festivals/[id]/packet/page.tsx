import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { buildRecipeTree, recipeTreeSelect } from "@/components/RecipeBuild";
import { RecipePrintSettings } from "@/components/RecipeDossier";
import { requireUser } from "@/lib/auth/session";
import { banquetRecipeSelect } from "@/lib/banquets/banquet";
import { prisma } from "@/lib/db/prisma";
import { buildFestivalProposal } from "@/lib/menus/festival-proposal";
import { allergenLabels, effectiveAllergens } from "@/lib/recipes/allergens";
import { money, num, pct } from "@/lib/recipes/costing";
import { FestivalRecipeGuide } from "../FestivalRecipeGuide";
import { FestivalTabs } from "../FestivalTabs";
import styles from "./packet.module.css";

const packetRecipeSelect = {
  ...recipeTreeSelect,
  items: {
    ...recipeTreeSelect.items,
    select: {
      ...recipeTreeSelect.items.select,
      item: {
        select: { ...banquetRecipeSelect.items.select.item.select, ...recipeTreeSelect.items.select.item.select },
      },
    },
  },
} as const;

export default async function FestivalPacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const festival = await prisma.festival.findUnique({
    where: { id },
    include: {
      venue: { select: { name: true } },
      menuItems: {
        orderBy: [{ tent: { sortOrder: "asc" } }, { sortOrder: "asc" }, { id: "asc" }],
        include: {
          tent: { select: { name: true } },
          recipe: { select: { id: true, name: true, yieldUnit: true } },
        },
      },
    },
  });
  if (!festival) notFound();

  const items = festival.menuItems;
  const recipes = items.some((item) => item.recipe)
    ? await prisma.recipe.findMany({ select: packetRecipeSelect })
    : [];
  const byId = buildRecipeTree(recipes);
  const { forecast, forecastById, plan, costByMenuItemId, accounting, priceGaps, unlinkedCount } =
    buildFestivalProposal(festival, items, recipes);
  const { shoppingList } = plan;
  const date = festival.date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const eventLabel = `${festival.name} · ${date}`;
  const costIssues = [
    unlinkedCount > 0 && `${unlinkedCount} menu item${unlinkedCount === 1 ? "" : "s"} without a recipe`,
    priceGaps.unpriced.length > 0 && `${priceGaps.unpriced.length} missing ingredient price${priceGaps.unpriced.length === 1 ? "" : "s"}`,
    priceGaps.stale.length > 0 && `${priceGaps.stale.length} ingredient price${priceGaps.stale.length === 1 ? "" : "s"} due for review`,
    (shoppingList.unscaledRecipes.length > 0 ||
      items.some((item) => item.recipeId && (byId.get(item.recipeId)?.yieldQty ?? 0) <= 0)) &&
      "recipe quantities that need a manual yield check",
  ].filter(Boolean);

  return (
    <div className={`recipe-print recipe-packet mx-auto max-w-[8.5in] ${styles.packet}`}>
      <RecipePrintSettings />
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href={`/festivals/${id}`} className="text-sm text-blue-600 hover:underline">← {festival.name}</Link>
        <PrintButton label="Print packet / Save PDF" />
      </div>
      <FestivalTabs festivalId={id} />

      <section className={styles.sheet} aria-labelledby="festival-packet-title">
        <header className="border-b-2 border-ink pb-3">
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">Festival packet · Internal planning</p>
          <h1 id="festival-packet-title" className="mt-1 font-display text-4xl leading-tight text-ink">{festival.name}</h1>
          <p className="mt-1 text-sm text-zinc-700">{date}{festival.venue && ` · ${festival.venue.name}`}</p>
        </header>
        <h2 className={styles.sectionTitle}>Proposed menu &amp; costing</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <Metric label="Projected revenue" value={money(forecast.totals.revenue)} />
          <Metric label="All-in cost" value={money(accounting.totalCost)} />
          <Metric label="Projected profit" value={money(accounting.projectedProfit)} />
          <Metric label="Net margin" value={pct(accounting.netMarginPct == null ? null : accounting.netMarginPct * 100)}
            detail={`${pct(festival.targetMarginPct * 100)} target`} />
        </dl>
        <p className="mt-2 text-xs text-zinc-700">
          {num(festival.expectedAttendance)} expected attendance · {pct(festival.captureRate * 100)} capture · {pct(festival.bufferPct * 100)} default prep buffer
        </p>
        {costIssues.length > 0 && (
          <p className="mt-3 border-l-2 border-amber-600 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
            <strong>Cost review needed:</strong> {costIssues.join("; ")}. Projected profit may be overstated.
          </p>
        )}
        {items.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="Proposed menu costs">
              <thead>
                <tr>
                  <th scope="col">Food item / tent</th>
                  <th scope="col" className={styles.number}>Price</th>
                  <th scope="col" className={styles.number}>Sales qty</th>
                  <th scope="col" className={styles.number}>Prep qty</th>
                  <th scope="col" className={styles.number}>Revenue</th>
                  <th scope="col" className={styles.number}>Food cost</th>
                  <th scope="col" className={styles.number}>Food margin</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const row = forecastById.get(item.id)!;
                  const cost = costByMenuItemId.get(item.id);
                  return (
                    <tr key={item.id}>
                      <th scope="row">
                        {item.name}<span className="block text-xs font-normal text-zinc-600">{item.tent.name}</span>
                      </th>
                      <td className={styles.number}>{money(item.price, 5)}</td>
                      <td className={styles.number}>{num(row.chosenPortions)}</td>
                      <td className={styles.number}>{num(row.finalPrepPortions)}</td>
                      <td className={styles.number}>{money(row.projRevenue)}</td>
                      <td className={styles.number}>{money(cost)}</td>
                      <td className={styles.number}>{pct(cost != null && row.projRevenue > 0 ? (1 - cost / row.projRevenue) * 100 : null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-zinc-600">No food items proposed yet. Add items in Menu &amp; Forecast.</p>}
        <p className="mt-3 text-xs text-zinc-700">
          Food margin is revenue less the food cost of the full prep quantity, as a share of revenue.
          All-in cost includes {money(plan.totalCost)} recipe food cost, {money(accounting.fixedCosts)} labor and event expenses, and {money(accounting.salesFees)} sales fees.
        </p>
      </section>

      <section className={`${styles.sheet} ${styles.nextSheet}`} aria-labelledby="festival-packet-allergens">
        <SectionHeader id="festival-packet-allergens" title="Menu allergen summary" eventLabel={eventLabel} />
        <p className="text-sm text-zinc-700">
          Based on recorded tags for linked recipes, ingredients, and sub-recipes. Verify product labels and cross-contact before sharing with guests.
        </p>
        {items.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Food item</th><th scope="col">Tent</th><th scope="col">Recorded allergens and dietary tags</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name}</th>
                    <td>{item.tent.name}</td>
                    <td>
                      {item.recipeId && byId.has(item.recipeId)
                        ? allergenLabels(effectiveAllergens(item.recipeId, byId)) || "None recorded — verify"
                        : "No recipe linked — verify"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-zinc-600">No food items to review.</p>}
      </section>

      <section className={styles.nextSheet} aria-labelledby="festival-packet-recipes">
        <SectionHeader id="festival-packet-recipes" title="Scaled recipes" eventLabel={eventLabel} />
        <FestivalRecipeGuide festival={festival} byId={byId} rowById={forecastById} inPacket />
      </section>

      {(shoppingList.itemCount > 0 || festival.weatherNotes || festival.notes) && (
        <section className={`${styles.sheet} ${styles.nextSheet}`} aria-labelledby="festival-packet-prep">
          <SectionHeader id="festival-packet-prep" title="Prep pull list & notes" eventLabel={eventLabel} />
          {shoppingList.itemCount > 0 && (
            <>
              <p className="text-sm text-zinc-700">Combined ingredient quantities for the final prep counts, before inventory and purchase pack rounding.</p>
              {shoppingList.unscaledRecipes.length > 0 && (
                <p className="mt-2 text-sm font-semibold">Verify scaling for: {shoppingList.unscaledRecipes.join(", ")}.</p>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th scope="col">Ingredient</th><th scope="col" className={styles.number}>Prep quantity</th></tr></thead>
                  {shoppingList.categories.map((category) => (
                    <tbody key={category.category}>
                      <tr><th scope="rowgroup" colSpan={2} className="bg-zinc-100">{category.category}</th></tr>
                      {category.items.map((item) => (
                        <tr key={item.itemId}>
                          <th scope="row" className="font-normal">{item.name}</th>
                          <td className={styles.number}>{item.amounts.map((amount) => `${num(amount.qty)} ${amount.unit}`).join(" + ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </>
          )}
          {festival.weatherNotes && <p className="mt-3 whitespace-pre-line text-sm"><strong>Weather:</strong> {festival.weatherNotes}</p>}
          {festival.notes && <p className="mt-3 whitespace-pre-line text-sm"><strong>Operating notes:</strong> {festival.notes}</p>}
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-zinc-300 px-2 py-1.5">
      <dt className="text-xs text-zinc-700">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
      {detail && <dd className="text-xs text-zinc-600">{detail}</dd>}
    </div>
  );
}

function SectionHeader({ id, title, eventLabel }: { id: string; title: string; eventLabel: string }) {
  return (
    <header className="mb-3 border-b-2 border-ink pb-2 print:break-after-avoid">
      <p className="text-xs text-zinc-600">{eventLabel}</p>
      <h2 id={id} className="mt-1 font-display text-2xl text-ink">{title}</h2>
    </header>
  );
}
