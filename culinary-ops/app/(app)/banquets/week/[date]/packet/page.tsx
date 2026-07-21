import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num, componentBatchFactor } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { dateFromParam, startOfUtcWeek, addDays, isoDate, fmtWeekRange, fmtShortDate } from "@/lib/banquet-week";
import { PrintButton } from "@/components/PrintButton";
import {
  RecipeBuildBody,
  SharedBuildCard,
  buildRecipeTree,
  consolidateSharedSubBuilds,
  recipeTreeSelect,
  type RecipeTreeNode,
} from "@/components/RecipeBuild";

// Weekly cook packet — the once-a-week production printout. Every dish across
// every banquet in the week, rolled up so each recipe is built ONCE at its
// week total (the kitchen preps by recipe, not by event), with the per-event
// split printed under the build so the batch can be divided afterward.
// Sub-recipes used by more than one dish consolidate into a make-first Shared
// Builds section, exactly like the single-banquet packet.

// One rolled-up dish: a recipe's total demand across the week, plus where each
// piece of it goes.
type WeeklyDish = {
  node: RecipeTreeNode;
  totalBatches: number;
  converted: boolean; // false when any event's ordered unit didn't convert
  splits: Array<{ key: string; banquetName: string; date: Date; orderedQty: number; unit: string }>;
};

export default async function WeekCookPacketPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  await requireUser();

  const requested = dateFromParam(date);
  if (!requested) notFound();

  const start = startOfUtcWeek(requested);
  const end = addDays(start, 7);

  const [banquets, recipeRows] = await Promise.all([
    prisma.banquet.findMany({
      where: { date: { gte: start, lt: end } },
      include: { menuItems: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    }),
    // Full catalog so sub-recipes can be nested to any depth.
    prisma.recipe.findMany({ select: recipeTreeSelect }),
  ]);

  if (banquets.length === 0) notFound();

  const byId = buildRecipeTree(recipeRows);

  // Roll every BEO line up by recipe across the whole week.
  const dishById = new Map<string, WeeklyDish>();
  for (const b of banquets) {
    for (const mi of b.menuItems) {
      const node = byId.get(mi.recipeId);
      if (!node) continue;
      const { batches, converted } = componentBatchFactor(mi.orderedQty, mi.unit, node.yieldQty, node.yieldUnit);
      let dish = dishById.get(mi.recipeId);
      if (!dish) {
        dish = { node, totalBatches: 0, converted: true, splits: [] };
        dishById.set(mi.recipeId, dish);
      }
      dish.totalBatches += batches;
      dish.converted = dish.converted && converted;
      dish.splits.push({ key: mi.id, banquetName: b.name, date: b.date, orderedQty: mi.orderedQty, unit: mi.unit });
    }
  }
  // Dishes shared by more than one event first, then by name — same order as
  // the week prep master list.
  const dishes = [...dishById.values()].sort(
    (a, b) => Number(b.splits.length > 1) - Number(a.splits.length > 1) || a.node.name.localeCompare(b.node.name),
  );

  const { shared, sharedRefs } = consolidateSharedSubBuilds(
    dishes.map((d) => ({ node: d.node, totalBatches: d.totalBatches })),
    byId,
  );

  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/banquets/week/${isoDate(start)}`} className="text-sm text-blue-600 hover:underline">
          ← Back to week prep
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/banquets/week/${isoDate(start)}/shopping-list`} className="text-sm text-blue-600 hover:underline">
            Shopping list
          </Link>
          <PrintButton label="Print cook packet" />
        </div>
      </div>

      {dishes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No dishes to build.</p>
          <p className="mt-1 text-sm text-zinc-400">Add food lines to this week&apos;s banquets to build the packet.</p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Cook Packet</span>
            <span>Week of {fmtWeekRange(start)}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">Weekly Production</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dishes.length} dish{dishes.length === 1 ? "" : "es"} across {banquets.length} event
            {banquets.length === 1 ? "" : "s"}
            {shared.length > 0
              ? ` · ${shared.length} shared build${shared.length === 1 ? "" : "s"} made once up front`
              : ""}{" "}
            · each recipe made once at its week total.
          </p>

          {shared.length > 0 && (
            <section className="mt-8">
              <div className="border-b-2 border-zinc-900 pb-1.5">
                <h2 className="font-display text-2xl font-medium tracking-tight text-zinc-900">
                  Shared Builds — Make These First
                </h2>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Each build below feeds more than one dish. Make the full amount once; the dishes pull from it.
              </p>
              <div className="mt-6 space-y-10">
                {shared.map((b) => (
                  <SharedBuildCard key={b.node.id} build={b} byId={byId} sharedRefs={sharedRefs} />
                ))}
              </div>
            </section>
          )}

          {shared.length > 0 && (
            <div className="mt-12 border-b-2 border-zinc-900 pb-1.5">
              <h2 className="font-display text-2xl font-medium tracking-tight text-zinc-900">Dishes</h2>
            </div>
          )}
          <div className="mt-8 space-y-10">
            {dishes.map((d) => (
              <WeeklyDishEntry key={d.node.id} dish={d} byId={byId} sharedRefs={sharedRefs} />
            ))}
          </div>

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Each recipe scaled to its week total · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}

// One rolled-up dish: the recipe built once at its week total, with the
// per-event split so the batch can be divided after it's made.
function WeeklyDishEntry({
  dish,
  byId,
  sharedRefs,
}: {
  dish: WeeklyDish;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs: Map<string, string>;
}) {
  const { node, totalBatches, converted, splits } = dish;
  return (
    <article className="break-inside-avoid border-t-2 border-zinc-900 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">{node.name}</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            Yields {num(totalBatches * node.yieldQty)} {unitLabel(node.yieldUnit)}
          </p>
        </div>
        {/* Week total — what this recipe is being built toward */}
        <div className="shrink-0 border-2 border-zinc-900 px-4 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Week total</p>
          <p className="font-mono text-2xl font-bold tracking-wider text-zinc-900">
            {num(totalBatches * node.yieldQty)} {unitLabel(node.yieldUnit)}
          </p>
        </div>
      </div>

      {/* Where the batch goes once it's made */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        {splits.map((s) => (
          <span key={s.key}>
            {fmtShortDate(s.date)} · {s.banquetName}:{" "}
            <span className="font-semibold tabular-nums text-zinc-900">
              {num(s.orderedQty)} {unitLabel(s.unit)}
            </span>
          </span>
        ))}
      </div>

      {!converted && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ Ordered units don&apos;t convert to the base yield unit — verify the batch size manually.
        </div>
      )}

      <RecipeBuildBody
        node={node}
        byId={byId}
        totalBatches={totalBatches}
        compact={false}
        depth={0}
        stack={new Set()}
        sharedRefs={sharedRefs}
      />

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
        {node.name} · {node.prodCode} · v{node.version} · week total {num(totalBatches * node.yieldQty)}{" "}
        {unitLabel(node.yieldUnit)}
      </p>
    </article>
  );
}
