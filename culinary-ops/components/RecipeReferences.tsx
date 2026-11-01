import { RecipeBuildCard, type RecipeTreeNode } from "./RecipeBuild";
import { num } from "@/lib/costing";
import { displayMeasure } from "@/lib/units";
import type { RecipeReferencePlan } from "@/lib/recipe-references";

export function RecipeReferences({ references, byId, sharedRefs, weightInGrams = false, referencePrefix = "", contextLabel }: {
  references: RecipeReferencePlan;
  byId: Map<string, RecipeTreeNode>;
  sharedRefs?: Map<string, string>;
  weightInGrams?: boolean;
  referencePrefix?: string;
  contextLabel?: string;
}) {
  if (references.size === 0) return null;

  return (
    <section className="recipe-references mt-10" aria-label="Sub-recipe references">
      <div className="break-inside-avoid border-b border-hairline pb-2">
        <h2 className="font-display text-3xl italic text-[#2C3E35]">Sub-recipe references</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Deeper supporting recipes. Amounts show total demand in this packet; use prepared stock when available.
        </p>
      </div>
      <div className="mt-5 space-y-5">
        {[...references.values()].map((reference) => {
          const { node } = reference;
          const needed = displayMeasure(reference.totalBatches * node.yieldQty, node.yieldUnit, weightInGrams);
          return <RecipeBuildCard key={node.id} id={`${referencePrefix}recipe-reference-${node.id}`} referencePrefix={referencePrefix} contextLabel={contextLabel}
            node={node} byId={byId} totalBatches={reference.totalBatches}
            compact depth={1} stack={new Set()} supporting
            sharedRefs={sharedRefs} weightInGrams={weightInGrams} references={references}
            context={<>
              <p className="font-semibold text-[#2C3E35]">Reference {reference.label} · Sub-recipe of {reference.parents.join(" · ")}</p>
              <p className="mt-1">Total needed: <span className="font-mono tabular-nums">{num(needed.qty)} {needed.label}</span> · Used in: {reference.roots.join(" · ")}</p>
            </>} />;
        })}
      </div>
    </section>
  );
}
