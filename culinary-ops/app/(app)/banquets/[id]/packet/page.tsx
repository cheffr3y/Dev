import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num, componentBatchFactor } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { PrintButton } from "@/components/PrintButton";
import { LocalTime } from "@/components/LocalTime";
import {
  RecipeBuildBody,
  SharedBuildCard,
  buildRecipeTree,
  consolidateSharedSubBuilds,
  recipeTreeSelect,
  type RecipeTreeNode,
} from "@/components/RecipeBuild";

// Banquet cook packet — one printable artifact per banquet. Every dish on the
// BEO is scaled to its ordered count, with sub-recipes built inline to any
// depth. Sub-recipes used by more than one dish are consolidated into a
// make-first Shared Builds section so the packet never prints the same build
// twice. The companion to the prep sheet (which aggregates the raw pull list):
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

  // Batch math per dish happens up front so shared sub-recipe demand can be
  // totalled across the whole packet before anything renders.
  const dishes = banquet.menuItems.flatMap((mi) => {
    const node = byId.get(mi.recipeId);
    if (!node) return [];
    const { batches, converted } = componentBatchFactor(mi.orderedQty, mi.unit, node.yieldQty, node.yieldUnit);
    return [{ menuItem: mi, node, batches, converted }];
  });
  const { shared, sharedRefs } = consolidateSharedSubBuilds(
    dishes.map((d) => ({ node: d.node, totalBatches: d.batches })),
    byId,
  );

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
            {banquet.menuItems.length} dish{banquet.menuItems.length === 1 ? "" : "es"}
            {shared.length > 0
              ? ` · ${shared.length} shared build${shared.length === 1 ? "" : "s"} made once up front`
              : ""}{" "}
            · scaled to ordered counts.
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
              <DishEntry
                key={d.menuItem.id}
                node={d.node}
                batches={d.batches}
                converted={d.converted}
                description={d.menuItem.description}
                orderedQty={d.menuItem.orderedQty}
                unit={d.menuItem.unit}
                byId={byId}
                sharedRefs={sharedRefs}
              />
            ))}
          </div>

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed <LocalTime date={new Date()} mode="date" /> · Each dish scaled to its ordered count · Mise ·
            Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}

// One BEO food line, scaled to its ordered count and built out with sub-recipes.
function DishEntry({
  node,
  batches,
  converted,
  description,
  orderedQty,
  unit,
  byId,
  sharedRefs,
}: {
  node: RecipeTreeNode;
  batches: number;
  converted: boolean;
  description: string | null;
  orderedQty: number;
  unit: string;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs: Map<string, string>;
}) {
  return (
    <article className="break-inside-avoid border-t-2 border-zinc-900 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">{node.name}</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            Yields {converted ? `${num(batches * node.yieldQty)} ${unitLabel(node.yieldUnit)}` : `${num(orderedQty)} ${unitLabel(unit)}`}
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

      {!converted && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ Ordered units don&apos;t convert to the base yield unit — verify the batch size manually.
        </div>
      )}

      <RecipeBuildBody
        node={node}
        byId={byId}
        totalBatches={batches}
        compact={false}
        depth={0}
        stack={new Set()}
        sharedRefs={sharedRefs}
      />

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
        {node.name} · {node.prodCode} · v{node.version} · ordered {num(orderedQty)} {unitLabel(unit)}
      </p>
    </article>
  );
}
