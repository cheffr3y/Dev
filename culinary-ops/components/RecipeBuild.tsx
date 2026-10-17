// Shared scaled-recipe renderer. Banquet and commissary packets provide a
// reference plan to keep one level inline and send deeper builds to the back.
// Other guides can continue rendering the full nested tree.
//
// The whole recipe catalog is loaded as a flat map of RecipeTreeNode so a
// recipe's sub-recipes can be nested to any depth (their own ingredients, method
// and sub-builds), independent of any Prisma include depth. `totalBatches` is
// always how many full batches of THIS recipe to make — a parent's scale is
// folded into it before the child renders.

import { num, componentBatchFactor } from "@/lib/costing";
import { displayMeasure } from "@/lib/units";
import { effectiveAllergens } from "@/lib/allergens";
import { RecipeDossier, RecipeDossierWorkspace, type DossierRecipe, type MiseLine, type RecipeDossierProps } from "./RecipeDossier";
import type { RecipeReferencePlan } from "@/lib/recipe-references";

// Catalog node used for recursive sub-build rendering.
export type RecipeTreeNode = DossierRecipe & {
  allergens: string | null;
  items: Array<{ id: string; quantity: number; unit: string; note: string | null; name: string; category?: string | null }>;
  components: Array<{ id: string; childId: string; quantity: number; unit: string; note?: string | null }>;
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
  category: true,
  station: true,
  prepMinutes: true,
  cookMinutes: true,
  shelfLife: true,
  holdLifeDays: true,
  storage: true,
  updatedAt: true,
  items: {
    select: { id: true, quantity: true, unit: true, note: true, item: { select: { name: true, category: true } } },
    orderBy: { item: { name: "asc" } },
  },
  components: {
    select: { id: true, childId: true, quantity: true, unit: true, note: true },
    orderBy: { child: { name: "asc" } },
  },
} as const;

// Shape of a row returned by findMany({ select: recipeTreeSelect }).
// Older frozen snapshots lack the optional display metadata. Never hydrate
// them from today's catalog: a historical packet must stay historical.
type RecipeTreeRow = Omit<RecipeTreeNode, "items"> & {
  items: Array<{ id: string; quantity: number; unit: string; note: string | null; item: { name: string; category?: string | null } }>;
};

export function buildRecipeTree(rows: RecipeTreeRow[]): Map<string, RecipeTreeNode> {
  return new Map(rows.map((r) => [r.id, {
    ...r,
    items: r.items.map((ri) => ({
      id: ri.id, quantity: ri.quantity, unit: ri.unit, note: ri.note,
      name: ri.item.name, category: ri.item.category,
    })),
  }]));
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

// One full dossier, with operational context supplied by its packet. Supporting
// recipes follow the main sheet; they never inflate its page-height minimum.
export type RecipeBuildProps = {
  node: RecipeTreeNode;
  byId: Map<string, RecipeTreeNode>;
  totalBatches: number;
  compact: boolean;
  depth: number;
  stack: Set<string>;
  sharedRefs?: Map<string, string>;
  weightInGrams?: boolean;
  references?: RecipeReferencePlan;
};

type BuildCardProps = RecipeBuildProps & Pick<RecipeDossierProps,
  "context" | "id" | "className" | "supporting">;

export function RecipeBuildCard({ context, id, className = "", supporting = false, ...build }: BuildCardProps) {
  return (
    <>
      <RecipeDossier recipe={build.node} scale={build.totalBatches}
        allergenKeys={effectiveAllergens(build.node.id, build.byId)}
        weightInGrams={build.weightInGrams} supporting={supporting}
        context={context} id={id}
        className={`${supporting ? "" : "recipe-packet-card"} ${className}`}>
        <RecipeBuildBody {...build} renderSubBuilds={false} />
      </RecipeDossier>
      <RecipeSubBuilds {...build} />
    </>
  );
}

// Body-only remains useful for composition and tests; every route uses the
// same workspace, including notes, cues, storage and catalog category grouping.
export function RecipeBuildBody({ renderSubBuilds = true, ...build }: RecipeBuildProps & { renderSubBuilds?: boolean }) {
  const { node, byId, totalBatches, depth, sharedRefs, references, weightInGrams } = build;
  const lines: MiseLine[] = node.items.map((ri) => ({ ...ri }));
  for (const component of node.components) {
    const child = byId.get(component.childId);
    if (!child) continue;
    const { batches } = componentBatchFactor(component.quantity, component.unit, child.yieldQty, child.yieldUnit);
    const sharedRef = sharedRefs?.get(child.id);
    const reference = references && depth > 0 ? references.get(child.id) : undefined;
    lines.push({
      id: component.id, name: child.name, quantity: batches * child.yieldQty,
      unit: child.yieldUnit, subRecipe: true,
      note: <>Sub-recipe · {child.prodCode}{component.note ? ` — ${component.note}` : ""}
        <span className="block font-sans text-[9px] not-italic">
          {sharedRef ? `pull from ${sharedRef}` : reference ? (
            <a href={`#recipe-reference-${child.id}`} className="underline underline-offset-2">Reference {reference.label} at the back</a>
          ) : "see sub-recipe below ↓"}
        </span>
      </>,
    });
  }
  return <>
    <RecipeDossierWorkspace recipe={node} lines={lines} scale={totalBatches} weightInGrams={weightInGrams} />
    {renderSubBuilds && <RecipeSubBuilds {...build} />}
  </>;
}

function RecipeSubBuilds(build: RecipeBuildProps) {
  const { node, byId, totalBatches, depth, stack, sharedRefs, references } = build;
  if (references && depth > 0) return null;
  const next = new Set(stack).add(node.id);
  // The mise row already gives the pull amount and source. Do not add a
  // separate supporting page for a build that was printed elsewhere.
  const components = node.components.filter((c) => byId.has(c.childId) && !next.has(c.childId) && !sharedRefs?.has(c.childId));
  if (components.length === 0) return null;
  return (
    <section className="recipe-supporting-builds mt-5 space-y-5" aria-label={`Supporting sub-recipes for ${node.name}`}>
      <h3 className="font-display text-xl italic text-[#2C3E35]">Supporting sub-recipes</h3>
      {components.map((c) => {
        const child = byId.get(c.childId)!;
        const { batches } = componentBatchFactor(c.quantity, c.unit, child.yieldQty, child.yieldUnit);
        return <SubBuild key={c.id} {...build} node={child} totalBatches={batches * totalBatches} stack={next} parentName={node.name} />;
      })}
    </section>
  );
}

export function SubBuild({ parentName, ...build }: RecipeBuildProps & { parentName?: string }) {
  const { node, totalBatches, depth, stack, sharedRefs, weightInGrams } = build;
  if (stack.has(node.id)) return null;
  const made = displayMeasure(totalBatches * node.yieldQty, node.yieldUnit, weightInGrams);
  const sharedRef = sharedRefs?.get(node.id);
  if (sharedRef) {
    return <aside className="break-inside-avoid border-l-2 border-gold bg-[#F4F1EA] p-3 text-sm text-[#2C3E35]">
      <h3 className="font-display text-lg italic">{node.name}</h3>
      <p className="font-mono text-xs tabular-nums">pull {num(made.qty)} {made.label} → from {sharedRef}</p>
    </aside>;
  }
  return <RecipeBuildCard {...build} depth={depth + 1} compact supporting
    context={<p><span className="font-semibold">Sub-recipe of {parentName}</span> · Needed: {num(made.qty)} {made.label}</p>} />;
}

export function SharedBuildCard({ build, byId, sharedRefs, context }: {
  build: SharedSubBuild;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs: Map<string, string>;
  context?: RecipeDossierProps["context"];
}) {
  const made = displayMeasure(build.totalBatches * build.node.yieldQty, build.node.yieldUnit);
  return <RecipeBuildCard node={build.node} byId={byId} totalBatches={build.totalBatches}
    compact={false} depth={0} stack={new Set()} sharedRefs={sharedRefs}
    context={<>{context}<p>Make {num(made.qty)} {made.label} — once · Feeds: {build.usedBy.join(" · ")}</p></>} />;
}
