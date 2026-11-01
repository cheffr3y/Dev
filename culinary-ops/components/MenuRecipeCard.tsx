import { num } from "@/lib/recipes/costing";
import { unitLabel } from "@/lib/recipes/units";
import { platedServingSpec } from "@/lib/menus/menu-rollout";
import { RecipeDossier, type DossierRecipe, type MiseLine } from "./RecipeDossier";

type MenuCardRecipe = DossierRecipe & {
  items: Array<{
    id: string; quantity: number; unit: string; note: string | null;
    groupName?: string | null; sortOrder?: number;
    item: { name: string; category: string };
  }>;
  components: Array<{
    id: string; quantity: number; unit: string; note: string | null;
    child: { name: string; prodCode: string };
  }>;
};

export function MenuRecipeCard({ recipe, kind, openingParBatches, context, id, allergenKeys, printedAt }: {
  recipe: MenuCardRecipe;
  kind: "plated" | "foundation";
  openingParBatches?: number;
  context: string;
  id: string;
  allergenKeys: string[];
  printedAt: Date;
}) {
  const serving = kind === "plated" ? platedServingSpec(recipe) : null;
  const scale = serving?.scale ?? 1;
  const displayRecipe = serving ? { ...recipe, yieldQty: 1, yieldUnit: "serving" } : recipe;
  const lines: MiseLine[] = [
    ...recipe.components.map(component => ({
      id: component.id, name: component.child.name, quantity: component.quantity * scale,
      unit: component.unit, subRecipe: true,
      note: `Sub-recipe · ${component.child.prodCode}${component.note ? ` — ${component.note}` : ""}`,
    })),
    ...recipe.items.map(line => ({
      id: line.id, name: line.item.name, quantity: line.quantity * scale, unit: line.unit,
      note: line.note, category: line.item.category, groupName: line.groupName, sortOrder: line.sortOrder,
    })),
  ];
  const yieldUnit = unitLabel(recipe.yieldUnit);
  return <RecipeDossier id={id} recipe={displayRecipe} scale={1}
    batchLabel={serving ? "1× Single-Serving" : "1× Standard Batch"} allergenKeys={allergenKeys}
    lines={lines} printedAt={printedAt} className="launch-recipe-sheet" context={<>
      <p>{context}</p>
      <p className="recipe-opening-prep mt-1 font-mono text-[10px] text-[#2C3E35]">
        {serving ? "Pickup spec: 1 serving" : `Standard batch: ${num(recipe.yieldQty)} ${yieldUnit}`}
        {kind === "plated" && openingParBatches != null && <span className="recipe-opening-par text-zinc-500"> · Opening Par Target: {num((serving?.servings ?? recipe.yieldQty) * openingParBatches)} {serving ? "servings" : yieldUnit}</span>}
      </p>
      {kind === "plated" && !serving && <p className="mt-1 font-semibold text-amber-900">Serving yield needs review: the saved yield does not specify a positive serving count. Standard batch shown.</p>}
      {kind === "foundation" && recipe.yieldQty <= 0 && <p className="mt-1 font-semibold text-amber-900">Verify the saved standard batch yield before production.</p>}
    </>} />;
}
