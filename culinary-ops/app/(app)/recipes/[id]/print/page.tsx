import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { effectiveAllergens } from "@/lib/allergens";
import { recipeCostSheet } from "@/lib/recipe-cost-sheet";
import { PrintButton } from "@/components/PrintButton";
import { RecipeDossier, RecipeDossierWorkspace, RecipePrintSettings, type MiseLine } from "@/components/RecipeDossier";
import { RecipeCosting } from "@/components/RecipeCosting";

const BATCH_OPTIONS = [1, 2, 4] as const;
export default async function RecipePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scale?: string | string[]; costs?: string | string[] }>;
}) {
  const [{ id }, { scale: requestedScale, costs: requestedCosts }] = await Promise.all([params, searchParams]);
  await requireUser();
  const showCosts = requestedCosts === "1";

  const [recipe, allRecipes] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id },
      include: {
        items: { include: { item: true }, orderBy: { item: { name: "asc" } } },
        components: { include: { child: true }, orderBy: { child: { name: "asc" } } },
      },
    }),
    // Retain recursive allergen inheritance, including nested sub-recipes.
    prisma.recipe.findMany({
      select: {
        id: true, allergens: true, yieldQty: true, yieldUnit: true,
        items: { select: { quantity: true, unit: true, item: { select: { allergens: true, unitCost: true, unit: true } } } },
        components: { select: { childId: true, quantity: true, unit: true } },
      },
    }),
  ]);
  if (!recipe) notFound();

  const scale = requestedScale === "2" ? 2 : requestedScale === "4" ? 4 : 1;
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  const allergenKeys = effectiveAllergens(recipe.id, byId);
  const costs = showCosts ? recipeCostSheet(recipe, allRecipes, scale) : null;
  const lines: MiseLine[] = [
    ...recipe.components.map((component) => ({
      id: component.id, name: component.child.name, quantity: component.quantity,
      unit: component.unit, subRecipe: true,
      note: `Sub-recipe · ${component.child.prodCode}${component.note ? ` — ${component.note}` : ""}`,
    })),
    ...recipe.items.map((ri) => ({
      id: ri.id, name: ri.item.name, quantity: ri.quantity, unit: ri.unit,
      category: ri.item.category, note: ri.note,
    })),
  ];

  return (
    <div className="recipe-print mx-auto max-w-[8.5in] text-ink">
      <RecipePrintSettings />

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-zinc-600 hover:text-ink hover:underline">
          ← Back to recipe
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Recipe print content" className="flex items-center gap-1 rounded-full border border-hairline bg-canvas p-1">
            {[{ label: "Kitchen copy", costs: false }, { label: "With costing", costs: true }].map((option) => (
              <Link
                key={option.label}
                href={`/recipes/${recipe.id}/print?scale=${scale}${option.costs ? "&costs=1" : ""}`}
                aria-current={option.costs === showCosts ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${option.costs === showCosts ? "bg-[#2C3E35] text-white" : "text-zinc-600 hover:bg-cream hover:text-ink"}`}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Recipe batch scale" className="flex items-center gap-1 rounded-full border border-hairline bg-canvas p-1">
            {BATCH_OPTIONS.map((batch) => (
              <Link
                key={batch}
                href={`/recipes/${recipe.id}/print?scale=${batch}${showCosts ? "&costs=1" : ""}`}
                aria-label={`${batch} times standard batch`}
                aria-current={batch === scale ? "page" : undefined}
                className={`rounded-full px-3 py-1 font-mono text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${batch === scale ? "bg-[#2C3E35] text-white" : "text-zinc-600 hover:bg-cream hover:text-ink"}`}
              >
                {batch}×
              </Link>
            ))}
          </nav>
          <PrintButton label={showCosts ? "Print recipe with costing" : "Print recipe dossier"} />
        </div>
      </div>

      <div className="recipe-sheet-scroll">
        <RecipeDossier recipe={recipe} scale={scale} allergenKeys={allergenKeys}
          lines={lines} titleLevel={1}>
          <RecipeDossierWorkspace recipe={recipe} lines={lines} scale={scale} />
          {costs && <RecipeCosting costs={costs} />}
        </RecipeDossier>
      </div>
    </div>
  );
}
