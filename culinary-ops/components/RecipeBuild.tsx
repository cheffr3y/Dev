// Shared cook-packet renderer: a recipe scaled to a batch count, with every
// sub-recipe built inline to any depth. Used by both the commissary prep-order
// packet and the banquet cook packet so the "scaled recipe + nested sub-builds"
// math and layout live in exactly one place.
//
// The whole recipe catalog is loaded as a flat map of RecipeTreeNode so a
// recipe's sub-recipes can be nested to any depth (their own ingredients, method
// and sub-builds), independent of any Prisma include depth. `totalBatches` is
// always how many full batches of THIS recipe to make — a parent's scale is
// folded into it before the child renders.

import { num, componentBatchFactor } from "@/lib/costing";
import { displayMeasure } from "@/lib/units";
import { allergenLabels, effectiveAllergens } from "@/lib/allergens";
import { splitStep } from "@/lib/method";

// Catalog node used for recursive sub-build rendering.
export type RecipeTreeNode = {
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

// Prisma `select` that loads a recipe row with everything the tree needs.
export const recipeTreeSelect = {
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
  components: {
    select: { id: true, childId: true, quantity: true, unit: true },
    orderBy: { child: { name: "asc" } },
  },
} as const;

// Shape of a row returned by findMany({ select: recipeTreeSelect }).
type RecipeTreeRow = {
  id: string;
  name: string;
  prodCode: string;
  yieldQty: number;
  yieldUnit: string;
  instructions: string | null;
  allergens: string | null;
  criticalNotes: string | null;
  items: Array<{ id: string; quantity: number; unit: string; note: string | null; item: { name: string } }>;
  components: Array<{ id: string; childId: string; quantity: number; unit: string }>;
};

// Index the catalog by id for recursive sub-build rendering.
export function buildRecipeTree(rows: RecipeTreeRow[]): Map<string, RecipeTreeNode> {
  return new Map(
    rows.map((r) => [
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
}

// Split stored free-text instructions into trimmed, number-stripped steps.
export function parseSteps(instructions: string | null): string[] {
  if (!instructions) return [];
  return instructions
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
}

// The scaled body of a recipe build: allergen line, scaled ingredient table
// (own items + sub-recipe lines rolled into natural units), method, critical
// notes, then each sub-recipe rendered as its own nested build card. Callers
// supply the surrounding chrome (lot box, ordered count, etc.). `compact`
// tightens spacing for nested cards; `depth`/`stack` thread cycle-safety and
// indentation down to the sub-builds. `sharedLots` maps recipeId → lot for
// sub-recipes that already have their own top-level batch in this packet; those
// render as a pull-from-lot reference instead of a full inline build.
export function RecipeBuildBody({
  node,
  byId,
  totalBatches,
  compact,
  depth,
  stack,
  sharedLots,
}: {
  node: RecipeTreeNode;
  byId: Map<string, RecipeTreeNode>;
  totalBatches: number;
  compact: boolean;
  depth: number;
  stack: Set<string>;
  sharedLots?: Map<string, string>;
}) {
  const steps = parseSteps(node.instructions);
  const allergens = allergenLabels(effectiveAllergens(node.id, byId));
  const cellY = compact ? "py-1" : "py-1.5";

  return (
    <>
      {allergens && (
        <div className={`${compact ? "mt-2 py-1" : "mt-3 py-1.5"} border border-zinc-900 px-3 text-xs`}>
          <span className="font-bold uppercase tracking-wide">Allergens:</span>{" "}
          <span className="font-semibold uppercase">{allergens}</span>
        </div>
      )}

      <table className={`${compact ? "mt-2" : "mt-4"} w-full text-sm`}>
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            <th className={`w-20 ${cellY} pr-3 text-right font-medium`}>Qty</th>
            <th className={`w-16 ${cellY} pr-4 font-medium`}>Unit</th>
            <th className={`${cellY} pr-4 font-medium`}>Ingredient</th>
            <th className={`${cellY} font-medium`}>Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {node.items.map((ri) => {
            // Roll the scaled amount up into its natural unit (oz→lb, sub-oz→g,
            // fl oz→qt→gal) so cooks read "3 lb" not "48 oz".
            const m = displayMeasure(ri.quantity * totalBatches, ri.unit);
            return (
              <tr key={ri.id}>
                <td className={`${cellY} pr-3 text-right font-semibold tabular-nums text-zinc-900`}>{num(m.qty)}</td>
                <td className={`${cellY} pr-4 text-zinc-600`}>{m.label}</td>
                <td className={`${cellY} pr-4 text-zinc-900`}>{ri.name}</td>
                <td className={`${cellY} text-zinc-500`}>{ri.note ?? ""}</td>
              </tr>
            );
          })}
          {node.components.map((c) => {
            const child = byId.get(c.childId);
            if (!child) return null;
            // Show the sub-recipe amount in the child's own yield unit (rolled
            // up), scaled by this batch — so the line reads in the child's units.
            const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
            const m = displayMeasure(batches * child.yieldQty * totalBatches, child.yieldUnit);
            const sharedLot = sharedLots?.get(c.childId);
            return (
              <tr key={c.id}>
                <td className={`${cellY} pr-3 text-right font-semibold tabular-nums text-zinc-900`}>{num(m.qty)}</td>
                <td className={`${cellY} pr-4 text-zinc-600`}>{m.label}</td>
                <td className={`${cellY} pr-4 text-zinc-900`}>{child.name} (sub-recipe)</td>
                <td className={`${cellY} text-zinc-500`}>{sharedLot ? `pull from lot ${sharedLot}` : "see build below ↓"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {steps.length > 0 && (
        <ol className={compact ? "mt-2 space-y-1" : "mt-4 space-y-1.5"}>
          {steps.map((step, i) => {
            const { action, detail } = splitStep(step);
            return (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-800">
                <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-zinc-400">{i + 1}</span>
                <span>
                  {action && <span className="font-semibold text-zinc-900">{action} — </span>}
                  {detail}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {node.criticalNotes && (
        <p
          className={`${
            compact ? "mt-2 py-1" : "mt-3 py-1.5"
          } whitespace-pre-wrap border-l-2 border-zinc-900 bg-zinc-50 px-3 text-sm font-medium text-zinc-900`}
        >
          ⚠ {node.criticalNotes}
        </p>
      )}

      {/* Nested sub-builds — each sub-recipe's own ingredients + method, scaled
          to the amount this batch needs, so the recipe is fully buildable from
          one entry. */}
      {node.components.length > 0 && (
        <div className={compact ? "mt-3 space-y-3" : "mt-6 space-y-4"}>
          {!compact && <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">Sub-Builds</p>}
          {node.components.map((c) => {
            const child = byId.get(c.childId);
            if (!child) return null;
            const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
            return (
              <SubBuild key={c.id} node={child} byId={byId} totalBatches={batches * totalBatches} depth={depth} stack={stack} sharedLots={sharedLots} />
            );
          })}
        </div>
      )}
    </>
  );
}

// Recursive sub-recipe build card: the sub-recipe's header (name + the amount to
// make) followed by its scaled body. `totalBatches` already folds in the
// parent's scale. A stack guards against cycles (blocked at creation, defensive
// here). When the sub-recipe is in `sharedLots` (it already has its own
// top-level batch in this packet), render only a pull-from-lot reference so the
// cook doesn't rebuild what they've already made.
export function SubBuild({
  node,
  byId,
  totalBatches,
  depth,
  stack,
  sharedLots,
}: {
  node: RecipeTreeNode;
  byId: Map<string, RecipeTreeNode>;
  totalBatches: number;
  depth: number;
  stack: Set<string>;
  sharedLots?: Map<string, string>;
}) {
  if (stack.has(node.id)) return null; // cycle guard

  const made = displayMeasure(totalBatches * node.yieldQty, node.yieldUnit);
  const sharedLot = sharedLots?.get(node.id);

  if (sharedLot) {
    return (
      <div className={`break-inside-avoid border-l-2 border-zinc-300 pl-4 ${depth > 0 ? "ml-2" : ""}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl font-medium tracking-tight text-zinc-500">
            ↳ {node.name}{" "}
            <span className="align-middle text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">sub-recipe</span>
          </h3>
          <span className="shrink-0 text-sm font-semibold text-zinc-500">
            pull {num(made.qty)} {made.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-400">→ from lot {sharedLot}</p>
      </div>
    );
  }

  const nextStack = new Set(stack);
  nextStack.add(node.id);

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

      <RecipeBuildBody node={node} byId={byId} totalBatches={totalBatches} compact depth={depth + 1} stack={nextStack} sharedLots={sharedLots} />
    </div>
  );
}
