import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { buildCostMap, costPerServing, foodCostPct, money, pct } from "@/lib/costing";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createRecipe } from "./actions";

const CATEGORIES = ["Starter", "Entrée", "Side", "Dessert", "Sauce", "Prep/Build", "Beverage", "Other"];

export default async function RecipesPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const recipes = await prisma.recipe.findMany({
    include: {
      items: { include: { item: true } },
      components: { select: { childId: true, quantity: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Cost map includes nested sub-recipes (built across the whole catalog).
  const costMap = buildCostMap(recipes);

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

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
            <tr>
              <th className="px-6 py-4 font-medium">Recipe</th>
              <th className="px-6 py-4 font-medium">Category</th>
              <th className="px-6 py-4 text-right font-medium">Cost</th>
              <th className="px-6 py-4 text-right font-medium">$ / {""}serving</th>
              <th className="px-6 py-4 text-right font-medium">Menu</th>
              <th className="px-6 py-4 text-right font-medium">Food %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {recipes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No recipes yet.
                </td>
              </tr>
            )}
            {recipes.map((r) => {
              const cost = costMap.get(r.id) ?? 0;
              const perServing = costPerServing(cost, r.yieldQty);
              const fcp = foodCostPct(perServing, r.menuPrice);
              return (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <Link href={`/recipes/${r.id}`} className="font-medium text-zinc-800 hover:underline">
                      {r.name}
                    </Link>
                    {r.station && <span className="ml-2 text-xs text-zinc-400">{r.station}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <Badge>{r.category}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right text-zinc-600">{money(cost)}</td>
                  <td className="px-6 py-4 text-right text-zinc-600">{money(perServing)}</td>
                  <td className="px-6 py-4 text-right text-zinc-600">{r.menuPrice ? money(r.menuPrice) : "—"}</td>
                  <td className="px-6 py-4 text-right">
                    {fcp == null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <Badge color={fcp <= 30 ? "green" : fcp <= 38 ? "amber" : "red"}>{pct(fcp)}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-zinc-400">
        Food cost % targets: <span className="text-emerald-600">≤30% good</span> ·{" "}
        <span className="text-amber-600">30–38% watch</span> · <span className="text-red-600">&gt;38% high</span>
      </p>
    </div>
  );
}
