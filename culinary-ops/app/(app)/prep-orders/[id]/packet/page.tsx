import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFrozenPacket } from "@/lib/prep-packets";
import { requireUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { convertQty, unitLabel } from "@/lib/units";
import { buildShoppingList, type ShoppingRecipeNode } from "@/lib/shopping";
import { PrepCoolingLog } from "@/components/PrepCoolingLog";
import { PrintButton } from "@/components/PrintButton";
import { LocalTime } from "@/components/LocalTime";
import { ShoppingListBody } from "@/components/ShoppingList";
import {
  RecipeBuildBody,
  buildRecipeTree,
  type RecipeTreeNode,
} from "@/components/RecipeBuild";

// Cook packet — one printable artifact per prep order. It opens with a shopping
// / pull list (every raw ingredient the day needs, for the prep request) so the
// team can gather everything first, then one page per recipe: each scaled to the
// (combined) requested qty and lot-stamped. Cooks hand-copy the lot, made date
// and use-by onto container labels; the system prints no label artifact. The
// scaled recipe + nested sub-builds are rendered by the shared RecipeBuild.

// forDate-derived dates are UTC-midnight; format in UTC so the day is stable.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function CookPacketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    weights?: string | string[];
    shopping?: string | string[];
    cooling?: string | string[];
  }>;
}) {
  const options = await searchParams;
  const weightInGrams = options.weights === "grams";
  const includeShopping = options.shopping === "yes";
  const includeCooling = options.cooling !== "no";
  const { id } = await params;
  await requireUser();

  const frozen = await loadFrozenPacket(id);
  if (!frozen)
    return (
      <div>
        <h1>Packet unavailable</h1>
        <p>
          No frozen packet exists for this request. Historical recipe contents
          cannot be reconstructed from today’s catalog.
        </p>
        <Link href="/prep-orders">Back to Prep Orders</Link>
      </div>
    );
  const { order, allRecipes, shoppingRecipes } = frozen;
  if (!order) notFound();

  // Recipe tree keyed by id, for recursive sub-build rendering.
  const byId = buildRecipeTree(allRecipes);

  // Only printed lines (those with a lot) belong on the packet.
  const printed = order.lines.filter((l) => l.lot);

  // Shopping / pull list across the same printed batches, summed and grouped by
  // category, with sub-recipes exploded to raw items.
  const shoppingNodes: ShoppingRecipeNode[] = shoppingRecipes.map((r) => ({
    id: r.id,
    yieldQty: r.yieldQty,
    yieldUnit: r.yieldUnit,
    items: r.items.map((ri) => ({
      itemId: ri.item.id,
      name: ri.item.name,
      category: ri.item.category,
      quantity: ri.quantity,
      unit: ri.unit,
    })),
    components: r.components,
  }));
  const shopping = buildShoppingList(
    printed.map((l) => ({
      recipeId: l.recipeId,
      recipeName: l.recipe.name,
      requestedQty: l.requestedQty,
      requestedUnit: l.requestedUnit,
    })),
    shoppingNodes,
  );

  // Group into batches by lot — one lot = one physical batch. Splits across
  // venues share a lot (one entry); a recipe printed twice has two lots (two
  // entries).
  const groups = new Map<string, typeof printed>();
  for (const l of printed) {
    const arr = groups.get(l.lot!) ?? [];
    arr.push(l);
    groups.set(l.lot!, arr);
  }

  // Map recipeId → "lot X" for every top-level printed recipe. Passed into each
  // PacketEntry so sub-builds of those recipes render a pull-from-lot reference
  // instead of reprinting the full build for something already in this packet.
  const sharedRefs = new Map<string, string>();
  for (const lines of groups.values()) {
    sharedRefs.set(lines[0].recipeId, `lot ${lines[0].lot!}`);
  }

  const madeOn = fmtDate(order.forDate);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link
          href="/prep-orders"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Prep Orders
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/prep-orders/requests"
            className="text-sm text-blue-600 hover:underline"
          >
            Request details
          </Link>
          <PrintButton label="Print cook packet" />
        </div>
      </div>

      <form
        key={`${weightInGrams}-${includeShopping}-${includeCooling}`}
        method="get"
        className="no-print mb-5 rounded-xl border border-zinc-200 bg-white p-4 text-sm"
      >
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            Recipe weights
            <select
              name="weights"
              defaultValue={weightInGrams ? "grams" : "usual"}
              className="rounded border border-zinc-300 px-2 py-1"
            >
              <option value="usual">Usual units (lb / oz)</option>
              <option value="grams">Grams (g)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="shopping"
              value="yes"
              defaultChecked={includeShopping}
            />
            Include shopping / pull list
          </label>
          <label className="flex items-center gap-2">
            Cooling log
            <select
              name="cooling"
              defaultValue={includeCooling ? "yes" : "no"}
              className="rounded border border-zinc-300 px-2 py-1"
            >
              <option value="yes">Include</option>
              <option value="no">Omit</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-2 font-medium"
          >
            Update packet
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Choose options and update the packet before printing. Grams converts
          weight measurements, including sub-recipes. Volume and count
          measurements keep their usual units.
        </p>
      </form>

      {printed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">
            No printed lines yet.
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Generate the cook packet from the order to assign lots.
          </p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Cook Packet</span>
            <span>Production {madeOn}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">
            Commissary Prep
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {groups.size} batch{groups.size === 1 ? "" : "es"} · hand-copy each
            lot onto the container labels.
          </p>

          {/* Prep / pull list — open the packet with everything to gather, so
              the team can shop before building. Each recipe then starts fresh. */}
          {includeShopping && shopping.itemCount > 0 && (
            <section className="mt-8">
              <div className="flex items-baseline justify-between border-b-2 border-zinc-900 pb-1.5">
                <h2 className="font-display text-2xl font-medium tracking-tight text-zinc-900">
                  Shopping / Pull List
                </h2>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  {shopping.itemCount} item{shopping.itemCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Pull or buy everything below before building · sub-recipes
                broken down to raw items.
              </p>
              <ShoppingListBody list={shopping} />
            </section>
          )}

          <div className="mt-8 space-y-10">
            {[...groups.values()].map((lines, i) => (
              <PacketEntry
                key={lines[0].lot}
                lines={lines}
                madeOn={madeOn}
                forDate={order.forDate}
                byId={byId}
                sharedRefs={sharedRefs}
                // Each recipe starts on a new page. The first only breaks when a
                // shopping list precedes it, so it doesn't strand the header alone.
                breakBefore={
                  (includeShopping && shopping.itemCount > 0) || i > 0
                }
                weightInGrams={weightInGrams}
              />
            ))}
          </div>

          <PrepPacketLog lines={printed} madeOn={madeOn} />
          {includeCooling && <PrepCoolingLog lines={printed} madeOn={madeOn} />}

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed <LocalTime date={new Date()} mode="date" /> · Lots assigned
            at first print and frozen · Mise · Culinary Ops
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
  sharedRefs,
  breakBefore,
  weightInGrams,
}: {
  lines: PacketLine[];
  madeOn: string;
  forDate: Date;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs: Map<string, string>;
  breakBefore: boolean;
  weightInGrams: boolean;
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
  const scale =
    convertible && recipe.yieldQty > 0 ? combinedInYield / recipe.yieldQty : 1;

  const useBy =
    recipe.holdLifeDays != null
      ? new Date(
          forDate.getTime() + recipe.holdLifeDays * 86400000,
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : null;
  const split = lines.length > 1;

  return (
    <article
      className={`break-inside-avoid border-t-2 border-zinc-900 pt-4 ${breakBefore ? "break-before-page" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">
            {recipe.name}
          </h2>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            Yields{" "}
            {convertible
              ? `${num(combinedInYield)} ${unitLabel(recipe.yieldUnit)}`
              : "(mixed units)"}
          </p>
        </div>
        {/* Lot — large + clear for hand transcription onto labels */}
        <div className="shrink-0 border-2 border-zinc-900 px-4 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Lot
          </p>
          <p className="font-mono text-2xl font-bold tracking-wider text-zinc-900">
            {lot}
          </p>
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
              <div
                key={l.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <span className="font-medium text-zinc-900">
                  {l.destinationVenue.name}
                </span>
                <span className="font-bold tabular-nums text-zinc-900">
                  {num(l.requestedQty)} {unitLabel(l.requestedUnit)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t-2 border-zinc-900 bg-zinc-50 px-4 py-2">
            <span className="font-semibold text-zinc-500">Combined total</span>
            <span className="font-bold tabular-nums text-zinc-900">
              {convertible
                ? `${num(combinedInYield)} ${unitLabel(recipe.yieldUnit)}`
                : "(mixed units)"}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-y border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-zinc-900">
            Total{" "}
            {convertible
              ? `${num(combinedInYield)} ${unitLabel(recipe.yieldUnit)}`
              : "(mixed units)"}
          </span>
          <span className="text-zinc-600">
            {" "}
            → {lines[0].destinationVenue.name} ({num(lines[0].requestedQty)}{" "}
            {unitLabel(lines[0].requestedUnit)})
          </span>
        </div>
      )}

      {/* Scaling guard — only when ordered units don't convert to the yield unit */}
      {!convertible && (
        <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          ⚠ Requested units don&apos;t convert to the base yield unit — verify
          the batch size manually.
        </div>
      )}

      {/* Label transcription line */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <LabelCell label="Made date" value={madeOn} />
        <LabelCell label="Use-by" value={useBy ?? "—"} />
        <LabelCell label="Prod. code" value={recipe.prodCode} />
      </div>

      {/* Scaled ingredients, method, allergens & nested sub-builds */}
      {node && (
        <RecipeBuildBody
          node={node}
          byId={byId}
          totalBatches={scale}
          compact={false}
          depth={0}
          stack={new Set()}
          sharedRefs={sharedRefs}
          weightInGrams={weightInGrams}
        />
      )}

      <div className="mt-6 space-y-5 border border-zinc-400 p-4 text-sm">
        <p>
          Actual production ______ {unitLabel(recipe.yieldUnit)} · Production
          waste ______ · Kept at commissary ______
        </p>
        {lines.map((l) => (
          <p key={l.id}>
            Request {l.id.slice(-6)} · {l.destinationVenue.name}: sent ______{" "}
            {unitLabel(l.requestedUnit)} · Shortage / reason __________________
          </p>
        ))}
        <p>
          Cook sign-off __________________ · Production person-minutes ______ ·
          Dishwasher minutes ______
        </p>
        <p>
          Venue-supplied ingredient / venue / quantity / unit / note
          __________________________________
        </p>
      </div>
      {/* Footer stamp — self-documenting for food-safety / consistency */}
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
        {recipe.name} · {recipe.prodCode} · v{version} · lot {lot} · printed{" "}
        {madeOn}
      </p>
    </article>
  );
}

function LabelCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-300 px-3 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
        {label}
      </p>
      <p className="font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

// One row per destination matches back-entry, including split allocations.
function PrepPacketLog({
  lines,
  madeOn,
}: {
  lines: PacketLine[];
  madeOn: string;
}) {
  return (
    <section className="mt-10 break-before-page">
      <h2 className="font-display text-3xl font-medium text-zinc-900">
        Prep Accountability Log
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Production {madeOn} · Record actual yield with units for each
        destination.
      </p>
      <table className="mt-5 w-full table-fixed border-collapse text-xs text-zinc-900">
        <thead className="table-header-group">
          <tr className="bg-zinc-100 text-left">
            <th className="w-[27%] border border-zinc-400 p-2">
              Item / lot / destination
            </th>
            <th className="w-[15%] border border-zinc-400 p-2">Planned prep</th>
            <th className="w-[17%] border border-zinc-400 p-2">Prepared by</th>
            <th className="w-[18%] border border-zinc-400 p-2">
              Actual yield + unit
            </th>
            <th className="w-[23%] border border-zinc-400 p-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="h-24 break-inside-avoid align-top">
              <td className="break-words border border-zinc-400 p-2">
                <p className="font-semibold">{line.recipe.name}</p>
                <p className="mt-1 font-mono">{line.lot}</p>
                <p className="mt-1">{line.destinationVenue.name}</p>
              </td>
              <td className="border border-zinc-400 p-2 font-semibold">
                {num(line.requestedQty)} {unitLabel(line.requestedUnit)}
              </td>
              <td className="border border-zinc-400 p-2">&nbsp;</td>
              <td className="border border-zinc-400 p-2">&nbsp;</td>
              <td className="border border-zinc-400 p-2">&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 break-inside-avoid text-sm text-zinc-900">
        <p className="font-semibold">Chef review</p>
        <div className="mt-8 flex gap-6">
          <p className="flex-1 border-t border-zinc-600 pt-2">
            Chef review signature
          </p>
          <p className="w-36 border-t border-zinc-600 pt-2">Date / time</p>
        </div>
      </div>
    </section>
  );
}
