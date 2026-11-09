import Link from "next/link";
import { componentBatchFactor, num } from "@/lib/recipes/costing";
import type { ForecastLine, ForecastRow } from "@/lib/menus/festival";
import { unitLabel } from "@/lib/recipes/units";
import { LocalTime } from "@/components/LocalTime";
import { RecipeBuildCard, SharedBuildCard, consolidateSharedSubBuilds, type RecipeTreeNode } from "@/components/RecipeBuild";

type RecipeGuideFestival = {
  id: string;
  name: string;
  date: Date;
  expectedAttendance: number;
  captureRate: number;
  bufferPct: number;
  notes: string | null;
  weatherNotes: string | null;
  menuItems: (ForecastLine & {
    name: string;
    recipeId: string | null;
    tent: { name: string };
  })[];
};

// Printable recipe guide for a festival. The Builds tab answers "how much do
// we make?" in summary form; this page answers "what is the scaled recipe?"
// with full ingredient/method bodies and nested sub-builds. Sub-recipes used
// by more than one dish are consolidated into a make-first Shared Builds
// section so the guide never prints the same build twice.

type MenuUse = {
  menuName: string;
  tentName: string;
  prepPortions: number;
  mixPct: number;
  bufferPct: number;
  overridden: boolean;
};

type GuideEntry = {
  node: RecipeTreeNode;
  totalBatches: number;
  unscaled: boolean;
  uses: MenuUse[];
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function buildEntryBatch(node: RecipeTreeNode, prepPortions: number): { batches: number; unscaled: boolean } {
  if (node.yieldQty <= 0) return { batches: prepPortions > 0 ? 1 : 0, unscaled: prepPortions > 0 };
  const { batches, converted } = componentBatchFactor(prepPortions, node.yieldUnit, node.yieldQty, node.yieldUnit);
  return { batches, unscaled: !converted };
}

export function FestivalRecipeGuide({ festival, byId, rowById, inPacket = false }: {
  festival: RecipeGuideFestival;
  byId: Map<string, RecipeTreeNode>;
  rowById: Map<string, ForecastRow>;
  inPacket?: boolean;
}) {
  const entriesByRecipe = new Map<string, GuideEntry>();
  const unlinked = festival.menuItems.filter((mi) => !mi.recipeId || !byId.has(mi.recipeId));

  for (const mi of festival.menuItems) {
    if (!mi.recipeId) continue;
    const node = byId.get(mi.recipeId);
    if (!node) continue;

    const row = rowById.get(mi.id);
    const prepPortions = row?.finalPrepPortions ?? 0;
    const batch = buildEntryBatch(node, prepPortions);
    const entry =
      entriesByRecipe.get(mi.recipeId) ??
      ({
        node,
        totalBatches: 0,
        unscaled: false,
        uses: [],
      } satisfies GuideEntry);

    entry.totalBatches += batch.batches;
    entry.unscaled = entry.unscaled || batch.unscaled;
    entry.uses.push({
      menuName: mi.name,
      tentName: mi.tent.name,
      prepPortions,
      mixPct: mi.mixPct,
      bufferPct: mi.bufferPctOverride ?? festival.bufferPct,
      overridden: row?.overridden ?? false,
    });
    entriesByRecipe.set(mi.recipeId, entry);
  }

  const entries = [...entriesByRecipe.values()].sort((a, b) => a.node.name.localeCompare(b.node.name));
  // Sub-recipes used by more than one dish become one "make once" build each,
  // printed up front; the dishes below pull from them instead of rebuilding.
  const { shared, sharedRefs } = consolidateSharedSubBuilds(
    entries.map((e) => ({ node: e.node, totalBatches: e.totalBatches })),
    byId,
  );
  const projectedCovers = Math.round(festival.expectedAttendance * festival.captureRate);
  const dateLabel = fmtDate(festival.date);

  if (entries.length === 0) return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-600">No scaled recipes yet.</p>
      <p className="mt-1 text-sm text-zinc-400">
        Link recipes to menu items on the{" "}
        <Link href={`/festivals/${festival.id}/menu`} className="text-blue-600 hover:underline">
          Menu &amp; Forecast
        </Link>{" "}
        page and they&apos;ll print here.
      </p>
    </div>
  );

  return (
    <div className="recipe-packet-content">
      {!inPacket && (
        <div className="no-print rounded-xl border border-hairline bg-canvas p-5">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Festival Recipe Guide</span>
            <span>{Math.round(festival.captureRate * 100)}% capture · {Math.round(festival.bufferPct * 100)}% default buffer</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">{festival.name}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {dateLabel} · {festival.expectedAttendance.toLocaleString()} attendance →{" "}
            {projectedCovers.toLocaleString()} projected covers
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {entries.length} scaled recipe{entries.length === 1 ? "" : "s"}
            {shared.length > 0
              ? ` · ${shared.length} shared build${shared.length === 1 ? "" : "s"} made once up front`
              : ""}{" "}
            · final prep portions include forecast, chef overrides, and buffer.
          </p>

          {unlinked.length > 0 && (
            <div className="mt-4 border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Forecast-only (no recipe linked, not in this guide): {unlinked.map((mi) => mi.name).join(", ")}.
            </div>
          )}

          {entries.some((e) => e.unscaled) && (
            <div className="mt-3 border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
              Some recipes have no usable yield and are shown as base batches. Verify those quantities by hand.
            </div>
          )}
        </div>
      )}

      {shared.length > 0 && (
        <section className="recipe-packet-builds mt-8">
          <div className={inPacket ? "border-b border-zinc-300 pb-1 print:break-after-avoid" : "no-print border-b-2 border-zinc-900 pb-1.5"}>
            <h3 className="font-display text-2xl font-medium tracking-tight text-zinc-900">
              Shared Builds — Make These First
            </h3>
          </div>
          <p className="no-print mt-1 text-sm text-zinc-500">
            Each build below feeds more than one dish. Make the full amount once; the dishes pull from it.
          </p>
          <div className="recipe-packet-builds mt-6 space-y-8">
            {shared.map((b) => (
              <SharedBuildCard key={b.node.id} build={b} byId={byId} sharedRefs={sharedRefs}
                context={<p>{festival.name} · {dateLabel}</p>} />
            ))}
          </div>
        </section>
      )}

      {shared.length > 0 && (
        <div className={inPacket ? "mt-6 border-b border-zinc-300 pb-1 print:break-after-avoid" : "no-print mt-12 border-b-2 border-zinc-900 pb-1.5"}>
          <h3 className="font-display text-2xl font-medium tracking-tight text-zinc-900">Dishes</h3>
        </div>
      )}
      <div className="recipe-packet-builds mt-8 space-y-8">
        {entries.map((entry) => (
          <RecipeGuideEntry key={entry.node.id} entry={entry} byId={byId} sharedRefs={sharedRefs}
            festivalLabel={`${festival.name} · ${dateLabel}`}
            forecastLabel={`${festival.expectedAttendance.toLocaleString()} attendance · ${projectedCovers.toLocaleString()} projected covers · ${Math.round(festival.captureRate * 100)}% capture · ${Math.round(festival.bufferPct * 100)}% default buffer`} />
        ))}
      </div>

      {!inPacket && (festival.weatherNotes || festival.notes || unlinked.length > 0) && (
        <div className="recipe-packet-notes mt-8 grid grid-cols-1 gap-6 break-inside-avoid sm:grid-cols-2">
          {unlinked.length > 0 && <p className="col-span-full border-l-2 border-gold bg-[#F4F1EA] p-3 text-xs">Forecast-only (no recipe linked): {unlinked.map((mi) => mi.name).join(", ")}.</p>}
          {festival.weatherNotes && (
            <section>
              <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                Weather
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{festival.weatherNotes}</p>
            </section>
          )}
          {festival.notes && (
            <section>
              <h2 className="border-b-2 border-zinc-900 pb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                Notes
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{festival.notes}</p>
            </section>
          )}
        </div>
      )}

      {!inPacket && <p className="no-print mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
        Printed <LocalTime date={new Date()} mode="date" /> · Scaled from final prep portions (forecast + buffer) ·
        Mise · Culinary Ops
      </p>}
    </div>
  );
}

function RecipeGuideEntry({ entry, byId, sharedRefs, festivalLabel, forecastLabel }: {
  entry: GuideEntry; byId: Map<string, RecipeTreeNode>; sharedRefs: Map<string, string>; festivalLabel: string; forecastLabel: string;
}) {
  return <RecipeBuildCard node={entry.node} byId={byId} totalBatches={entry.totalBatches}
    compact={false} depth={0} stack={new Set()} sharedRefs={sharedRefs}
    context={<>
      <p className="font-medium text-[#2C3E35]">{festivalLabel}</p>
      <p className="mt-1 text-[9px]">{forecastLabel}</p>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        {entry.uses.map((use, index) => <li key={`${use.tentName}-${use.menuName}-${index}`}>
          {use.menuName} · {use.tentName}: <span className="font-mono tabular-nums">{num(use.prepPortions)} {unitLabel(entry.node.yieldUnit)}</span>
          <span className="block text-[9px] text-zinc-500">{use.overridden ? "Chef override" : `${num(use.mixPct * 100)}% mix`} · {num(use.bufferPct * 100)}% buffer</span>
        </li>)}
      </ul>
      {entry.unscaled && <p className="recipe-scaling-warning mt-2 border-l-2 border-gold bg-[#F4F1EA] p-2 font-semibold">Make {num(entry.totalBatches)} base batches. This recipe has no usable yield; verify ingredient amounts manually.</p>}
    </>} />;
}
