import Link from "next/link";
import { DIETS, dietLabel, type EffectiveDiet } from "@/lib/recipes/diet";
import { Field, Input, Select } from "./ui";

// Vegan / vegetarian status for a recipe: what the ingredients say, any
// hand-set override with its reason, and what still needs tagging or review.
export function DietSection({ effective, fromIngredients, override, note, unreviewed, reviewStale, canEdit, form }: {
  effective: EffectiveDiet;
  fromIngredients: EffectiveDiet;
  override: string | null;
  note: string | null;
  unreviewed: string[];
  reviewStale: string[];
  canEdit: boolean;
  form?: string;
}) {
  const label = effective.diet ? dietLabel(effective.diet) : "Not confirmed";
  const review = unreviewed.length + reviewStale.length;
  return <section aria-labelledby="diet-heading" className="space-y-2">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 id="diet-heading" className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Diet</h3>
      <span className="font-display text-lg text-ink">{label}</span>
      <span className="text-xs text-zinc-500">{effective.overridden ? `Set by hand${note ? `: ${note}` : ""}` : "Worked out from ingredients and sub-recipes"}</span>
    </div>
    {effective.overridden && <p className="text-xs text-zinc-600">Ingredients alone say: {fromIngredients.diet ? dietLabel(fromIngredients.diet) : "not confirmed"}.</p>}
    {fromIngredients.untagged.length > 0 && <p className="text-xs text-amber-800">
      {fromIngredients.untagged.length} ingredient{fromIngredients.untagged.length === 1 ? "" : "s"} not tagged yet: {shortList(fromIngredients.untagged)}. Menus won&apos;t say vegan or vegetarian until {fromIngredients.untagged.length === 1 ? "it is" : "they are"} tagged.
    </p>}
    {review > 0 && <p className="text-xs text-amber-800">
      Allergen review due on {review} ingredient{review === 1 ? "" : "s"}: {shortList([...unreviewed, ...reviewStale])}. <Link href="/items/attention" className="underline">Review allergens</Link>
    </p>}
    {canEdit && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Set diet by hand" hint="Only when the ingredients can't tell the full story.">
        <Select form={form} name="dietOverride" defaultValue={override ?? ""}>
          <option value="">Use ingredients (recommended)</option>
          {DIETS.map((diet) => <option key={diet.key} value={diet.key}>{diet.label}</option>)}
        </Select>
      </Field>
      <Field label="Why (required when set by hand)">
        <Input form={form} name="dietOverrideNote" maxLength={500} defaultValue={note ?? ""} placeholder="Buns confirmed vegan with supplier" />
      </Field>
    </div>}
  </section>;
}

function shortList(names: string[], max = 6) {
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
}
