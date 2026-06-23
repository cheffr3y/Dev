import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { convertQty, unitLabel } from "@/lib/units";
import { batchScaleFlag } from "@/lib/prep";
import { PrintButton } from "@/components/PrintButton";
import { RecipeBuildBody, buildRecipeTree, recipeTreeSelect, type RecipeTreeNode } from "@/components/RecipeBuild";

// Cook packet — one printable artifact per prep order. Each recipe is scaled to
// the (combined) requested qty and lot-stamped. Cooks hand-copy the lot, made
// date and use-by onto container labels; the system prints no label artifact.
// The scaled recipe + nested sub-builds are rendered by the shared RecipeBuild.

// forDate-derived dates are UTC-midnight; format in UTC so the day is stable.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function CookPacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [order, allRecipes] = await Promise.all([
    prisma.prepOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            // Scalars only — the scaled ingredients, method and sub-builds are
            // rendered from the full catalog tree (allRecipes) below.
            recipe: {
              select: { id: true, name: true, prodCode: true, yieldQty: true, yieldUnit: true, holdLifeDays: true },
            },
            destinationVenue: { select: { name: true, code: true } },
          },
          orderBy: [{ recipe: { name: "asc" } }, { destinationVenue: { name: "asc" } }],
        },
      },
    }),
    // Full catalog so sub-recipes can be nested to any depth (their own
    // ingredients, method and sub-builds), independent of Prisma include depth.
    prisma.recipe.findMany({ select: recipeTreeSelect }),
  ]);
  if (!order) notFound();

  // Recipe tree keyed by id, for recursive sub-build rendering.
  const byId = buildRecipeTree(allRecipes);

  // Only printed lines (those with a lot) belong on the packet.
  const printed = order.lines.filter((l) => l.lot);

  // Group into batches by lot — one lot = one physical batch. Splits across
  // venues share a lot (one entry); a recipe printed twice has two lots (two
  // entries).
  const groups = new Map<string, typeof printed>();
  for (const l of printed) {
    const arr = groups.get(l.lot!) ?? [];
    arr.push(l);
    groups.set(l.lot!, arr);
  }

  const madeOn = fmtDate(order.forDate);
  const printedOn = fmtDate(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href={`/prep-orders/${order.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to order
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/prep-orders/${order.id}/shopping-list`} className="text-sm text-blue-600 hover:underline">
            Shopping list
          </Link>
          <PrintButton label="Print cook packet" />
        </div>
      </div>

      {printed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No printed lines yet.</p>
          <p className="mt-1 text-sm text-zinc-400">Generate the cook packet from the order to assign lots.</p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Cook Packet</span>
            <span>Production {madeOn}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">Commissary Prep</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {groups.size} batch{groups.size === 1 ? "" : "es"} · hand-copy each lot onto the container labels.
          </p>

          <div className="mt-8 space-y-10">
            {[...groups.values()].map((lines) => (
              <PacketEntry key={lines[0].lot} lines={lines} madeOn={madeOn} forDate={order.forDate} byId={byId} />
            ))}
          </div>

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Lots assigned at first print and frozen · Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}

type PacketLine = {
  id: string;
  lot: string | null;
  recipeVersion: number;
  requestedQty: number;
  requestedUnit: string;
  destinationVenue: { name: string; code: string };
  recipe: {
    id: string;
    name: string;
    prodCode: string;
    yieldQty: number;
    yieldUnit: string;
    holdLifeDays: number | null;
  };
};

function PacketEntry({
  lines,
  madeOn,
  forDate,
  byId,
}: {
  lines: PacketLine[];
  madeOn: string;
  forDate: Date;
  byId: Map<string, RecipeTreeNode>;
}) {
  const recipe = lines[0].recipe;
  const node = byId.get(recipe.id);
  const lot = lines[0].lot ?? "—";
  const version = lines[0].recipeVersion;

  // Combine requested quantity across destinations into the recipe yield unit.
  let combinedInYield = 0;
  let convertible = true;
  for (const l of lines) {
    const c = convertQty(l.requestedQty, l.requestedUnit, recipe.yieldUnit);
    if (c == null) convertible = false;
    else combinedInYield += c;
  }
  const scale = convertible && recipe.yieldQty > 0 ? combinedInYield / recipe.yieldQty : 1;
  const flag = convertible
    ? batchScaleFlag(combinedInYield, recipe.yieldUnit, recipe.yieldQty, recipe.yieldUnit)
    : null;

  const useBy =
    recipe.holdLifeDays != null
      ? new Date(forDate.getTime() + recipe.holdLifeDays * 86400000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : null;
  const split = lines.length > 1;

  return (
    <article className="break-inside-avoid border-t-2 border-zinc-900 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">{recipe.name}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Batch ×{num(scale)} of {num(recipe.yieldQty)} {recipe.yieldUnit} base yield
          </p>
        </div>
        {/* Lot — large + clear for hand transcription onto labels */}
        <div className="shrink-0 border-2 border-zinc-900 px-4 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Lot</p>
          <p className="font-mono text-2xl font-bold tracking-wider text-zinc-900">{lot}</p>
        </div>
      </div>

      {/* Quantity + split allocation */}
      {split ? (
        <div className="mt-3 border-2 border-zinc-900 text-sm">
          <div className="bg-zinc-900 px-4 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              Split Batch — Portion before pickup
            </span>
          </div>
          <div className="divide-y divide-zinc-200 bg-white">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-medium text-zinc-900">{l.destinationVenue.name}</span>
                <span className="font-bold tabular-nums text-zinc-900">
                  {num(l.requestedQty)} {unitLabel(l.requestedUnit)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t-2 border-zinc-900 bg-zinc-50 px-4 py-2">
            <span className="font-semibold text-zinc-500">Combined total</span>
            <span className="font-bold tabular-nums text-zinc-900">
              {convertible ? `${num(combinedInYield)} ${unitLabel(recipe.yieldUnit)}` : "(mixed units)"}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-y border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-zinc-900">
            Total {convertible ? `${num(combinedInYield)} ${unitLabel(recipe.yieldUnit)}` : "(mixed units)"}
          </span>
          <span className="text-zinc-600">
            {" "}
            → {lines[0].destinationVenue.name} ({num(lines[0].requestedQty)} {unitLabel(lines[0].requestedUnit)})
          </span>
        </div>
      )}

      {/* Scaling guard */}
      {flag && !flag.clean && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ {num(flag.scale)}× base batch — verify reduction / seasoning by taste, scaling is linear only.
        </div>
      )}
      {!convertible && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ Requested units don&apos;t convert to the base yield unit — verify the batch size manually.
        </div>
      )}

      {/* Label transcription line */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <LabelCell label="Made date" value={madeOn} />
        <LabelCell label="Use-by" value={useBy ?? "—"} />
        <LabelCell label="Prod. code" value={recipe.prodCode} />
      </div>

      {/* Scaled ingredients, method, allergens & nested sub-builds */}
      {node && <RecipeBuildBody node={node} byId={byId} totalBatches={scale} compact={false} depth={0} stack={new Set()} />}

      {/* Footer stamp — self-documenting for food-safety / consistency */}
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
        {recipe.name} · {recipe.prodCode} · v{version} · lot {lot} · printed {madeOn}
      </p>
    </article>
  );
}

function LabelCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-300 px-3 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
