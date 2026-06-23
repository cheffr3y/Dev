"use client";

import { useState } from "react";
import { RecipePicker } from "@/components/RecipePicker";
import { Button, Field, Input, Select } from "@/components/ui";
import { allowedUnitsFor, defaultUnitFor, unitFamily, unitLabel } from "@/lib/units";
import { addBanquetMenuItem } from "./actions";

type Recipe = { id: string; name: string; prodCode: string; yieldQty: number; yieldUnit: string };

const FAMILY_HINT: Record<string, string> = {
  volume: "Liquid — order by volume",
  weight: "Dry — order by weight",
  count: "Order by count",
};

// Add a BEO food line. The unit dropdown is locked to the selected recipe's
// base (yield) unit family — most plated dishes yield in "servings", so you
// order the headcount; liquids order by volume, dry goods by weight.
export function AddBanquetItemForm({ banquetId, recipes }: { banquetId: string; recipes: Recipe[] }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const units = recipe ? allowedUnitsFor(recipe.yieldUnit) : [];
  const family = recipe ? unitFamily(recipe.yieldUnit) : null;

  return (
    <form action={addBanquetMenuItem} className="space-y-3">
      <input type="hidden" name="banquetId" value={banquetId} />
      <Field label="Recipe search">
        <RecipePicker recipes={recipes} onSelect={(r) => setRecipe(r as Recipe | null)} />
      </Field>

      <div className="flex items-end gap-3">
        <div className="w-28">
          <Field label="Ordered">
            <Input name="orderedQty" type="number" step="0.01" min="0.01" defaultValue={1} required disabled={!recipe} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Unit">
            {/* Remount on recipe change so the locked default unit applies. */}
            <Select
              key={recipe?.id ?? "none"}
              name="unit"
              required
              disabled={!recipe}
              defaultValue={recipe ? defaultUnitFor(recipe.yieldUnit) : ""}
            >
              {recipe ? (
                units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))
              ) : (
                <option value="">—</option>
              )}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="Description / prep note (optional)">
        <Input name="description" placeholder="e.g. prefers sticks, not promised 5pm" disabled={!recipe} />
      </Field>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {recipe
            ? `Scales the recipe by the ordered amount (base unit ${unitLabel(recipe.yieldUnit)})${
                family && FAMILY_HINT[family] ? ` · ${FAMILY_HINT[family]}` : ""
              }.`
            : "Pick a recipe to set the ordered quantity."}
        </p>
        <Button type="submit" disabled={!recipe}>
          Add line
        </Button>
      </div>
    </form>
  );
}
