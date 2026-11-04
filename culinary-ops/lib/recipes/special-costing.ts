import { z } from "zod";
const line = z.object({ id: z.string().max(150), sourceId: z.string().min(1).max(150), quantity: z.number().finite().positive().max(1e7), unit: z.string().trim().min(1).max(40), kind: z.enum(["ingredient", "recipe"]) });
export const specialCostingSchema = z.object({ name: z.string().trim().min(1).max(200), venueId: z.string().max(150), menuPrice: z.number().finite().nonnegative().max(1e6), nodes: z.array(z.object({ id: z.string().min(1).max(150), name: z.string().trim().min(1).max(200), yieldQty: z.number().finite().positive().max(1e7), yieldUnit: z.string().trim().min(1).max(40), lines: z.array(line).max(200) })).min(1).max(40) });
export type SpecialDraft = z.infer<typeof specialCostingSchema>;
export function specialGraphProblems(nodes: {id:string;components:{childId:string}[]}[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const problems = new Set<string>(), done = new Set<string>();
  function visit(id:string, path:Set<string>) {
    if (path.has(id)) { problems.add("A sub-recipe refers back to itself. Remove the circular link before using this costing."); return; }
    if (done.has(id)) return;
    const node = byId.get(id);
    if (!node) { problems.add("A selected recipe is unavailable."); return; }
    const next = new Set(path); next.add(id);
    node.components.forEach(line => visit(line.childId, next)); done.add(id);
  }
  if(nodes[0]) visit(nodes[0].id,new Set());
  return [...problems];
}
