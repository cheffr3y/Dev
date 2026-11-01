import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { effectiveAllergens } from "@/lib/recipes/allergens";
import { buildPriceGapMap } from "@/lib/recipes/costing";
import { CostAuditStamp } from "@/components/CostAudit";
import { recipeCostSheet } from "@/lib/recipes/recipe-cost-sheet";
import { PrintController, PrintOptionLink } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";
import { printScale, printOptionHref, type PrintQuery } from "@/lib/printing/print-options";
import { RecipeDossier, RecipeDossierWorkspace, type MiseLine } from "@/components/RecipeDossier";
import { RecipeCosting } from "@/components/RecipeCosting";

export default async function RecipePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PrintQuery & { costs?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireUser();
  const showCosts = query.costs === "1";

  const [recipe, allRecipes] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id },
      include: {
        items: { include: { item: true }, orderBy: [{ sortOrder: "asc" }, { item: { name: "asc" } }] },
        components: { include: { child: true }, orderBy: { child: { name: "asc" } } },
      },
    }),
    // Retain recursive allergen inheritance, including nested sub-recipes.
    prisma.recipe.findMany({
      select: {
        id: true, allergens: true, yieldQty: true, yieldUnit: true,
        items: { select: { quantity: true, unit: true, item: { select: { id: true, priceUpdatedAt: true, allergens: true, unitCost: true, unit: true } } } },
        components: { select: { childId: true, quantity: true, unit: true } },
      },
    }),
  ]);
  if (!recipe) notFound();

  const scale = printScale(query.scale);
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  const allergenKeys = effectiveAllergens(recipe.id, byId);
  const costs = showCosts ? recipeCostSheet(recipe, allRecipes, scale) : null;
  const gap = showCosts ? buildPriceGapMap(allRecipes.map(node => ({ id: node.id, components: node.components, items: node.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })) }))).get(id) : null;
  const lines: MiseLine[] = [
    ...recipe.components.map((component) => ({
      id: component.id, name: component.child.name, quantity: component.quantity,
      unit: component.unit, subRecipe: true,
      note: `Sub-recipe · ${component.child.prodCode}${component.note ? ` — ${component.note}` : ""}`,
    })),
    ...recipe.items.map((ri) => ({
      id: ri.id, name: ri.item.name, quantity: ri.quantity, unit: ri.unit,
      category: ri.item.category, groupName: ri.groupName, sortOrder: ri.sortOrder, note: ri.note,
    })),
  ];

  return (
    <PrintController className="recipe-print mx-auto max-w-[8.5in] text-ink" allowScale scale={scale} label={showCosts ? "Print recipe with costing" : "Print recipe dossier"}>

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-zinc-600 hover:text-ink hover:underline">
          ← Back to recipe
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Recipe print content" className="flex items-center gap-1 rounded-full border border-hairline bg-canvas p-1">
            {[{ label: "Kitchen copy", costs: false }, { label: "With costing", costs: true }].map((option) => (
              <PrintOptionLink
                key={option.label}
                href={printOptionHref(`/recipes/${recipe.id}/print?scale=${scale}${option.costs ? "&costs=1" : ""}`, query.density)}
                aria-current={option.costs === showCosts ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${option.costs === showCosts ? "bg-[#2C3E35] text-white" : "text-zinc-600 hover:bg-cream hover:text-ink"}`}
              >
                {option.label}
              </PrintOptionLink>
            ))}
          </nav>

        </div>
      </div>

      <PrintSpecHeader venue="Company-wide" title={recipe.name} targetLabel={scale === 1 ? "Standard recipe" : "Scaled production copy"} printedAt={new Date()} />
      <div className="recipe-sheet-scroll">
        <RecipeDossier recipe={recipe} scale={scale} allergenKeys={allergenKeys}
          lines={lines} titleLevel={1} footerNote={costs && <CostAuditStamp unpriced={gap?.unpriced.size ?? 0} stale={gap?.stale.size ?? 0} />}>
          <RecipeDossierWorkspace recipe={recipe} lines={lines} scale={scale} />
          {costs && <RecipeCosting costs={costs} />}
        </RecipeDossier>
      </div>
    </PrintController>
  );
}
