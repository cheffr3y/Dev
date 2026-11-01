import { allergenLabel, parseAllergens } from "@/lib/recipes/allergens";

export function AllergenBadges({ allergens }: { allergens: string | null | undefined }) {
  const keys = parseAllergens(allergens);
  if (keys.length === 0) return <span className="text-xs font-normal text-zinc-400">None recorded</span>;
  return <ul aria-label="Ingredient allergens" className="flex flex-wrap gap-1">
    {keys.map(key => <li key={key} className="rounded-full border border-hairline bg-stone px-2 py-0.5 text-[11px] font-medium text-ink">
      {allergenLabel(key)}
    </li>)}
  </ul>;
}
