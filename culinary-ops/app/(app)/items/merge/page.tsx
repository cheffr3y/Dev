import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ingredientReplacementPreview } from "@/lib/ingredient-replacement";
import { money, num } from "@/lib/costing";
import { AllergenBadges } from "@/components/AllergenBadges";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { applyIngredientReplacement } from "../actions";

export default async function IngredientMergePage({ searchParams }: { searchParams: Promise<{ source?: string; target?: string; error?: string }> }) {
  await requireRole("MANAGER");
  const { source, target, error } = await searchParams;
  if (!source || !target || source === target) return <div><PageHeader title="Compare ingredients" subtitle="Choose two different ingredients to compare." /><Link href="/items/cleanup" className="text-blue-600 underline">Choose ingredients →</Link></div>;
  let preview;
  try { preview = await ingredientReplacementPreview(prisma, source, target); }
  catch { return <div><PageHeader title="Comparison unavailable" subtitle="An ingredient may have been removed. Refresh the ingredient list." /><Link href="/items/cleanup" className="text-blue-600 underline">Back to cleanup</Link></div>; }
  const conflicts = preview.plan.some(line => line.error);
  return <div className="space-y-6">
    <Link href="/items/cleanup" className="text-sm text-blue-600 hover:underline">← Ingredient cleanup</Link>
    <PageHeader title="Compare and replace" subtitle="Review the ingredient to keep and every affected recipe before applying." />
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid gap-5 md:grid-cols-2">{[preview.source, preview.target].map((item, index) => <Card key={item.id}><CardHeader>{index === 0 ? "Replace this ingredient" : "Keep this ingredient"}</CardHeader><div className="space-y-2 p-5"><h2 className="font-display text-2xl">{item.name}</h2><p>{money(item.unitCost, 5)} / {item.unit}</p><p className="text-sm text-zinc-500">{item.vendor?.name ?? "No vendor"} · Item # {item.sku ?? "—"} · GCODE {item.gcode ?? "—"}</p><p className="text-sm">Pack: {item.packQty != null ? `${num(item.packQty)} ${item.packUnit ?? item.unit}` : item.packSize ?? "—"}</p>{item.packSize && item.packQty != null && <p className="text-xs text-zinc-500">{item.packSize}</p>}<p className="text-sm">Usable yield factor: {num(item.yieldFactor)}</p><AllergenBadges allergens={item.allergens} /><Link className="block text-sm text-blue-600 underline" href={`/items/${item.id}`}>View full details and usage</Link></div></Card>)}</div>
    <Card className="overflow-x-auto"><CardHeader>Affected recipes ({preview.plan.length})</CardHeader><table className="w-full text-left text-sm"><thead className="bg-stone"><tr><th className="p-4">Recipe</th><th className="p-4">Current amount</th><th className="p-4">Result</th></tr></thead><tbody>{preview.plan.map(line => <tr key={line.source.id} className="border-t border-hairline"><td className="p-4"><Link href={`/recipes/${line.source.recipeId}`} className="text-blue-600 underline">{line.source.recipe.name}</Link></td><td className="p-4">{num(line.source.quantity)} {line.source.unit}{line.source.note && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{line.source.note}</p>}</td><td className="p-4">{line.error ? <span className="text-red-600">{line.error}</span> : <>{num(line.quantity)} {line.unit}{line.target && <span className="block text-xs text-zinc-500">Includes existing {preview.target.name} line.</span>}{line.note && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{line.note}</p>}</>}</td></tr>)}</tbody></table>{preview.plan.length === 0 && <p className="p-5 text-sm text-zinc-500">No recipes currently use the old ingredient.</p>}</Card>
    <Card className="p-5"><p className="mb-4 text-sm">The kept ingredient retains its price, vendor, codes, and pack information. Historical packets and accounting snapshots retain their captured contents.</p>
      <p className="mb-4 text-sm text-zinc-500">Other uses of the old ingredient: {preview.source._count.inventoryItems} inventory entries · {preview.source._count.orderGuideLines} order-guide lines · {preview.source._count.festivalOnHand} festival counts. Recipe replacement does not move these.</p>
      <form action={applyIngredientReplacement} className="space-y-4">
        <input type="hidden" name="source" value={source} /><input type="hidden" name="target" value={target} /><input type="hidden" name="fingerprint" value={preview.fingerprint} />
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="removeSource" disabled={preview.otherUses > 0} /><span>These are the same product: consolidate the records and remove the old ingredient after replacing its recipes. Allergen tags from both records will be kept.</span></label>
        {preview.otherUses > 0 && <p className="text-xs text-amber-700">Consolidation requires resolving the old ingredient’s other usage first. You can still replace its recipes.</p>}
        <Button type="submit" disabled={conflicts}>Apply reviewed replacement</Button>
      </form>
    </Card>
  </div>;
}
