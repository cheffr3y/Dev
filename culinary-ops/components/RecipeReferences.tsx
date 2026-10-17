import { RecipeBuildBody, type RecipeTreeNode } from "./RecipeBuild";
import { num } from "@/lib/costing";
import { displayMeasure } from "@/lib/units";
import type { RecipeReferencePlan } from "@/lib/recipe-references";

export function RecipeReferences({ references, byId, sharedRefs, weightInGrams = false }: {
  references: RecipeReferencePlan;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs?: Map<string, string>;
  weightInGrams?: boolean;
}) {
  if (references.size === 0) return null;

  return (
    <section className="mt-10 print:break-before-page" aria-label="Sub-recipe references">
      <div className="break-inside-avoid border-b-2 border-zinc-900 pb-2">
        <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900">Sub-recipe references</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Deeper supporting recipes. Amounts show total demand in this packet; use prepared stock when available.
        </p>
      </div>
      <div className="mt-6 space-y-8">
        {[...references.values()].map((reference) => {
          const { node } = reference;
          const needed = displayMeasure(reference.totalBatches * node.yieldQty, node.yieldUnit, weightInGrams);
          return (
            <article key={node.id} id={`recipe-reference-${node.id}`} className="break-inside-avoid border-t border-zinc-400 pt-3">
              <p className="text-xs font-semibold text-zinc-900">
                Reference {reference.label} · Sub-recipe of {reference.parents.join(" · ")}
              </p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-lg font-semibold text-zinc-900">{node.name}</h3>
                <p className="text-sm font-semibold text-zinc-900">Total needed: {num(needed.qty)} {needed.label}</p>
              </div>
              <p className="mt-1 text-xs text-zinc-600">Used in: {reference.roots.join(" · ")}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {node.prodCode} · v{node.version} · base yield {num(node.yieldQty)} {node.yieldUnit}
              </p>
              <RecipeBuildBody
                node={node} byId={byId} totalBatches={reference.totalBatches}
                compact depth={1} stack={new Set([node.id])}
                sharedRefs={sharedRefs} weightInGrams={weightInGrams} references={references}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
