"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { deleteRecipe, type DeleteRecipeState } from "./actions";

const initialState: DeleteRecipeState = {};

// Delete is a RESTRICT-guarded action: if the recipe is still referenced by
// production history or menus, the action returns an explanatory error instead
// of redirecting. Surface that inline rather than crashing on a Prisma error.
export function DeleteRecipeForm({ recipeId }: { recipeId: string }) {
  const [state, formAction, pending] = useActionState(deleteRecipe, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={recipeId} />
      <Button type="submit" variant="danger" className="w-full" disabled={pending}>
        {pending ? "Deleting…" : "Delete recipe"}
      </Button>
      {state.error && (
        <p
          aria-live="polite"
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-600"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
