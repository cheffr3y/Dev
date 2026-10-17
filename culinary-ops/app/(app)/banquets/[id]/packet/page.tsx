import { AtelierHeader } from "@/components/AtelierHeader";
import { RecipePrintSettings } from "@/components/RecipeDossier";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num, componentBatchFactor } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { PrintButton } from "@/components/PrintButton";
import { LocalTime } from "@/components/LocalTime";
import { RecipeReferences } from "@/components/RecipeReferences";
import { buildRecipeReferences, type RecipeReferencePlan } from "@/lib/recipe-references";
import {
  RecipeBuildCard,
  buildRecipeTree,
  recipeTreeSelect,
  type RecipeTreeNode,
} from "@/components/RecipeBuild";

// Banquet cook packet — one printable artifact per banquet. Every dish on the
// BEO is scaled to its ordered count. Immediate sub-recipes stay inline;
// deeper supporting recipes are scaled and collected at the back.

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
  const references = buildRecipeReferences(
    dishes.map((d) => ({ node: d.node, totalBatches: d.batches })),
    byId,
  );

  return (
    <div className="recipe-print recipe-packet atelier-packet mx-auto max-w-[8.5in]">
      <RecipePrintSettings />
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
        <div className="recipe-packet-content">
          <div className="atelier-paper print-sheet"><AtelierHeader title={banquet.name} venue={banquet.venue.name} date={banquet.date} guests={banquet.guestCount} runTime={banquet.timeLabel} kicker="Banquet Cook Packet" /><p className="text-sm text-zinc-500">{banquet.menuItems.length} dishes · {references.size} deeper recipe references · Scaled to ordered counts.</p></div>

          <div className="recipe-packet-builds mt-8 space-y-8">
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
                references={references}
                eventLabel={`${banquet.name} · ${fmtDate(banquet.date)} · ${banquet.venue.name}${banquet.timeLabel ? ` · ${banquet.timeLabel}` : ""}${banquet.guestCount > 0 ? ` · ${banquet.guestCount} guests` : ""}`}
              />
            ))}
          </div>

          <RecipeReferences references={references} byId={byId} />

          <p className="no-print mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed <LocalTime date={new Date()} mode="date" /> · Each dish scaled to its ordered count · Mise ·
            Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}

// One BEO food line, scaled to its ordered count.
function DishEntry({ node, batches, converted, description, orderedQty, unit, byId, references, eventLabel }: {
  node: RecipeTreeNode; batches: number; converted: boolean; description: string | null;
  orderedQty: number; unit: string; byId: Map<string, RecipeTreeNode>;
  references: RecipeReferencePlan; eventLabel: string;
}) {
  return <RecipeBuildCard node={node} byId={byId} totalBatches={batches}
    compact={false} depth={0} stack={new Set()} references={references}
    context={<>
      <p className="font-medium text-[#2C3E35]">{eventLabel}</p>
      <p className="mt-1">Ordered: <span className="font-mono tabular-nums">{num(orderedQty)} {unitLabel(unit)}</span>{description ? ` · ${description}` : ""}</p>
      {!converted && <p className="recipe-scaling-warning mt-2 border-l-2 border-gold bg-[#F4F1EA] p-2 font-semibold">Ordered units don&apos;t convert to the base yield unit — verify the batch size manually.</p>}
    </>} />;
}
