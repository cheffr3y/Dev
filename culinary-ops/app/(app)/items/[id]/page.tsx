import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { duplicateIngredientGroups } from "@/lib/ingredient-cleanup";
import { IngredientFields } from "@/components/IngredientFields";
import { AllergenBadges } from "@/components/AllergenBadges";
import { Button, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { updateItem } from "../actions";

export default async function IngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const [item, vendors, items] = await Promise.all([
    prisma.item.findUnique({ where: { id }, include: {
      vendor: true, recipeItems: { include: { recipe: { select: { id: true, name: true } } }, orderBy: { recipe: { name: "asc" } } },
      inventoryItems: { include: { venue: { select: { name: true } } } },
      orderGuideLines: { include: { orderGuide: { select: { id: true, name: true } } } },
      festivalOnHand: { include: { festival: { select: { name: true } } } },
    } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.item.findMany({ select: { id: true, name: true } }),
  ]);
  if (!item) notFound();
  const duplicates = duplicateIngredientGroups(items).find(group => group.some(candidate => candidate.id === id))?.filter(candidate => candidate.id !== id) ?? [];
  return <div className="space-y-6">
    <Link href="/items" className="text-sm text-blue-600 hover:underline">← Ingredients</Link>
    <PageHeader title={item.name} subtitle={`${item.category} · ${item.vendor?.name ?? "No vendor"} · ${money(item.unitCost, 5)} / ${item.unit}`}
      action={canEdit ? <LinkButton href={`/items/cleanup?source=${id}`}>Replace / consolidate</LinkButton> : undefined} />
    {duplicates.length > 0 && <Card className="border-amber-300 bg-amber-50 p-4"><p className="font-medium">Possible duplicates</p><div className="mt-2 flex flex-wrap gap-3">{duplicates.map(candidate => <Link key={candidate.id} href={canEdit ? `/items/merge?source=${id}&target=${candidate.id}` : `/items/${candidate.id}`} className="text-sm text-blue-600 underline">Compare {candidate.name}</Link>)}</div></Card>}
    <Card><CardHeader>Ingredient details</CardHeader>{canEdit ? <form id="ingredientForm" action={updateItem} className="space-y-5 p-5"><input type="hidden" name="id" value={item.id} /><IngredientFields item={item} vendors={vendors} /><Button type="submit">Save</Button></form> : <div className="p-5"><AllergenBadges allergens={item.allergens} /><p className="mt-3 text-sm text-zinc-500">Item # {item.sku ?? "—"} · GCODE {item.gcode ?? "—"} · Pack {item.packSize ?? "—"}</p></div>}</Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader>Recipes using this ingredient ({item.recipeItems.length})</CardHeader>{item.recipeItems.length ? <ul className="divide-y divide-hairline">{item.recipeItems.map(line => <li key={line.id} className="flex justify-between gap-4 p-4 text-sm"><Link href={`/recipes/${line.recipe.id}`} className="text-blue-600 hover:underline">{line.recipe.name}</Link><span className="font-mono">{num(line.quantity)} {line.unit}</span></li>)}</ul> : <p className="p-5 text-sm text-zinc-500">No current recipe uses.</p>}</Card>
      <Card><CardHeader>Other usage</CardHeader><div className="space-y-3 p-5 text-sm">
        <p>Inventory: {item.inventoryItems.length} · Order guides: {item.orderGuideLines.length} · Festival counts: {item.festivalOnHand.length}</p>
        {item.inventoryItems.map(line => <p key={line.id}>{line.venue.name}: {num(line.quantity)} {line.unit} on hand</p>)}
        {item.orderGuideLines.map(line => <Link className="block text-blue-600 hover:underline" href={`/order-guides/${line.orderGuide.id}`} key={line.id}>{line.orderGuide.name}</Link>)}
        {item.festivalOnHand.map(line => <p key={line.id}>{line.festival.name}: {num(line.quantity)} {line.unit}</p>)}
      </div></Card>
    </div>
  </div>;
}
