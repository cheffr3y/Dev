import { RecipePrintSettings } from "@/components/RecipeDossier";
import { BanquetSetupPacket } from "@/components/BanquetSetupSheet";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num, componentBatchFactor } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { dateFromParam, startOfUtcWeek, addDays, isoDate, fmtWeekRange, fmtShortDate } from "@/lib/banquet-week";
import { PrintButton } from "@/components/PrintButton";
import { RecipeReferences } from "@/components/RecipeReferences";
import { buildRecipeReferences, type RecipeReferencePlan } from "@/lib/recipe-references";
import {
  RecipeBuildCard,
  buildRecipeTree,
  recipeTreeSelect,
  type RecipeTreeNode,
} from "@/components/RecipeBuild";

// Weekly cook packet — the once-a-week production printout. Every dish across
// every banquet in the week, rolled up so each recipe is built ONCE at its
// week total (the kitchen preps by recipe, not by event), with the per-event
// split printed under the build so the batch can be divided afterward.
// Immediate sub-recipes stay inline. Deeper recipes are totalled once in a
// supporting reference section at the back, like the single-banquet packet.

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
      include: { venue: true, menuItems: { orderBy: { createdAt: "asc" } } },
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

  const references = buildRecipeReferences(
    dishes.map((d) => ({ node: d.node, totalBatches: d.totalBatches })),
    byId,
  );

  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="recipe-print recipe-packet mx-auto max-w-[8.5in]">
      <RecipePrintSettings />
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

      {banquets.map(banquet => <BanquetSetupPacket key={banquet.id} banquet={banquet}
        menu={banquet.menuItems.map(m => ({ id: m.id, name: byId.get(m.recipeId)?.name ?? "Unknown recipe", orderedQty: m.orderedQty, unit: m.unit }))} />)}
      {dishes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No dishes to build.</p>
          <p className="mt-1 text-sm text-zinc-400">Add food lines to this week&apos;s banquets to build the packet.</p>
        </div>
      ) : (
        <div className="recipe-packet-content">
          <div className="no-print rounded-xl border border-hairline bg-canvas p-5">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Cook Packet</span>
            <span>Week of {fmtWeekRange(start)}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">Weekly Production</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dishes.length} dish{dishes.length === 1 ? "" : "es"} across {banquets.length} event
            {banquets.length === 1 ? "" : "s"}
            {references.size > 0
              ? ` · ${references.size} deeper recipe reference${references.size === 1 ? "" : "s"} at the back`
              : ""}{" "}
            · each recipe made once at its week total.
          </p>
          </div>

          <div className="recipe-packet-builds mt-8 space-y-8">
            {dishes.map((d) => (
              <WeeklyDishEntry key={d.node.id} dish={d} byId={byId} references={references} weekLabel={fmtWeekRange(start)} />
            ))}
          </div>

          <RecipeReferences references={references} byId={byId} />

          <p className="no-print mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Each recipe scaled to its week total · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}

// One dossier per weekly recipe, retaining every event allocation.
function WeeklyDishEntry({ dish, byId, references, weekLabel }: {
  dish: WeeklyDish; byId: Map<string, RecipeTreeNode>;
  references: RecipeReferencePlan; weekLabel: string;
}) {
  const { node, totalBatches, converted, splits } = dish;
  return <RecipeBuildCard node={node} byId={byId} totalBatches={totalBatches}
    compact={false} depth={0} stack={new Set()} references={references}
    context={<>
      <p className="font-medium text-[#2C3E35]">Weekly Production · {weekLabel}</p>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        {splits.map((split) => <li key={split.key}>{fmtShortDate(split.date)} · {split.banquetName}: <span className="font-mono tabular-nums">{num(split.orderedQty)} {unitLabel(split.unit)}</span></li>)}
      </ul>
      {!converted && <p className="recipe-scaling-warning mt-2 border-l-2 border-gold bg-[#F4F1EA] p-2 font-semibold">Ordered units don&apos;t convert to the base yield unit — verify the batch size manually.</p>}
    </>} />;
}
