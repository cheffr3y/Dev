import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num, componentBatchFactor } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { batchScaleFlag } from "@/lib/prep";
import { PrintButton } from "@/components/PrintButton";
import { RecipeBuildBody, buildRecipeTree, recipeTreeSelect, type RecipeTreeNode } from "@/components/RecipeBuild";

// Banquet cook packet — one printable artifact per banquet. Every dish on the
// BEO is scaled to its ordered count, with sub-recipes built inline to any
// depth. The companion to the prep sheet (which aggregates the raw pull list):
// this is what the line actually cooks from.

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default async function BanquetCookPacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [banquet, recipeRows] = await Promise.all([
    prisma.banquet.findUnique({
      where: { id },
      include: {
        venue: true,
        menuItems: {
          include: { recipe: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // Full catalog so sub-recipes can be nested to any depth, independent of the
    // menu-item include depth.
    prisma.recipe.findMany({ select: recipeTreeSelect }),
  ]);
  if (!banquet) notFound();

  const byId = buildRecipeTree(recipeRows);
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/banquets/${banquet.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to banquet
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/banquets/${banquet.id}/prep-sheet`} className="text-sm text-blue-600 hover:underline">
            Prep sheet
          </Link>
          <PrintButton label="Print cook packet" />
        </div>
      </div>

      {banquet.menuItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No dishes to build.</p>
          <p className="mt-1 text-sm text-zinc-400">Add food lines to the banquet to build the cook packet.</p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Cook Packet</span>
            <span>{banquet.venue.name}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">{banquet.name}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {fmtDate(banquet.date)}
            {banquet.timeLabel ? ` · ${banquet.timeLabel}` : ""}
            {banquet.guestCount > 0 ? ` · ${banquet.guestCount} guests` : ""}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {banquet.menuItems.length} dish{banquet.menuItems.length === 1 ? "" : "es"} · scaled to ordered counts ·
            sub-recipes built inline.
          </p>

          <div className="mt-8 space-y-10">
            {banquet.menuItems.map((mi) => (
              <DishEntry
                key={mi.id}
                recipeId={mi.recipeId}
                description={mi.description}
                orderedQty={mi.orderedQty}
                unit={mi.unit}
                byId={byId}
              />
            ))}
          </div>

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Each dish scaled to its ordered count · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}

// One BEO food line, scaled to its ordered count and built out with sub-recipes.
function DishEntry({
  recipeId,
  description,
  orderedQty,
  unit,
  byId,
}: {
  recipeId: string;
  description: string | null;
  orderedQty: number;
  unit: string;
  byId: Map<string, RecipeTreeNode>;
}) {
  const node = byId.get(recipeId);
  if (!node) return null;

  // Ordered qty → batch multiplier in the recipe's own yield unit.
  const { batches, converted } = componentBatchFactor(orderedQty, unit, node.yieldQty, node.yieldUnit);
  const flag = converted ? batchScaleFlag(orderedQty, unit, node.yieldQty, node.yieldUnit) : null;

  return (
    <article className="break-inside-avoid border-t-2 border-zinc-900 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">{node.name}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Batch ×{num(batches)} of {num(node.yieldQty)} {node.yieldUnit} base yield
          </p>
          {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
        </div>
        {/* Ordered count — what this dish is being built toward */}
        <div className="shrink-0 border-2 border-zinc-900 px-4 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Ordered</p>
          <p className="font-mono text-2xl font-bold tracking-wider text-zinc-900">
            {num(orderedQty)} {unitLabel(unit)}
          </p>
        </div>
      </div>

      {flag && !flag.clean && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ {num(flag.scale)}× base batch — verify reduction / seasoning by taste, scaling is linear only.
        </div>
      )}
      {!converted && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ Ordered units don&apos;t convert to the base yield unit — verify the batch size manually.
        </div>
      )}

      <RecipeBuildBody node={node} byId={byId} totalBatches={batches} compact={false} depth={0} stack={new Set()} />

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
        {node.name} · {node.prodCode} · ordered {num(orderedQty)} {unitLabel(unit)}
      </p>
    </article>
  );
}
