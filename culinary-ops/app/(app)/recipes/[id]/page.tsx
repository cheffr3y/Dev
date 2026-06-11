import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { recipeCost, costPerServing, foodCostPct, lineCost, money, pct, num } from "@/lib/costing";
import { UNIT_OPTIONS, unitLabel } from "@/lib/units";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, StatCard, Textarea } from "@/components/ui";
import { addRecipeItem, removeRecipeItem, updateRecipe, deleteRecipe } from "../actions";

const CATEGORIES = ["Starter", "Entrée", "Side", "Dessert", "Sauce", "Prep/Build", "Beverage", "Other"];

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [recipe, items] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id },
      include: { items: { include: { item: true }, orderBy: { item: { name: "asc" } } } },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!recipe) notFound();

  const cost = recipeCost(recipe.items);
  const perServing = costPerServing(cost, recipe.yieldQty);
  const fcp = foodCostPct(perServing, recipe.menuPrice);
  const margin = recipe.menuPrice ? recipe.menuPrice - perServing : null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/recipes" className="text-sm text-blue-600 hover:underline">
          ← Recipes
        </Link>
      </div>
      <PageHeader
        title={recipe.name}
        subtitle={`${recipe.category}${recipe.station ? ` · ${recipe.station}` : ""} · yields ${num(recipe.yieldQty)} ${recipe.yieldUnit}`}
        action={
          <LinkButton href={`/recipes/${recipe.id}/print`} variant="secondary">
            🖨 Print recipe card
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Cost" value={money(cost)} sub={`${recipe.items.length} ingredients`} />
        <StatCard label="Cost / Serving" value={money(perServing)} />
        <StatCard label="Menu Price" value={recipe.menuPrice ? money(recipe.menuPrice) : "—"} sub={margin != null ? `${money(margin)} margin` : undefined} />
        <StatCard label="Food Cost %" value={fcp == null ? "—" : pct(fcp)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ingredients */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>Ingredients</CardHeader>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-4 py-2 text-right font-medium">Line Cost</th>
                  {canEdit && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recipe.items.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-4 py-6 text-center text-zinc-400">
                      No ingredients yet.
                    </td>
                  </tr>
                )}
                {recipe.items.map((ri) => {
                  const lc = lineCost(ri);
                  return (
                  <tr key={ri.id}>
                    <td className="px-4 py-2 text-zinc-800">
                      {ri.item.name}
                      {!lc.converted && (
                        <span
                          className="ml-2 align-middle"
                          title={`Can't convert ${unitLabel(ri.unit)} to ${unitLabel(ri.item.unit)} — cost assumes quantity is in ${unitLabel(ri.item.unit)}.`}
                        >
                          <Badge color="amber">unit mismatch</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600">
                      {num(ri.quantity)} {unitLabel(ri.unit)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-500">
                      {money(ri.item.unitCost)}/{unitLabel(ri.item.unit)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-zinc-800">
                      {money(lc.cost)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        <form action={removeRecipeItem}>
                          <input type="hidden" name="id" value={ri.id} />
                          <input type="hidden" name="recipeId" value={recipe.id} />
                          <button className="text-xs text-red-500 hover:underline">remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                  <td className="px-4 py-2 text-zinc-700" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-900">{money(cost)}</td>
                  {canEdit && <td></td>}
                </tr>
              </tfoot>
            </table>

            {canEdit && (
              <div className="border-t border-zinc-100 p-4">
                <form action={addRecipeItem} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <div className="min-w-[180px] flex-1">
                    <Field label="Add ingredient">
                      <Select name="itemId" required defaultValue="">
                        <option value="" disabled>
                          Select item…
                        </option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({money(it.unitCost)}/{it.unit})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field label="Qty">
                      <Input name="quantity" type="number" step="0.01" min="0" defaultValue={1} />
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field label="Unit">
                      <Select name="unit" defaultValue="each">
                        {UNIT_OPTIONS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.units.map((u) => (
                              <option key={u} value={u}>
                                {unitLabel(u)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button type="submit">Add</Button>
                </form>
                <p className="mt-2 text-xs text-zinc-400">
                  Quantities convert automatically within volume (tsp → gal) and weight (g → lb) units, even when
                  the item is purchased in a different unit.
                </p>
              </div>
            )}
          </Card>

          <Card className="mt-4">
            <CardHeader>Method</CardHeader>
            <div className="whitespace-pre-wrap p-4 text-sm text-zinc-700">
              {recipe.instructions || <span className="text-zinc-400">No method recorded.</span>}
            </div>
          </Card>

          {(recipe.criticalNotes || recipe.allergens) && (
            <Card className="mt-4 border-amber-300">
              <CardHeader>⚠ Critical · Food Safety</CardHeader>
              <div className="space-y-2 p-4 text-sm text-zinc-700">
                {recipe.criticalNotes && <p className="whitespace-pre-wrap">{recipe.criticalNotes}</p>}
                {recipe.allergens && (
                  <p>
                    <span className="font-medium text-zinc-800">Allergens:</span> {recipe.allergens}
                  </p>
                )}
              </div>
            </Card>
          )}

          {(recipe.storage || recipe.shelfLife) && (
            <Card className="mt-4">
              <CardHeader>Storage &amp; Shelf Life</CardHeader>
              <div className="space-y-2 p-4 text-sm text-zinc-700">
                {recipe.storage && <p className="whitespace-pre-wrap">{recipe.storage}</p>}
                {recipe.shelfLife && (
                  <p>
                    <span className="font-medium text-zinc-800">Shelf life:</span> {recipe.shelfLife}
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Edit panel */}
        {canEdit && (
          <div>
            <Card>
              <CardHeader>Edit recipe</CardHeader>
              <form action={updateRecipe} className="space-y-3 p-4">
                <input type="hidden" name="id" value={recipe.id} />
                <Field label="Name">
                  <Input name="name" required defaultValue={recipe.name} />
                </Field>
                <Field label="Category">
                  <Select name="category" defaultValue={recipe.category}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Station">
                  <Input name="station" defaultValue={recipe.station ?? ""} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Yield Qty">
                    <Input name="yieldQty" type="number" step="0.1" min="0.1" defaultValue={recipe.yieldQty} />
                  </Field>
                  <Field label="Yield Unit">
                    <Input name="yieldUnit" defaultValue={recipe.yieldUnit} />
                  </Field>
                </div>
                <Field label="Menu Price ($)">
                  <Input name="menuPrice" type="number" step="0.01" min="0" defaultValue={recipe.menuPrice ?? ""} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Prep (min)">
                    <Input name="prepMinutes" type="number" min="0" defaultValue={recipe.prepMinutes ?? ""} />
                  </Field>
                  <Field label="Cook (min)">
                    <Input name="cookMinutes" type="number" min="0" defaultValue={recipe.cookMinutes ?? ""} />
                  </Field>
                </div>
                <Field label="Method / Instructions" hint="One step per line — steps are numbered on the printed card.">
                  <Textarea name="instructions" defaultValue={recipe.instructions ?? ""} rows={6} />
                </Field>
                <Field label="Critical / Food Safety" hint="HACCP critical limits, e.g. “Cook to 165°F internal · hold above 140°F”.">
                  <Textarea name="criticalNotes" defaultValue={recipe.criticalNotes ?? ""} rows={2} />
                </Field>
                <Field label="Allergens">
                  <Input name="allergens" defaultValue={recipe.allergens ?? ""} placeholder="dairy, gluten, tree nuts" />
                </Field>
                <Field label="Storage Instructions">
                  <Textarea name="storage" defaultValue={recipe.storage ?? ""} rows={2} placeholder="Cool rapidly, store covered & labeled…" />
                </Field>
                <Field label="Shelf Life">
                  <Input name="shelfLife" defaultValue={recipe.shelfLife ?? ""} placeholder="3 days refrigerated" />
                </Field>
                <Button type="submit">Save changes</Button>
              </form>
            </Card>
            <form action={deleteRecipe} className="mt-3">
              <input type="hidden" name="id" value={recipe.id} />
              <Button type="submit" variant="danger" className="w-full">
                Delete recipe
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
