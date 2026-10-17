import type { RecipeTreeNode } from "../components/RecipeBuild";
import { componentBatchFactor } from "./costing";

export type RecipeReference = {
  label: string;
  node: RecipeTreeNode;
  totalBatches: number;
  parents: string[];
  roots: string[];
};

export type RecipeReferencePlan = Map<string, RecipeReference>;

// Keep immediate sub-recipes inline. Deeper recipes print once at the back,
// with demand summed across every use, including any uses at the first level.
// A recipe already assigned a printed lot is sourced from that batch instead;
// its descendants are counted when that batch's own entry is visited.
export function buildRecipeReferences(
  tops: Array<{ node: RecipeTreeNode; totalBatches: number }>,
  byId: Map<string, RecipeTreeNode>,
  sharedRefs?: Map<string, string>,
): RecipeReferencePlan {
  const demand = new Map<string, {
    node: RecipeTreeNode;
    totalBatches: number;
    deep: boolean;
    parents: Set<string>;
    roots: Set<string>;
  }>();

  function walk(node: RecipeTreeNode, batches: number, depth: number, root: string, stack: Set<string>) {
    const next = new Set(stack).add(node.id);
    for (const component of node.components) {
      const child = byId.get(component.childId);
      if (!child || next.has(child.id) || sharedRefs?.has(child.id)) continue;
      const factor = componentBatchFactor(component.quantity, component.unit, child.yieldQty, child.yieldUnit);
      const childBatches = batches * factor.batches;
      const entry = demand.get(child.id) ?? {
        node: child, totalBatches: 0, deep: false,
        parents: new Set<string>(), roots: new Set<string>(),
      };
      entry.totalBatches += childBatches;
      entry.deep ||= depth + 1 >= 2;
      entry.parents.add(node.name);
      entry.roots.add(root);
      demand.set(child.id, entry);
      walk(child, childBatches, depth + 1, root, next);
    }
  }

  for (const top of tops) walk(top.node, top.totalBatches, 0, top.node.name, new Set());

  const references: RecipeReferencePlan = new Map();
  for (const entry of demand.values()) {
    if (!entry.deep) continue;
    references.set(entry.node.id, {
      label: `A.${references.size + 1}`,
      node: entry.node,
      totalBatches: entry.totalBatches,
      parents: [...entry.parents],
      roots: [...entry.roots],
    });
  }
  return references;
}
