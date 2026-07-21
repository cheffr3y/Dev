import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildBanquetPlan, banquetRecipeSelect, type BanquetLine } from "@/lib/banquet";
import { dateFromParam, startOfUtcWeek, addDays, isoDate, fmtWeekRange } from "@/lib/banquet-week";
import { ShoppingListBody } from "@/components/ShoppingList";
import { PrintButton } from "@/components/PrintButton";

// Weekly shopping list — the once-a-week buy/pull printout. Every raw
// ingredient needed across every banquet in the week, summed and grouped by
// category, with sub-recipes exploded down to purchasable items. Nothing else:
// no costs, no schedules, no make sheets — those live on the week prep page.

export default async function WeekShoppingListPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  await requireUser();

  const requested = dateFromParam(date);
  if (!requested) notFound();

  const start = startOfUtcWeek(requested);
  const end = addDays(start, 7);

  const [banquets, recipeRows] = await Promise.all([
    prisma.banquet.findMany({
      where: { date: { gte: start, lt: end } },
      include: { menuItems: { include: { recipe: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    }),
    prisma.recipe.findMany({ select: banquetRecipeSelect }),
  ]);

  if (banquets.length === 0) notFound();

  const lines: BanquetLine[] = banquets.flatMap((b) =>
    b.menuItems.map((mi) => ({
      recipeId: mi.recipeId,
      recipeName: mi.recipe.name,
      orderedQty: mi.orderedQty,
      unit: mi.unit,
    })),
  );
  const list = buildBanquetPlan(lines, recipeRows).shoppingList;

  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/banquets/week/${isoDate(start)}`} className="text-sm text-blue-600 hover:underline">
          ← Back to week prep
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/banquets/week/${isoDate(start)}/packet`} className="text-sm text-blue-600 hover:underline">
            Cook packet
          </Link>
          <PrintButton label="Print shopping list" />
        </div>
      </div>

      {list.itemCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No ingredients to list.</p>
          <p className="mt-1 text-sm text-zinc-400">Add food lines to this week&apos;s banquets to build the list.</p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Shopping List</span>
            <span>Week of {fmtWeekRange(start)}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">Weekly Shopping</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {list.itemCount} ingredient{list.itemCount === 1 ? "" : "s"} across {banquets.length} event
            {banquets.length === 1 ? "" : "s"} · sub-recipes broken down to raw items.
          </p>

          <ShoppingListBody list={list} />

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Quantities summed across the whole week · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}
