import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { buildCostMap, buildPriceGapMap, costPerServing, foodCostPct } from "@/lib/costing";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createRecipe } from "./actions";
import { RecipesTable } from "./RecipesTable";

const CATEGORIES = ["Starter", "Entrée", "Side", "Dessert", "Sauce", "Prep/Build", "Beverage", "Other"];

export default async function RecipesPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const recipes = await prisma.recipe.findMany({
    include: {
      items: { include: { item: true } },
      components: { select: { childId: true, quantity: true, unit: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Cost map includes nested sub-recipes (built across the whole catalog).
  const costMap = buildCostMap(recipes);
  // Price gaps anywhere in each recipe's tree (nested sub-recipes included) —
  // its cost is only trustworthy when there are no unpriced/stale ingredients.
  const gapMap = buildPriceGapMap(
    recipes.map((r) => ({
      id: r.id,
      items: r.items.map((ri) => ({ itemId: ri.item.id, unitCost: ri.item.unitCost, priceUpdatedAt: ri.item.priceUpdatedAt })),
      components: r.components,
    })),
  );

  const rows = recipes.map((r) => {
    const cost = costMap.get(r.id) ?? 0;
    const perServing = costPerServing(cost, r.yieldQty);
    const gap = gapMap.get(r.id);
    return {
      id: r.id,
      name: r.name,
      station: r.station,
      category: r.category,
      cost,
      perServing,
      menuPrice: r.menuPrice,
      fcp: foodCostPct(perServing, r.menuPrice),
      unpriced: gap?.unpriced.size ?? 0,
      stale: gap?.stale.size ?? 0,
    };
  });

  return (
    <div>
      <PageHeader
        title="Recipes & Builds"
        subtitle="Standardized recipes with ingredient costing and margins."
      />

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ New recipe</summary>
          <Card className="mt-2 p-4">
            <form action={createRecipe} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Name">
                  <Input name="name" required placeholder="Spaghetti Carbonara" />
                </Field>
                <Field label="Category">
                  <Select name="category" defaultValue="Entrée">
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Station">
                  <Input name="station" placeholder="Pasta, Grill, Bar…" />
                </Field>
                <Field label="Yield Qty">
                  <Input name="yieldQty" type="number" step="0.1" min="0.1" defaultValue={1} />
                </Field>
                <Field label="Yield Unit">
                  <Input name="yieldUnit" defaultValue="servings" />
                </Field>
                <Field label="Menu Price ($)">
                  <Input name="menuPrice" type="number" step="0.01" min="0" placeholder="optional" />
                </Field>
              </div>
              <Button type="submit">Create & add ingredients →</Button>
            </form>
          </Card>
        </details>
      )}

      <RecipesTable rows={rows} />

      <p className="mt-3 text-xs text-zinc-400">
        Food cost % targets: <span className="text-emerald-600">≤30% good</span> ·{" "}
        <span className="text-amber-600">30–38% watch</span> · <span className="text-red-600">&gt;38% high</span>
      </p>
    </div>
  );
}
