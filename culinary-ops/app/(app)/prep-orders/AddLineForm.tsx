"use client";

import { useState } from "react";
import { RecipePicker } from "@/components/RecipePicker";
import { Button, Field, Input, Select } from "@/components/ui";
import { allowedUnitsFor, defaultUnitFor, unitFamily, unitLabel } from "@/lib/units";
import { addPrepLine } from "./actions";

type Recipe = { id: string; name: string; prodCode: string; yieldUnit: string };

const FAMILY_HINT: Record<string, string> = {
  volume: "Liquid — order by volume",
  weight: "Dry — order by weight",
  count: "Order by count",
};

// Add-line form for a prep order. The unit dropdown is locked to the selected
// recipe's base (yield) unit family — liquids order in volume, dry goods by
// weight — so you can't request 5 lb of a soup that yields in quarts.
export function AddLineForm({ orderId, recipes }: { orderId: string; recipes: Recipe[] }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const units = recipe ? allowedUnitsFor(recipe.yieldUnit) : [];
  const family = recipe ? unitFamily(recipe.yieldUnit) : null;

  return (
    <form action={addPrepLine} className="space-y-3">
      <input type="hidden" name="prepOrderId" value={orderId} />
      <Field label="Recipe search">
        <RecipePicker
          recipes={recipes}
          onSelect={(r) => setRecipe(r as Recipe | null)}
        />
      </Field>

      <div className="flex items-end gap-3">
        <div className="w-28">
          <Field label="Qty">
            <Input
              name="requestedQty"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={1}
              required
              disabled={!recipe}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Unit">
            {/* Remount on recipe change so the locked default unit applies. */}
            <Select
              key={recipe?.id ?? "none"}
              name="requestedUnit"
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
        <Button type="submit" disabled={!recipe}>
          Add
        </Button>
      </div>

      <p className="text-xs text-zinc-500">
        {recipe
          ? `Locked to the recipe's base unit (${unitLabel(recipe.yieldUnit)})${
              family && FAMILY_HINT[family] ? ` · ${FAMILY_HINT[family]}` : ""
            }.`
          : "Pick a recipe to choose a quantity and unit."}
      </p>
    </form>
  );
}
