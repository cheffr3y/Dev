import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildDayPlan, banquetRecipeSelect, type BanquetParty } from "@/lib/banquet";
import { Badge, Card, CardHeader, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Cross-banquet rollup for a single date. Kitchens batch by recipe and
// sub-recipe, not by event — so when several parties on the same day call for
// the same recipe (directly or nested inside a dish), this page makes it once
// and shows the per-party split so it can be portioned back out afterward.
export default async function BanquetDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  await requireUser();

  // Stored dates are UTC midnight; match the whole calendar day.
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) notFound();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [banquets, recipeRows] = await Promise.all([
    prisma.banquet.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        venue: true,
        menuItems: { include: { recipe: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true } }),
  ]);

  if (banquets.length === 0) notFound();

  const parties: BanquetParty[] = banquets.map((b) => ({
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

  const plan = buildDayPlan(parties, recipeRows);
  const sharedCount = plan.recipeRollup.filter((r) => r.splits.length > 1).length;
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/banquets" className="text-sm text-blue-600 hover:underline">
          ← Banquets
        </Link>
        <PrintButton label="Print day prep" />
      </div>

      <PageHeader
        title="Day prep"
        subtitle={`${fmtDay(start)} · ${plan.parties.length} ${plan.parties.length === 1 ? "event" : "events"}`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Events" value={plan.parties.length} />
        <StatCard label="Guests" value={plan.totalGuests} />
        <StatCard label="Shared lines" value={sharedCount} sub="made once, split per party" />
        <StatCard
          label="Est. food cost"
          value={money(plan.totalCost)}
          sub={plan.totalGuests > 0 ? `${money(plan.totalCost / plan.totalGuests)} / guest` : undefined}
        />
      </div>

      {/* The parties on this day */}
      <Card className="mt-4">
        <CardHeader>Events this day</CardHeader>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {banquets.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2">
                  <Link href={`/banquets/${b.id}`} className="font-medium text-zinc-800 hover:underline">
                    {b.name}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">
                    {b.venue.name}
                    {b.timeLabel ? ` · ${b.timeLabel}` : ""}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-zinc-600">{b.guestCount} guests</td>
                <td className="px-4 py-2 text-right no-print">
                  <LinkButton href={`/banquets/${b.id}/prep-sheet`} variant="secondary">
                    Prep sheet
                  </LinkButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recipe & sub-recipe rollup with per-party split */}
        <Card>
          <CardHeader>Make once — recipes & sub-recipes</CardHeader>
          {plan.recipeRollup.length === 0 ? (
            <p className="p-4 text-sm text-zinc-400">No food lines on this day yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Recipe</th>
                  <th className="px-4 py-2 text-right font-medium">Make</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plan.recipeRollup.map((r) => {
                  const shared = r.splits.length > 1;
                  return (
                    <tr key={r.recipeId}>
                      <td className="px-4 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/recipes/${r.recipeId}`} className="font-medium text-zinc-800 hover:underline">
                            {r.recipeName}
                          </Link>
                          {r.isSubRecipe && <Badge color="gray">sub-recipe</Badge>}
                          {shared && <Badge color="blue">shared · {r.splits.length}</Badge>}
                        </div>
                        {/* The split — divide the one batch back out per party. */}
                        {shared && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                            {r.splits.map((s) => (
                              <span key={s.partyId}>
                                {s.partyName}:{" "}
                                <span className="tabular-nums text-zinc-700">
                                  {num(s.qty)} {unitLabel(r.yieldUnit)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right align-top tabular-nums text-zinc-800">
                        {num(r.totalQty)} <span className="text-zinc-400">{unitLabel(r.yieldUnit)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Combined raw-item pull list across every event */}
        <Card>
          <CardHeader>Combined pull list — all events</CardHeader>
          {plan.shoppingList.itemCount === 0 ? (
            <p className="p-4 text-sm text-zinc-400">Add food lines to generate the pull list.</p>
          ) : (
            <div className="p-4">
              {plan.shoppingList.unscaledRecipes.length > 0 && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Couldn&apos;t scale {plan.shoppingList.unscaledRecipes.join(", ")} — ordered units don&apos;t convert to
                  the recipe yield. Those are counted as one base batch; verify by hand.
                </div>
              )}
              <div className="space-y-5">
                {plan.shoppingList.categories.map((cat) => (
                  <section key={cat.category}>
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
                {plan.shoppingList.itemCount} ingredient{plan.shoppingList.itemCount === 1 ? "" : "s"} · summed across{" "}
                {plan.parties.length} events · sub-recipes broken down to raw items.
              </p>
            </div>
          )}
        </Card>
      </div>

      <p className="mt-8 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
        Printed {printedOn} · Shared recipes made once and split per party · Mise · Culinary Ops
      </p>
    </div>
  );
}
