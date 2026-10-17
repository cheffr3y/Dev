import { RecipePrintSettings } from "@/components/RecipeDossier";
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
import { RecipeReferences } from "@/components/RecipeReferences";
import { buildRecipeReferences, type RecipeReferencePlan } from "@/lib/recipe-references";
import {
  RecipeBuildCard,
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
  const references = buildRecipeReferences(
    [...groups.values()].flatMap((lines) => {
      const node = byId.get(lines[0].recipeId);
      return node ? [{ node, totalBatches: packetScale(lines).scale }] : [];
    }),
    byId,
    sharedRefs,
  );

  const madeOn = fmtDate(order.forDate);

  return (
    <div className="recipe-print recipe-packet mx-auto max-w-[8.5in]">
      <RecipePrintSettings />
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
        <div className="recipe-packet-content">
          <div className="no-print rounded-xl border border-hairline bg-canvas p-5">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Cook Packet</span>
            <span>Production {madeOn}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900 print:text-3xl">
            Commissary Prep
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {groups.size} batch{groups.size === 1 ? "" : "es"} · hand-copy each
            lot onto the container labels.
          </p>
          </div>

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

          <div className="recipe-packet-builds mt-8 space-y-8">
            {[...groups.values()].map((lines) => (
              <PacketEntry
                key={lines[0].lot}
                lines={lines}
                madeOn={madeOn}
                forDate={order.forDate}
                byId={byId}
                sharedRefs={sharedRefs}
                references={references}
                weightInGrams={weightInGrams}
              />
            ))}
          </div>

          <PrepPacketLog lines={printed} madeOn={madeOn} />
          {includeCooling && <PrepCoolingLog lines={printed} madeOn={madeOn} />}

          <RecipeReferences references={references} byId={byId} sharedRefs={sharedRefs} weightInGrams={weightInGrams} />

          <p className="no-print mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
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

function packetScale(lines: PacketLine[]) {
  const recipe = lines[0].recipe;
  let combinedInYield = 0;
  let convertible = true;
  for (const line of lines) {
    const quantity = convertQty(line.requestedQty, line.requestedUnit, recipe.yieldUnit);
    if (quantity == null) convertible = false;
    else combinedInYield += quantity;
  }
  const scale = convertible && recipe.yieldQty > 0 ? combinedInYield / recipe.yieldQty : 1;
  return { combinedInYield, convertible, scale };
}

function PacketEntry({ lines, madeOn, forDate, byId, sharedRefs, references, weightInGrams }: {
  lines: PacketLine[]; madeOn: string; forDate: Date;
  byId: Map<string, RecipeTreeNode>; sharedRefs: Map<string, string>;
  references: RecipeReferencePlan; weightInGrams: boolean;
}) {
  const recipe = lines[0].recipe;
  const captured = byId.get(recipe.id);
  const lot = lines[0].lot ?? "—";
  const version = lines[0].recipeVersion;
  const { combinedInYield, convertible, scale } = packetScale(lines);
  const useBy = recipe.holdLifeDays != null
    ? fmtDate(new Date(forDate.getTime() + recipe.holdLifeDays * 86400000)) : "—";
  const node: RecipeTreeNode = captured
    ? { ...captured, version, holdLifeDays: captured.holdLifeDays ?? recipe.holdLifeDays }
    : { ...recipe, version, instructions: null, criticalNotes: null, allergens: null, items: [], components: [] };
  return <RecipeBuildCard node={node} byId={byId} totalBatches={scale}
    compact={false} depth={0} stack={new Set()} sharedRefs={sharedRefs}
    weightInGrams={weightInGrams} references={references} batchLabel="Requested Batch"
    context={<>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-medium text-[#2C3E35]">
        <p>Commissary Prep · Production {madeOn}</p>
        <p>Lot <strong className="font-mono tabular-nums">{lot}</strong></p>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[9px] tabular-nums">
        <p>Made date: {madeOn}</p><p>Use-by: {useBy}</p>
        <p>Total: {convertible ? `${num(combinedInYield)} ${unitLabel(recipe.yieldUnit)}` : "(mixed units)"}{lines.length > 1 ? " · Split Batch — Portion before pickup" : ""}</p>
      </div>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        {lines.map((line) => <li key={line.id}>{line.destinationVenue.name}: <span className="font-mono tabular-nums">{num(line.requestedQty)} {unitLabel(line.requestedUnit)}</span></li>)}
      </ul>
      {!convertible && <p className="recipe-scaling-warning mt-2 border-l-2 border-gold bg-[#F4F1EA] p-2 font-semibold">Requested units don&apos;t convert to the base yield unit — verify the batch size manually.</p>}
      {!captured && <p className="mt-2 font-semibold">Captured recipe details unavailable for this lot.</p>}
    </>} />;
}

// Capture the same production and allocation fields beside the accountability
// log, so recipe sheets retain their room for ingredients and execution.
function PrepProductionRecord({ lines }: { lines: PacketLine[] }) {
  const recipe = lines[0].recipe;
  return <div className="recipe-production-record mt-4 break-inside-avoid border border-hairline bg-canvas p-4 text-xs leading-relaxed">
    <h3 className="font-display text-lg italic text-[#2C3E35]">{recipe.name} · <span className="font-mono text-xs not-italic">Lot {lines[0].lot}</span></h3>
    <div className="mt-3 space-y-4">
      <p>Actual production ______ {unitLabel(recipe.yieldUnit)} · Production waste ______ · Kept at commissary ______</p>
      {lines.map((line) => <p key={line.id}>Request {line.id.slice(-6)} · {line.destinationVenue.name}: sent ______ {unitLabel(line.requestedUnit)} · Shortage / reason __________________</p>)}
      <p>Cook sign-off __________________ · Production person-minutes ______ · Dishwasher minutes ______</p>
      <p>Venue-supplied ingredient / venue / quantity / unit / note __________________________________</p>
    </div>
  </div>;
}

// One row per destination matches back-entry, including split allocations.
function PrepPacketLog({
  lines,
  madeOn,
}: {
  lines: PacketLine[];
  madeOn: string;
}) {
  const batches = new Map<string, PacketLine[]>();
  for (const line of lines) {
    const key = line.lot ?? line.id;
    batches.set(key, [...(batches.get(key) ?? []), line]);
  }
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
      <section className="mt-6" aria-label="Batch production records">
        <h2 className="font-display text-2xl italic text-[#2C3E35]">Batch Production Records</h2>
        {[...batches.entries()].map(([lot, batch]) => <PrepProductionRecord key={lot} lines={batch} />)}
      </section>
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
