import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildDayPlan, banquetRecipeSelect, type BanquetParty } from "@/lib/banquet";
import type { ShoppingList } from "@/lib/shopping";
import { Badge, Card, CardHeader, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

const DAY_MS = 24 * 60 * 60 * 1000;

type BanquetForWeek = {
  id: string;
  name: string;
  date: Date;
  timeLabel: string | null;
  guestCount: number;
  venue: { name: string };
  menuItems: Array<{
    recipeId: string;
    orderedQty: number;
    unit: string;
    recipe: { name: string };
  }>;
};

type DayPlan = ReturnType<typeof buildDayPlan>;
type RecipeRollupRow = DayPlan["recipeRollup"][number];
type DaySheet = {
  key: string;
  date: Date;
  banquets: BanquetForWeek[];
  plan: DayPlan;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function dateFromParam(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return isoDate(d) === raw ? d : null;
}

function startOfUtcWeek(d: Date): Date {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function fmtLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtWeekRange(start: Date): string {
  return `${fmtShortDate(start)} - ${fmtShortDate(addDays(start, 6))}, ${start.getUTCFullYear()}`;
}

function partiesFromBanquets(banquets: BanquetForWeek[]): BanquetParty[] {
  return banquets.map((b) => ({
    id: b.id,
    name: b.name,
    guestCount: b.guestCount,
    lines: b.menuItems.map((mi) => ({
      recipeId: mi.recipeId,
      recipeName: mi.recipe.name,
      orderedQty: mi.orderedQty,
      unit: mi.unit,
    })),
  }));
}

function dailySplitsFor(recipeId: string, days: DaySheet[]) {
  return days
    .map((day) => {
      const row = day.plan.recipeRollup.find((r) => r.recipeId === recipeId);
      if (!row) return null;
      return { key: day.key, label: fmtShortDate(day.date), qty: row.totalQty, batches: row.totalBatches, unit: row.yieldUnit };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

export default async function BanquetWeekPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  await requireUser();

  const requested = dateFromParam(date);
  if (!requested) notFound();

  const start = startOfUtcWeek(requested);
  const end = addDays(start, 7);

  const [banquets, recipeRows] = await Promise.all([
    prisma.banquet.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        venue: { select: { name: true } },
        menuItems: { include: { recipe: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    }),
    prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true, prodCode: true, holdLifeDays: true } }),
  ]);

  if (banquets.length === 0) notFound();

  const recipeMeta = new Map(recipeRows.map((r) => [r.id, { prodCode: r.prodCode, holdLifeDays: r.holdLifeDays }]));
  const weeklyPlan = buildDayPlan(partiesFromBanquets(banquets), recipeRows);

  const buckets = new Map<string, BanquetForWeek[]>();
  for (const banquet of banquets) {
    const key = isoDate(banquet.date);
    buckets.set(key, [...(buckets.get(key) ?? []), banquet]);
  }

  const days: DaySheet[] = [...buckets.entries()].map(([key, dayBanquets]) => ({
    key,
    date: new Date(`${key}T00:00:00.000Z`),
    banquets: dayBanquets,
    plan: buildDayPlan(partiesFromBanquets(dayBanquets), recipeRows),
  }));

  const sharedCount = weeklyPlan.recipeRollup.filter((r) => r.splits.length > 1).length;
  const subRecipeCount = weeklyPlan.recipeRollup.filter((r) => r.isSubRecipe).length;
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href="/banquets" className="text-sm text-blue-600 hover:underline">
          Back to banquets
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/banquets/week/${isoDate(addDays(start, -7))}`} className="text-sm text-blue-600 hover:underline">
            Previous week
          </Link>
          <Link href={`/banquets/week/${isoDate(addDays(start, 7))}`} className="text-sm text-blue-600 hover:underline">
            Next week
          </Link>
          <PrintButton label="Print week prep" />
        </div>
      </div>

      <PageHeader title="Weekly banquet prep" subtitle={fmtWeekRange(start)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Events" value={banquets.length} />
        <StatCard label="Prep days" value={days.length} />
        <StatCard label="Guests" value={weeklyPlan.totalGuests} />
        <StatCard label="Make once lines" value={weeklyPlan.recipeRollup.length} sub={`${subRecipeCount} sub-recipes`} />
        <StatCard
          label="Est. food cost"
          value={money(weeklyPlan.totalCost)}
          sub={weeklyPlan.totalGuests > 0 ? `${money(weeklyPlan.totalCost / weeklyPlan.totalGuests)} / guest` : undefined}
        />
      </div>

      <Card className="mt-5">
        <CardHeader>Event schedule</CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">Day</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Venue</th>
                <th className="px-4 py-2 text-right font-medium">Guests</th>
                <th className="px-4 py-2 text-right font-medium">Dishes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {banquets.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 text-zinc-600">{fmtShortDate(b.date)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/banquets/${b.id}`} className="font-medium text-zinc-800 hover:underline">
                      {b.name}
                    </Link>
                    {b.timeLabel && <span className="ml-2 text-xs text-zinc-500">{b.timeLabel}</span>}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{b.venue.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{b.guestCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{b.menuItems.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader>Master weekly prep list</CardHeader>
        {weeklyPlan.recipeRollup.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">No food lines in this week.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Recipe</th>
                  <th className="px-4 py-2 text-right font-medium">Week total</th>
                  <th className="px-4 py-2 text-right font-medium">Divide by day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {weeklyPlan.recipeRollup.map((row) => {
                  const meta = recipeMeta.get(row.recipeId);
                  const daily = dailySplitsFor(row.recipeId, days);
                  return (
                    <tr key={row.recipeId}>
                      <td className="px-4 py-2 align-top">
                        <RecipeName row={row} />
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {row.isSubRecipe && <Badge color="gray">sub-recipe</Badge>}
                          {row.splits.length > 1 && <Badge color="blue">shared - {row.splits.length}</Badge>}
                          {meta?.holdLifeDays != null && <span className="text-xs text-zinc-500">{meta.holdLifeDays}d hold</span>}
                          {meta?.prodCode && <span className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-400">{meta.prodCode}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right align-top font-semibold tabular-nums text-zinc-900">
                        {num(row.totalQty)} <span className="font-normal text-zinc-500">{unitLabel(row.yieldUnit)}</span>
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
                          {daily.map((d) => (
                            <span key={d.key} className="tabular-nums text-zinc-700">
                              <span className="text-zinc-500">{d.label}:</span> {num(d.qty)} {unitLabel(d.unit)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sharedCount > 0 && (
          <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
            {sharedCount} line{sharedCount === 1 ? "" : "s"} appear in more than one event this week.
          </p>
        )}
      </Card>

      <IngredientPullList title="Weekly ingredient pull" list={weeklyPlan.shoppingList} className="mt-6" />

      <div className="mt-8 space-y-8">
        {days.map((day) => (
          <section key={day.key} className="break-inside-avoid">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl leading-none tracking-tight text-ink">{fmtLongDate(day.date)}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {day.banquets.length} event{day.banquets.length === 1 ? "" : "s"} - {day.plan.totalGuests} guests
                </p>
              </div>
              <LinkButton href={`/banquets/day/${day.key}`} variant="secondary" className="no-print">
                Day print view
              </LinkButton>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>Commissary make sheet</CardHeader>
                {day.plan.recipeRollup.length === 0 ? (
                  <p className="p-4 text-sm text-zinc-400">No food lines on this day.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                      <tr>
                        <th className="px-4 py-2 font-medium">Recipe</th>
                        <th className="px-4 py-2 text-right font-medium">Make</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {day.plan.recipeRollup.map((row) => (
                        <tr key={row.recipeId}>
                          <td className="px-4 py-2 align-top">
                            <RecipeName row={row} />
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {row.isSubRecipe && <Badge color="gray">sub-recipe</Badge>}
                              {row.splits.length > 1 && <Badge color="blue">split - {row.splits.length}</Badge>}
                            </div>
                            {row.splits.length > 1 && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                                {row.splits.map((split) => (
                                  <span key={split.partyId}>
                                    {split.partyName}:{" "}
                                    <span className="tabular-nums text-zinc-700">
                                      {num(split.qty)} {unitLabel(row.yieldUnit)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right align-top font-semibold tabular-nums text-zinc-900">
                            {num(row.totalQty)} <span className="font-normal text-zinc-500">{unitLabel(row.yieldUnit)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <IngredientPullList title="Day ingredient pull" list={day.plan.shoppingList} />
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
        Printed {printedOn} - Weekly rollup and daily commissary sheets - Mise - Culinary Ops
      </p>
    </div>
  );
}

function RecipeName({ row }: { row: RecipeRollupRow }) {
  return (
    <Link href={`/recipes/${row.recipeId}`} className="font-medium text-zinc-800 hover:underline">
      {row.recipeName}
    </Link>
  );
}

function IngredientPullList({ title, list, className }: { title: string; list: ShoppingList; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>{title}</CardHeader>
      {list.itemCount === 0 ? (
        <p className="p-4 text-sm text-zinc-400">No ingredients to pull.</p>
      ) : (
        <div className="p-4">
          {list.unscaledRecipes.length > 0 && (
            <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Could not scale {list.unscaledRecipes.join(", ")}. Amounts assume one base batch each; verify by hand.
            </div>
          )}
          <div className="space-y-5">
            {list.categories.map((cat) => (
              <section key={cat.category}>
                <h3 className="border-b border-zinc-200 pb-1 font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                  {cat.category}
                </h3>
                <table className="mt-1 w-full text-sm">
                  <tbody className="divide-y divide-zinc-100">
                    {cat.items.map((it) => (
                      <tr key={it.itemId}>
                        <td className="py-1.5 pr-4 text-zinc-800">{it.name}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-zinc-800">
                          {it.amounts.map((a, j) => (
                            <div key={j}>
                              {num(a.qty)} <span className="font-normal text-zinc-500">{a.unit}</span>
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
            {list.itemCount} ingredient{list.itemCount === 1 ? "" : "s"} - sub-recipes broken down to raw items.
          </p>
        </div>
      )}
    </Card>
  );
}
