import { preciseNum } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
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

export function MenuRecipeCard({ recipe, scale, context, id, allergenKeys, printedAt, converted = true }: {
  recipe: MenuCardRecipe;
  scale: number;
  context: string;
  id: string;
  allergenKeys: string[];
  printedAt: Date;
  converted?: boolean;
}) {
  const lines: MiseLine[] = [
    ...recipe.components.map(component => ({
      id: component.id, name: component.child.name, quantity: component.quantity,
      unit: component.unit, subRecipe: true,
      note: `Sub-recipe · ${component.child.prodCode}${component.note ? ` — ${component.note}` : ""}`,
    })),
    ...recipe.items.map(line => ({
      id: line.id, name: line.item.name, quantity: line.quantity, unit: line.unit,
      note: line.note, category: line.item.category, groupName: line.groupName, sortOrder: line.sortOrder,
    })),
  ];
  const yieldUnit = unitLabel(recipe.yieldUnit);
  return <RecipeDossier id={id} recipe={recipe} scale={scale} allergenKeys={allergenKeys}
    lines={lines} printedAt={printedAt} className="launch-recipe-sheet" context={<>
      <p>{context}</p>
      <p className="recipe-opening-prep mt-1 font-mono text-[10px] text-[#2C3E35]">
        Opening prep: {preciseNum(scale)}× · Target yield: {preciseNum(recipe.yieldQty * scale)} {yieldUnit}
        <span className="text-zinc-500"> · Standard batch: {preciseNum(recipe.yieldQty)} {yieldUnit}</span>
      </p>
      {scale === 0 && <p className="mt-1 text-zinc-500">No opening prep planned for this recipe.</p>}
      {(!converted || recipe.yieldQty <= 0) && <p className="mt-1 font-semibold text-amber-900">Verify component units and recipe yield before production; these quantities use the same conversion fallback as the order guide.</p>}
    </>} />;
}
