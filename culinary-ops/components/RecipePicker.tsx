"use client";

import { useMemo } from "react";
import { ComboPicker, type ComboOption } from "./ComboPicker";
import { num } from "@/lib/costing";

type Recipe = { id: string; name: string; prodCode: string; yieldUnit?: string; yieldQty?: number };

// Typeahead recipe combobox. Thin wrapper over the shared ComboPicker that
// formats a recipe's yield as the muted meta line (e.g. "yields 12 each") and
// lets you search by name or prod code. Writes the chosen recipe id into a
// hidden input so the surrounding server-action <form> submits it; `onSelect`
// lets a parent react (e.g. lock the unit to the recipe's family).
export function RecipePicker({
  recipes,
  name = "recipeId",
  disabled = false,
  onSelect,
}: {
  recipes: Recipe[];
  name?: string;
  disabled?: boolean;
  onSelect?: (recipe: Recipe | null) => void;
}) {
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const options: ComboOption[] = useMemo(
    () =>
      recipes.map((r) => ({
        id: r.id,
        label: r.name,
        meta: yieldMeta(r),
        keywords: r.prodCode,
      })),
    [recipes],
  );

  return (
    <ComboPicker
      options={options}
      name={name}
      placeholder="Search recipes…"
      disabled={disabled}
      onSelect={(o) => onSelect?.(o ? byId.get(o.id) ?? null : null)}
    />
  );
}

// "yields 12 each" when the qty is known, "yields each" when only the unit is,
// otherwise the prod code as a last resort so the row still carries a hint.
function yieldMeta(r: Recipe): string | undefined {
  if (r.yieldUnit && r.yieldQty != null) return `yields ${num(r.yieldQty)} ${r.yieldUnit}`;
  if (r.yieldUnit) return `yields ${r.yieldUnit}`;
  return r.prodCode ? `(${r.prodCode})` : undefined;
}
