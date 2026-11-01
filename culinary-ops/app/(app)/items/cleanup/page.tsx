import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { duplicateIngredientGroups } from "@/lib/ingredients/ingredient-cleanup";
import { ingredientUsageSelect } from "@/lib/ingredients/ingredient-replacement";
import { money } from "@/lib/recipes/costing";
import { IngredientMergePicker } from "@/components/IngredientMergePicker";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { ingredientIntegrity } from "@/lib/dashboard/morning-pulse";

export default async function IngredientCleanupPage({ searchParams }: { searchParams: Promise<{ source?: string; done?: string }> }) {
  await requireRole("MANAGER");
  const { source, done } = await searchParams;
  const items = await prisma.item.findMany({ include: { vendor: true, _count: { select: ingredientUsageSelect } }, orderBy: { name: "asc" } });
  const groups = duplicateIngredientGroups(items);
  const unused = items.filter(item => Object.values(item._count).every(count => count === 0));
  const integrity = items.filter(item => Object.values(item._count).some(count => count > 0))
    .map(item => ({ item, issues: ingredientIntegrity(item) }))
    .filter(({ issues }) => issues.missingCost || issues.missingUnit || issues.missingVendor);
  return <div className="space-y-6">
    <Link href="/items" className="text-sm text-blue-600 hover:underline">← Ingredients</Link>
    <PageHeader title="Ingredient cleanup" subtitle={`${groups.length} possible duplicate groups · ${unused.length} unused ingredients`} />
    {done && <p role="status" className="rounded-lg border border-sage-soft bg-pale-sage p-4 text-sm">Ingredient replacement completed. Recipe quantities and prep notes were retained; any matching lines were combined using compatible units.</p>}
    <section id="price-integrity" className="scroll-mt-20">
      <Card><CardHeader><h2>Ingredient integrity ({integrity.length})</h2></CardHeader>
        <p className="px-4 py-3 text-sm text-zinc-500">In-use ingredients with missing costs, units, or vendors. Open an ingredient to correct its catalog details.</p>
        {integrity.length > 0 ? <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="px-4 py-2">Ingredient</th><th className="px-4 py-2">Needs review</th><th className="px-4 py-2">Cost basis</th></tr></thead><tbody>{integrity.map(({ item, issues }) => <tr key={item.id} className="border-t border-hairline">
          <td className="px-4 py-2"><Link href={`/items/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.name}</Link></td>
          <td className="px-4 py-2 text-amber-700">{[issues.missingCost && "Missing cost", issues.missingUnit && "Missing unit", issues.missingVendor && "No vendor"].filter(Boolean).join(" · ")}</td>
          <td className="px-4 py-2 tabular-nums">{money(item.unitCost, 5)} / {item.unit.trim() || "—"}</td>
        </tr>)}</tbody></table></div> : <p className="px-4 pb-4 text-sm text-zinc-500">All in-use ingredients have a positive cost, unit, and vendor.</p>}
      </Card>
    </section>
    <Card className="p-5"><h2 className="mb-4 font-display text-xl">Choose ingredients to compare</h2><IngredientMergePicker sourceId={source} items={items.map(item => ({ id: item.id, name: item.name, meta: `${item._count.recipeItems} recipes · ${item.vendor?.name ?? "No vendor"} · ${money(item.unitCost, 5)}/${item.unit}` }))} /></Card>
    <p className="text-sm text-zinc-500">Name order, punctuation, and common plurals help find candidates. Compare the product, vendor, code, and measurement basis before treating two records as the same ingredient.</p>
    {groups.length === 0 && <Card className="p-5 text-sm text-zinc-500">No matching-name duplicate groups found. You can still compare differently named ingredients above.</Card>}
    {groups.map(group => <Card key={group[0].id} className="overflow-x-auto"><CardHeader>{group.map(item => item.name).join(" / ")}</CardHeader><table className="w-full text-left text-sm"><thead className="bg-stone text-xs text-zinc-500"><tr>{["Ingredient", "Vendor / codes", "Cost basis", "Recipes", "Other uses", "Compare"].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{group.map(item => <tr key={item.id} className="border-t border-hairline">
      <td className="p-4"><Link href={`/items/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.name}</Link></td><td className="p-4">{item.vendor?.name ?? "—"}<span className="block font-mono text-xs text-zinc-500">{item.sku ?? "—"} · {item.gcode ?? "—"}</span></td><td className="p-4">{money(item.unitCost, 5)} / {item.unit}</td><td className="p-4">{item._count.recipeItems}</td><td className="p-4">{item._count.inventoryItems + item._count.orderGuideLines + item._count.festivalOnHand}</td><td className="space-y-1 p-4">{group.filter(target => target.id !== item.id).map(target => <Link key={target.id} href={`/items/merge?source=${item.id}&target=${target.id}`} className="block text-blue-600 hover:underline">Keep {target.name} →</Link>)}</td>
    </tr>)}</tbody></table></Card>)}
    <Card><CardHeader>Unused ingredients ({unused.length})</CardHeader><p className="px-5 text-sm text-zinc-500">These have no current recipe, inventory, order-guide, or festival-count references.</p><ul className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">{unused.map(item => <li key={item.id}><Link href={`/items/${item.id}`} className="text-sm text-blue-600 hover:underline">{item.name}</Link></li>)}</ul></Card>
  </div>;
}
