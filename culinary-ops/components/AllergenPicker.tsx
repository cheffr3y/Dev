import { MAJOR_ALLERGENS, COMMON_ALLERGENS, type Allergen } from "@/lib/recipes/allergens";

// Ingredient/manual recipe tags post as repeated `allergen` fields.
// Inherited tags are displayed but never copied into manual selections.
export function AllergenPicker({
  selected,
  inherited = new Map(),
}: {
  selected: string[];
  inherited?: Map<string, string>;
}) {
  const own = new Set(selected);

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Allergens</legend>
      <AllergenColumn label="Major (Big 9)" allergens={MAJOR_ALLERGENS} own={own} inherited={inherited} />
      <AllergenColumn label="Also common" allergens={COMMON_ALLERGENS} own={own} inherited={inherited} />
    </fieldset>
  );
}

function AllergenColumn({
  label,
  allergens,
  own,
  inherited,
}: {
  label: string;
  allergens: Allergen[];
  own: Set<string>;
  inherited: Map<string, string>;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-zinc-400">{label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {allergens.map((a) => {
          const via = inherited.get(a.key);
          const isInherited = via != null;
          const checked = isInherited || own.has(a.key);
          return (
            <label
              key={a.key}
              className={
                "flex items-center gap-2 text-sm " +
                (isInherited ? "text-zinc-500" : "cursor-pointer text-ink")
              }
              title={isInherited ? `Inherited from “${via}” — edit its allergen tags there` : a.hint}
            >
              <input
                type="checkbox"
                name="allergen"
                value={a.key}
                defaultChecked={checked}
                disabled={isInherited}
                className="h-4 w-4 shrink-0 rounded border-zinc-300 text-primary focus:ring-form-focus disabled:opacity-60"
              />
              <span className="min-w-0 truncate">
                {a.label}
                {isInherited && (
                  <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.02em] text-zinc-400">
                    via {via}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
