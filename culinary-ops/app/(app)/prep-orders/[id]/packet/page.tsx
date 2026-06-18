import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num, componentBatchFactor } from "@/lib/costing";
import { convertQty, unitLabel, displayMeasure } from "@/lib/units";
import { batchScaleFlag } from "@/lib/prep";
import { PrintButton } from "@/components/PrintButton";

// Cook packet — one printable artifact per prep order. Each recipe is scaled to
// the (combined) requested qty and lot-stamped. Cooks hand-copy the lot, made
// date and use-by onto container labels; the system prints no label artifact.

function parseSteps(instructions: string | null): string[] {
  if (!instructions) return [];
  return instructions
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
}

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
            recipe: {
              include: {
                items: { include: { item: true }, orderBy: { item: { name: "asc" } } },
                components: { include: { child: true }, orderBy: { child: { name: "asc" } } },
              },
            },
            destinationVenue: { select: { name: true, code: true } },
          },
          orderBy: [{ recipe: { name: "asc" } }, { destinationVenue: { name: "asc" } }],
        },
      },
    }),
    // Full catalog so sub-recipes can be nested to any depth (their own
    // ingredients, method and sub-builds), independent of Prisma include depth.
    prisma.recipe.findMany({
      select: {
        id: true,
        name: true,
        prodCode: true,
        yieldQty: true,
        yieldUnit: true,
        instructions: true,
        allergens: true,
        criticalNotes: true,
        items: {
          select: { id: true, quantity: true, unit: true, note: true, item: { select: { name: true } } },
          orderBy: { item: { name: "asc" } },
        },
        components: { select: { id: true, childId: true, quantity: true, unit: true } },
      },
    }),
  ]);
  if (!order) notFound();

  // Recipe tree keyed by id, for recursive sub-build rendering.
  const byId = new Map<string, TreeNode>(
    allRecipes.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        prodCode: r.prodCode,
        yieldQty: r.yieldQty,
        yieldUnit: r.yieldUnit,
        instructions: r.instructions,
        allergens: r.allergens,
        criticalNotes: r.criticalNotes,
        items: r.items.map((ri) => ({ id: ri.id, quantity: ri.quantity, unit: ri.unit, note: ri.note, name: ri.item.name })),
        components: r.components,
      },
    ]),
  );

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

// Catalog node used for recursive sub-build rendering.
type TreeNode = {
  id: string;
  name: string;
  prodCode: string;
  yieldQty: number;
  yieldUnit: string;
  instructions: string | null;
  allergens: string | null;
  criticalNotes: string | null;
  items: Array<{ id: string; quantity: number; unit: string; note: string | null; name: string }>;
  components: Array<{ id: string; childId: string; quantity: number; unit: string }>;
};

type PacketLine = {
  id: string;
  lot: string | null;
  recipeVersion: number;
  requestedQty: number;
  requestedUnit: string;
  destinationVenue: { name: string; code: string };
  recipe: {
    name: string;
    prodCode: string;
    yieldQty: number;
    yieldUnit: string;
    instructions: string | null;
    allergens: string | null;
    criticalNotes: string | null;
    storage: string | null;
    holdLifeDays: number | null;
    items: Array<{ id: string; quantity: number; unit: string; note: string | null; item: { name: string } }>;
    components: Array<{ id: string; quantity: number; unit: string; child: { id: string; name: string; yieldQty: number; yieldUnit: string } }>;
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
  byId: Map<string, TreeNode>;
}) {
  const recipe = lines[0].recipe;
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

  const steps = parseSteps(recipe.instructions);
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

      {recipe.allergens && (
        <div className="mt-3 border border-zinc-900 px-3 py-1.5 text-xs">
          <span className="font-bold uppercase tracking-wide">Allergens:</span>{" "}
          <span className="font-semibold uppercase">{recipe.allergens}</span>
        </div>
      )}

      {/* Scaled ingredients */}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            <th className="w-20 py-1.5 pr-3 text-right font-medium">Qty</th>
            <th className="w-16 py-1.5 pr-4 font-medium">Unit</th>
            <th className="py-1.5 pr-4 font-medium">Ingredient</th>
            <th className="py-1.5 font-medium">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {recipe.items.map((ri) => (
            <tr key={ri.id}>
              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{num(ri.quantity * scale)}</td>
              <td className="py-1.5 pr-4 text-zinc-600">{unitLabel(ri.unit)}</td>
              <td className="py-1.5 pr-4 text-zinc-900">{ri.item.name}</td>
              <td className="py-1.5 text-zinc-500">{ri.note ?? ""}</td>
            </tr>
          ))}
          {recipe.components.map((c) => {
            // Show the sub-recipe amount in the child's own yield unit (rolled
            // up), scaled by this batch — so "2.5 gal" of a recipe yielded in
            // servings reads in servings, not a meaningless free-text unit.
            const { batches } = componentBatchFactor(c.quantity, c.unit, c.child.yieldQty, c.child.yieldUnit);
            const m = displayMeasure(batches * c.child.yieldQty * scale, c.child.yieldUnit);
            return (
              <tr key={c.id}>
                <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{num(m.qty)}</td>
                <td className="py-1.5 pr-4 text-zinc-600">{m.label}</td>
                <td className="py-1.5 pr-4 text-zinc-900">{c.child.name} (sub-recipe)</td>
                <td className="py-1.5 text-zinc-500">see build below ↓</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Method */}
      {steps.length > 0 && (
        <ol className="mt-4 space-y-1.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-800">
              <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-zinc-400">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {recipe.criticalNotes && (
        <p className="mt-3 whitespace-pre-wrap border-l-2 border-zinc-900 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-900">
          ⚠ {recipe.criticalNotes}
        </p>
      )}

      {/* Nested sub-builds — each sub-recipe's own ingredients + method, scaled
          to the amount this batch needs, so the mother recipe is fully buildable
          from one packet entry. */}
      {recipe.components.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">Sub-Builds</p>
          {recipe.components.map((c) => {
            const childNode = byId.get(c.child.id);
            if (!childNode) return null;
            const { batches } = componentBatchFactor(c.quantity, c.unit, c.child.yieldQty, c.child.yieldUnit);
            return (
              <SubBuild key={c.id} node={childNode} byId={byId} totalBatches={batches * scale} depth={0} stack={new Set()} />
            );
          })}
        </div>
      )}

      {/* Footer stamp — self-documenting for food-safety / consistency */}
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
        {recipe.name} · {recipe.prodCode} · v{version} · lot {lot} · printed {madeOn}
      </p>
    </article>
  );
}

// Recursive sub-recipe build card. `totalBatches` is how many full batches of
// THIS recipe the parent needs (the parent's scale is already folded in). Its
// ingredients scale by totalBatches; nested sub-recipes recurse with their own
// batch fraction × totalBatches. A stack guards against cycles.
function SubBuild({
  node,
  byId,
  totalBatches,
  depth,
  stack,
}: {
  node: TreeNode;
  byId: Map<string, TreeNode>;
  totalBatches: number;
  depth: number;
  stack: Set<string>;
}) {
  if (stack.has(node.id)) return null; // cycle guard (blocked at creation, defensive here)
  const nextStack = new Set(stack);
  nextStack.add(node.id);

  const made = displayMeasure(totalBatches * node.yieldQty, node.yieldUnit);
  const steps = parseSteps(node.instructions);

  return (
    <div className={`break-inside-avoid border-l-2 border-zinc-400 pl-4 ${depth > 0 ? "ml-2" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl font-medium tracking-tight text-zinc-900">
          ↳ {node.name}{" "}
          <span className="align-middle text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">sub-recipe</span>
        </h3>
        <span className="shrink-0 text-sm font-semibold text-zinc-900">
          make {num(made.qty)} {made.label}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {node.prodCode} · base yield {num(node.yieldQty)} {node.yieldUnit}
      </p>

      {node.allergens && (
        <div className="mt-2 border border-zinc-900 px-3 py-1 text-xs">
          <span className="font-bold uppercase tracking-wide">Allergens:</span>{" "}
          <span className="font-semibold uppercase">{node.allergens}</span>
        </div>
      )}

      {/* Scaled ingredients + this sub-recipe's own sub-recipe lines */}
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            <th className="w-20 py-1 pr-3 text-right font-medium">Qty</th>
            <th className="w-16 py-1 pr-4 font-medium">Unit</th>
            <th className="py-1 pr-4 font-medium">Ingredient</th>
            <th className="py-1 font-medium">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {node.items.map((ri) => {
            const m = displayMeasure(ri.quantity * totalBatches, ri.unit);
            return (
              <tr key={ri.id}>
                <td className="py-1 pr-3 text-right font-semibold tabular-nums text-zinc-900">{num(m.qty)}</td>
                <td className="py-1 pr-4 text-zinc-600">{m.label}</td>
                <td className="py-1 pr-4 text-zinc-900">{ri.name}</td>
                <td className="py-1 text-zinc-500">{ri.note ?? ""}</td>
              </tr>
            );
          })}
          {node.components.map((cc) => {
            const child = byId.get(cc.childId);
            if (!child) return null;
            const { batches } = componentBatchFactor(cc.quantity, cc.unit, child.yieldQty, child.yieldUnit);
            const m = displayMeasure(batches * child.yieldQty * totalBatches, child.yieldUnit);
            return (
              <tr key={cc.id}>
                <td className="py-1 pr-3 text-right font-semibold tabular-nums text-zinc-900">{num(m.qty)}</td>
                <td className="py-1 pr-4 text-zinc-600">{m.label}</td>
                <td className="py-1 pr-4 text-zinc-900">{child.name} (sub-recipe)</td>
                <td className="py-1 text-zinc-500">see build below ↓</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {steps.length > 0 && (
        <ol className="mt-2 space-y-1">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-800">
              <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-zinc-400">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {node.criticalNotes && (
        <p className="mt-2 whitespace-pre-wrap border-l-2 border-zinc-900 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-900">
          ⚠ {node.criticalNotes}
        </p>
      )}

      {/* Deeper sub-builds */}
      {node.components.length > 0 && (
        <div className="mt-3 space-y-3">
          {node.components.map((cc) => {
            const child = byId.get(cc.childId);
            if (!child) return null;
            const { batches } = componentBatchFactor(cc.quantity, cc.unit, child.yieldQty, child.yieldUnit);
            return (
              <SubBuild
                key={cc.id}
                node={child}
                byId={byId}
                totalBatches={batches * totalBatches}
                depth={depth + 1}
                stack={nextStack}
              />
            );
          })}
        </div>
      )}
    </div>
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
