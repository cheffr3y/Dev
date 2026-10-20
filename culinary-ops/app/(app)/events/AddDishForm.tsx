"use client";

import { useState } from "react";
import { RecipePicker } from "@/components/RecipePicker";
import { Button, Field, Input } from "@/components/ui";
import { num } from "@/lib/costing";
import { addEventMenuItem } from "./actions";

type Recipe = { id: string; name: string; prodCode: string; yieldQty: number; yieldUnit: string };

// Add a dish to an event's menu. Uses the searchable recipe picker (which shows
// each recipe's yield) and requests quantities in that recipe's yield unit.
export function AddDishForm({
  eventId,
  recipes,
  guestCount,
}: {
  eventId: string;
  recipes: Recipe[];
  guestCount: number;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const defaultQuantity = recipe && /^(servings?|portions?)$/i.test(recipe.yieldUnit.trim())
    ? guestCount
    : "";

  return (
    <form action={addEventMenuItem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="min-w-[180px] flex-1">
        <Field
          label="Add dish"
          hint={recipe ? `Yields ${num(recipe.yieldQty)} ${recipe.yieldUnit} per batch` : undefined}
        >
          <RecipePicker recipes={recipes} onSelect={(r) => setRecipe(r as Recipe | null)} />
        </Field>
      </div>
      <div className="w-36">
        <Field label={recipe ? `Quantity (${recipe.yieldUnit})` : "Quantity"}>
          <Input
            key={recipe?.id ?? "none"}
            name="plannedServings"
            type="number"
            min="0"
            step="any"
            required
            defaultValue={defaultQuantity}
            disabled={!recipe}
          />
        </Field>
      </div>
      <Button type="submit" disabled={!recipe}>
        Add
      </Button>
    </form>
  );
}
