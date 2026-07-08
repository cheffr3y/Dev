"use client";

import { useState } from "react";
import { RecipePicker } from "@/components/RecipePicker";
import { Button, Field, Input } from "@/components/ui";
import { num } from "@/lib/costing";
import { addFestivalMenuItem } from "./actions";

type Recipe = { id: string; name: string; prodCode: string; yieldQty: number; yieldUnit: string };

// Add a menu line under a tent. The recipe link is optional — a forecast-only
// row still projects covers and revenue, it just can't scale builds or feed
// the order guide. Picking a recipe prefills the item name (editable — the
// menu name is what the sign says, not what the kitchen calls it).
export function AddMenuItemForm({
  festivalId,
  tentId,
  recipes,
}: {
  festivalId: string;
  tentId: string;
  recipes: Recipe[];
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [name, setName] = useState("");

  return (
    <form action={addFestivalMenuItem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="festivalId" value={festivalId} />
      <input type="hidden" name="tentId" value={tentId} />
      <div className="min-w-[180px] flex-1">
        <Field
          label="Recipe (optional)"
          hint={recipe ? `Yields ${num(recipe.yieldQty)} ${recipe.yieldUnit} per batch` : "Skip for a forecast-only row"}
        >
          <RecipePicker
            recipes={recipes}
            onSelect={(r) => {
              setRecipe(r as Recipe | null);
              if (r && !name.trim()) setName(r.name);
            }}
          />
        </Field>
      </div>
      <div className="min-w-[160px] flex-1">
        <Field label="Menu item name">
          <Input
            name="name"
            required
            placeholder="Brisket Sandwich"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Price ($)">
          <Input name="price" type="number" step="0.01" min="0" defaultValue={0} />
        </Field>
      </div>
      <div className="w-20">
        <Field label="Mix %">
          <Input name="mixPct" type="number" step="0.5" min="0" max="100" defaultValue={0} />
        </Field>
      </div>
      <Button type="submit">Add</Button>
    </form>
  );
}
