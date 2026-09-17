// Shared cook-packet renderer: a recipe scaled to a batch count, with every
// sub-recipe built inline to any depth. Used by the commissary prep-order
// packet, the banquet cook packet and the festival recipe guide so the
// "scaled recipe + nested sub-builds" math and layout live in exactly one
// place.
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
  version: number;
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
  version: true,
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
  version: number;
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
        version: r.version,
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

// A sub-recipe pulled out of the inline builds because more than one build in
// the packet uses it: make `totalBatches` of it once, split across `usedBy`.
export type SharedSubBuild = {
  node: RecipeTreeNode;
  totalBatches: number;
  usedBy: string[];
};

// Find every sub-recipe that appears more than once across the given top-level
// builds, total its demand, and return the "make once" builds plus the ref map
// that turns each inline appearance into a pull reference. Demand is linear in
// batches, so summing over every occurrence (including occurrences nested
// inside other shared sub-recipes) yields exactly what the consolidated builds
// need. Results are ordered dependencies-first (a shared build that feeds
// another shared build prints before it), so "shared build above" reads true
// wherever the reference appears.
export function consolidateSharedSubBuilds(
  tops: Array<{ node: RecipeTreeNode; totalBatches: number }>,
  byId: Map<string, RecipeTreeNode>,
): { shared: SharedSubBuild[]; sharedRefs: Map<string, string> } {
  const demand = new Map<string, { batches: number; count: number; usedBy: Set<string> }>();

  function walk(node: RecipeTreeNode, batches: number, rootName: string, stack: Set<string>) {
    if (stack.has(node.id)) return; // cycle guard
    const next = new Set(stack).add(node.id);
    for (const c of node.components) {
      const child = byId.get(c.childId);
      if (!child) continue;
      const { batches: perBatch } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
      const childBatches = perBatch * batches;
      const d = demand.get(child.id) ?? { batches: 0, count: 0, usedBy: new Set<string>() };
      d.batches += childBatches;
      d.count += 1;
      d.usedBy.add(rootName);
      demand.set(child.id, d);
      walk(child, childBatches, rootName, next);
    }
  }
  for (const t of tops) walk(t.node, t.totalBatches, t.node.name, new Set());

  const sharedIds = new Set([...demand.keys()].filter((id) => (demand.get(id)?.count ?? 0) >= 2));

  // Dependencies-first order among the shared builds, alphabetical otherwise.
  const ordered: string[] = [];
  const seen = new Set<string>();
  function order(id: string, stack: Set<string>) {
    if (seen.has(id) || stack.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    const next = new Set(stack).add(id);
    for (const c of [...node.components].sort((a, b) => a.childId.localeCompare(b.childId))) {
      if (sharedIds.has(c.childId)) order(c.childId, next);
    }
    seen.add(id);
    ordered.push(id);
  }
  for (const id of [...sharedIds].sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? ""))) {
    order(id, new Set());
  }

  const shared: SharedSubBuild[] = ordered.map((id) => {
    const d = demand.get(id)!;
    return { node: byId.get(id)!, totalBatches: d.batches, usedBy: [...d.usedBy].sort((a, b) => a.localeCompare(b)) };
  });
  const sharedRefs = new Map(ordered.map((id) => [id, "shared build above"]));
  return { shared, sharedRefs };
}

// One consolidated shared sub-recipe, printed once at the top of a packet with
// the same chrome as a top-level build: name, total to make, who pulls from it,
// then the full scaled body (whose own shared components render as pulls).
export function SharedBuildCard({
  build,
  byId,
  sharedRefs,
}: {
  build: SharedSubBuild;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs: Map<string, string>;
}) {
  const { node } = build;
  const made = displayMeasure(build.totalBatches * node.yieldQty, node.yieldUnit);

  return (
    <article className="break-inside-avoid border-t-2 border-zinc-900 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">{node.name}</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            Make {num(made.qty)} {made.label} — once
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {node.prodCode} · v{node.version} · base yield {num(node.yieldQty)} {node.yieldUnit} · scale x
            {num(build.totalBatches)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">Feeds: {build.usedBy.join(" · ")}</p>
        </div>
        <div className="shrink-0 border-2 border-zinc-900 px-4 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Make once</p>
          <p className="font-mono text-2xl font-bold tracking-wider text-zinc-900">{num(made.qty)}</p>
          <p className="text-xs font-medium text-zinc-500">{made.label}</p>
        </div>
      </div>

      <RecipeBuildBody
        node={node}
        byId={byId}
        totalBatches={build.totalBatches}
        compact={false}
        depth={0}
        stack={new Set()}
        sharedRefs={sharedRefs}
      />
    </article>
  );
}

// The scaled body of a recipe build: allergen line, scaled ingredient table
// (own items + sub-recipe lines rolled into natural units), method, critical
// notes, then each sub-recipe rendered as its own nested build card. Callers
// supply the surrounding chrome (lot box, ordered count, etc.). `compact`
// tightens spacing for nested cards; `depth`/`stack` thread cycle-safety and
// indentation down to the sub-builds. `sharedRefs` maps recipeId → a "where to
// get it" phrase (e.g. "lot A123", "shared build above") for sub-recipes that
// already have their own build elsewhere in this packet; those render as a
// pull reference instead of a full inline build.
export function RecipeBuildBody({
  node,
  byId,
  totalBatches,
  compact,
  depth,
  stack,
  sharedRefs,
  weightInGrams = false,
}: {
  node: RecipeTreeNode;
  byId: Map<string, RecipeTreeNode>;
  totalBatches: number;
  compact: boolean;
  depth: number;
  stack: Set<string>;
  sharedRefs?: Map<string, string>;
  weightInGrams?: boolean;
}) {
  const steps = parseSteps(node.instructions);
  const allergens = allergenLabels(effectiveAllergens(node.id, byId));
  const cellY = compact ? "py-1" : "py-1.5";
  // Match the recipe card: the Prep/Note column only prints when a line has
  // something to say (an ingredient note or a sub-recipe pull pointer), so
  // blank builds give the space back to the ingredients.
  const hasNotes = node.items.some((ri) => ri.note) || node.components.length > 0;

  return (
    <>
      {allergens && (
        <div className={`${compact ? "mt-2 py-1" : "mt-3 py-1.5"} border-2 border-zinc-900 px-3 text-xs`}>
          <span className="font-bold uppercase tracking-wide">Contains allergens:</span>{" "}
          <span className="font-semibold uppercase">{allergens}</span>
        </div>
      )}

      {/* Zebra rows keep the eye on-line on kitchen printouts (globals.css
          sets print-color-adjust so the shading survives printing). */}
      <table className={`${compact ? "mt-2" : "mt-4"} w-full text-sm`}>
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            <th className={`w-20 ${cellY} pl-2 pr-3 text-right font-medium`}>Qty</th>
            <th className={`w-16 ${cellY} pr-4 font-medium`}>Unit</th>
            <th className={`${cellY} pr-4 font-medium`}>Ingredient</th>
            {hasNotes && <th className={`w-2/5 ${cellY} pr-2 font-medium`}>Prep / Note</th>}
          </tr>
        </thead>
        <tbody>
          {node.items.map((ri) => {
            // Roll the scaled amount up into its natural unit (oz→lb, sub-oz→g,
            // fl oz→qt→gal) so cooks read "3 lb" not "48 oz".
            const m = displayMeasure(ri.quantity * totalBatches, ri.unit, weightInGrams);
            return (
              <tr key={ri.id} className="even:bg-zinc-100/80">
                <td className={`${cellY} pl-2 pr-3 text-right font-semibold tabular-nums text-zinc-900`}>{num(m.qty)}</td>
                <td className={`${cellY} pr-4 text-zinc-600`}>{m.label}</td>
                <td className={`${cellY} pr-4 text-zinc-900`}>{ri.name}</td>
                {hasNotes && <td className={`${cellY} pr-2 text-zinc-500`}>{ri.note ?? ""}</td>}
              </tr>
            );
          })}
          {node.components.map((c) => {
            const child = byId.get(c.childId);
            if (!child) return null;
            // Show the sub-recipe amount in the child's own yield unit (rolled
            // up), scaled by this batch — so the line reads in the child's units.
            const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
            const m = displayMeasure(batches * child.yieldQty * totalBatches, child.yieldUnit, weightInGrams);
            const sharedRef = sharedRefs?.get(c.childId);
            return (
              <tr key={c.id} className="even:bg-zinc-100/80">
                <td className={`${cellY} pl-2 pr-3 text-right font-semibold tabular-nums text-zinc-900`}>{num(m.qty)}</td>
                <td className={`${cellY} pr-4 text-zinc-600`}>{m.label}</td>
                <td className={`${cellY} pr-4 text-zinc-900`}>{child.name} (sub-recipe)</td>
                <td className={`${cellY} pr-2 text-zinc-500`}>{sharedRef ? `pull from ${sharedRef}` : "see build below ↓"}</td>
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
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-zinc-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
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
              <SubBuild key={c.id} node={child} byId={byId} totalBatches={batches * totalBatches} depth={depth} stack={stack} sharedRefs={sharedRefs} weightInGrams={weightInGrams} />
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
// here). When the sub-recipe is in `sharedRefs` (it already has its own build
// elsewhere in this packet — a lot-stamped batch or a consolidated shared
// build), render only a pull reference so the cook doesn't rebuild what
// they've already made.
export function SubBuild({
  node,
  byId,
  totalBatches,
  depth,
  stack,
  sharedRefs,
  weightInGrams = false,
}: {
  node: RecipeTreeNode;
  byId: Map<string, RecipeTreeNode>;
  totalBatches: number;
  depth: number;
  stack: Set<string>;
  sharedRefs?: Map<string, string>;
  weightInGrams?: boolean;
}) {
  if (stack.has(node.id)) return null; // cycle guard

  const made = displayMeasure(totalBatches * node.yieldQty, node.yieldUnit, weightInGrams);
  const sharedRef = sharedRefs?.get(node.id);

  if (sharedRef) {
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
        <p className="mt-0.5 text-xs text-zinc-400">→ from {sharedRef}</p>
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
        {node.prodCode} · v{node.version} · base yield {num(node.yieldQty)} {node.yieldUnit}
      </p>

      <RecipeBuildBody node={node} byId={byId} totalBatches={totalBatches} compact depth={depth + 1} stack={nextStack} sharedRefs={sharedRefs} weightInGrams={weightInGrams} />
    </div>
  );
}
