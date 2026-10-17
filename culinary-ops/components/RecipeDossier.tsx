import { useId, type ReactNode } from "react";
import { num } from "@/lib/costing";
import { displayMeasure } from "@/lib/units";
import { ALLERGENS } from "@/lib/allergens";
import { splitStep } from "@/lib/method";
import { LocalTime } from "./LocalTime";

// Optional metadata supports immutable packets captured before this design.
export type DossierRecipe = {
  id: string;
  name: string;
  prodCode: string;
  version: number;
  yieldQty: number;
  yieldUnit: string;
  instructions: string | null;
  criticalNotes: string | null;
  category?: string | null;
  station?: string | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  shelfLife?: string | null;
  holdLifeDays?: number | null;
  storage?: string | null;
  updatedAt?: Date | string | null;
};

export function RecipePrintSettings() {
  return <style>{"@media print { @page { size: letter portrait; margin: 0.4in; } }"}</style>;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const STAGES = [
  { label: "House Sub-Recipes", categories: [] },
  { label: "Produce & Botanicals", categories: ["Produce"] },
  { label: "Proteins & Seafood", categories: ["Protein", "Poultry", "Seafood"] },
  { label: "Dairy & Emulsion", categories: ["Dairy"] },
  {
    label: "Pantry, Acids & Lipids",
    categories: ["Oils & Vinegars", "Condiments & Sauces", "Canned & Jarred", "Grains & Pasta", "Dry Goods", "Bakery", "Baking"],
  },
  { label: "Seasonings & Aromatics", categories: ["Spices & Seasonings", "Other"] },
];

export type MiseLine = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  note: ReactNode;
  category?: string | null;
  subRecipe?: boolean;
};

function parseSteps(instructions: string | null): string[] {
  return (instructions ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
}

function stepCues(step: string): string[] {
  const matches = step.match(/\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\b|\b\d+(?:\.\d+)?\s*°\s*[FC]\b|\b(?:boiling|ice[\s-]+bath|high[\s-]+shear|pulse)\b/gi) ?? [];
  return [...new Map(matches.map((cue) => [cue.toLowerCase(), cue])).values()].slice(0, 2);
}


export type RecipeDossierProps = {
  recipe: DossierRecipe;
  scale: number;
  allergenKeys: string[];
  lines?: MiseLine[];
  weightInGrams?: boolean;
  batchOptions?: readonly number[];
  batchLabel?: string;
  context?: ReactNode;
  children?: ReactNode;
  supporting?: boolean;
  titleLevel?: 1 | 2 | 3;
  id?: string;
  className?: string;
  printedAt?: Date | string;
};

export function RecipeDossier({
  recipe, scale, allergenKeys, lines = [], weightInGrams = false,
  batchOptions, batchLabel = "Production Batch", context,
  children, supporting = false, titleLevel = 2, id, className = "", printedAt = new Date(),
}: RecipeDossierProps) {
  const titleId = useId();
  const Title = titleLevel === 1 ? "h1" : titleLevel === 3 ? "h3" : "h2";
  const station = recipe.station?.trim();
  const scaledYield = displayMeasure(recipe.yieldQty * scale, recipe.yieldUnit, weightInGrams);
  const yieldLabel = `${num(scaledYield.qty)} ${scaledYield.label}`;
  const keys = new Set(allergenKeys);
  const allergens = ALLERGENS.filter((allergen) => keys.has(allergen.key));
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const hasTime = recipe.prepMinutes != null || recipe.cookMinutes != null;
  const shelfLife = recipe.shelfLife || (recipe.holdLifeDays != null ? `${recipe.holdLifeDays} Days` : null);
  return (
    <article id={id} className={`print-sheet recipe-dossier flex flex-col border border-hairline bg-canvas shadow-sm ${supporting ? "recipe-dossier-supporting" : ""} ${className}`} aria-labelledby={titleId}>
      <div className="recipe-accent h-1 shrink-0 bg-[#2C3E35]" />
      <div className="recipe-sheet-body flex flex-1 flex-col">
        <div className="recipe-masthead grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-y border-hairline py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500">
          <span className="text-[#2C3E35]">Mise // Culinary Archive</span>
          <span className="text-center">{[station, recipe.category].filter(Boolean).join(" — ")}</span>
          <span className="text-right tabular-nums">Code {recipe.prodCode} · V{recipe.version}</span>
        </div>

        <header className="recipe-hero flex items-center justify-between gap-5 py-6">
          <div className="min-w-0">
            <p className="recipe-kicker font-display text-sm italic text-gold">
              {recipe.category}{station ? ` — ${station} Station` : ""}
            </p>
            <Title id={titleId} className="recipe-title mt-2 font-display text-[40px] font-medium leading-[1.12] tracking-tight text-[#2C3E35]">
              {recipe.name}
            </Title>
          </div>
          <div className="recipe-batch shrink-0 text-right">
            <p className="recipe-meta mb-2 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">{batchLabel}</p>
            <div role="group" className="inline-flex rounded-full border border-[#D5CFC4] bg-[#F4F1EA] p-0.5 font-mono text-[11px] tabular-nums" aria-label={`${scale} times batch, yielding ${yieldLabel}`}>
              {(batchOptions ?? [scale]).map((batch) => (
                <span key={batch} className={`rounded-full px-2.5 py-1 ${batch === scale ? "bg-[#2C3E35] text-white" : "text-zinc-500"}`}>
                  {num(batch)}×
                </span>
              ))}
            </div>
            <p className="mt-2 font-mono text-[9px] tabular-nums text-[#2C3E35]">{yieldLabel}</p>
          </div>
        </header>

        <dl className="recipe-specs grid grid-cols-[1fr_1fr_0.85fr_1.1fr_1.45fr] border-y border-hairline py-3">
          {[
            { label: scale === 1 ? "Standard Yield" : "Scaled Yield", value: yieldLabel },
            { label: "Prep / Cook", value: `${recipe.prepMinutes != null ? `${recipe.prepMinutes}m` : "—"} / ${recipe.cookMinutes != null ? `${recipe.cookMinutes}m` : "—"}` },
            { label: "Total Time", value: hasTime ? `${totalMinutes}m` : "—" },
            { label: "Shelf / Hold Life", value: shelfLife ?? "—" },
          ].map((spec) => (
            <div key={spec.label} className="recipe-spec min-w-0 border-r border-hairline px-3 first:pl-0">
              <dt className="recipe-meta font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-500">{spec.label}</dt>
              <dd className="mt-1.5 font-mono text-[11px] leading-snug tabular-nums text-[#2C3E35]">{spec.value}</dd>
            </div>
          ))}
          <div className="recipe-spec min-w-0 pl-3">
            <dt className="recipe-meta font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-500">Allergen Profile</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1">
              {allergens.length > 0 ? allergens.map((allergen) => (
                <span key={allergen.key} className="recipe-allergen rounded-full border border-[#D5CFC4] bg-[#F4F1EA] px-1.5 py-0.5 text-[9px] leading-tight text-[#2C3E35]">
                  {allergen.label}
                </span>
              )) : <span className="text-[10px] text-zinc-500">None recorded</span>}
            </dd>
          </div>
        </dl>

        {context && <div className="recipe-context mt-3 text-[11px] leading-snug text-zinc-600">{context}</div>}
        {children ?? <RecipeDossierWorkspace recipe={recipe} lines={lines} scale={scale} weightInGrams={weightInGrams} />}

        <footer className="recipe-footer mt-auto pt-6">
          {!supporting && <div className="grid grid-cols-3 gap-6">
            {["Prepared By", "Date & Time", "Verified By (Chef / Sous)"].map((label) => (
              <div key={label}>
                <div className="recipe-signature h-5 border-b border-[#D5CFC4]" />
                <p className="recipe-meta mt-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>}
          <div className="recipe-colophon mt-4 flex justify-between gap-3 border-t border-hairline pt-2 font-mono text-[7px] uppercase tracking-[0.08em] text-zinc-500">
            <p>Mise // Culinary Archive · {recipe.prodCode} · V{recipe.version}</p>
            <p className="text-right">Printed <LocalTime date={printedAt} mode="date" />{recipe.updatedAt && <> · Updated <LocalTime date={recipe.updatedAt} mode="date" /></>}</p>
          </div>
        </footer>
      </div>
    </article>
  );
}

export function RecipeDossierWorkspace({ recipe, lines, scale, weightInGrams = false }: {
  recipe: DossierRecipe;
  lines: MiseLine[];
  scale: number;
  weightInGrams?: boolean;
}) {
  const sectionId = useId();
  const stages = STAGES.map((stage) => ({ ...stage, lines: [] as MiseLine[] }));
  for (const line of lines) {
    const category = line.category?.trim().toLowerCase();
    const stage = line.subRecipe ? stages[0] :
      stages.find((s) => s.categories.some((c) => c.toLowerCase() === category)) ?? stages[5];
    stage.lines.push(line);
  }
  const populatedStages = stages.filter((stage) => stage.lines.length > 0);
  const steps = parseSteps(recipe.instructions);
  const shelfLife = recipe.shelfLife || (recipe.holdLifeDays != null ? `${recipe.holdLifeDays} Days` : null);
  const storageNotes = (recipe.storage ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="recipe-workspace mt-6 grid grid-cols-[38%_57%] gap-x-[5%]">
      <section className="min-w-0" aria-labelledby={`${sectionId}-mise`}>
        <h2 id={`${sectionId}-mise`} className="recipe-section-title border-b border-hairline pb-2 font-display text-[23px] italic text-[#2C3E35]">Mise en Place</h2>
        {populatedStages.length === 0 && <p className="mt-3 text-zinc-500">No ingredients recorded.</p>}
        {populatedStages.map((stage, index) => (
          <div key={stage.label} className="recipe-stage mt-3">
            {populatedStages.length > 1 && (
              <h3 className="recipe-stage-title mb-1 flex items-center gap-2 font-mono text-[8px] font-medium uppercase tracking-[0.08em] text-gold">
                <span>{ROMAN[index]}. {stage.label}</span>
                <span className="h-px min-w-2 flex-1 bg-[#E2DDD5]" aria-hidden="true" />
              </h3>
            )}
            <ul>
              {stage.lines.map((line) => {
                const measure = displayMeasure(line.quantity * scale, line.unit, weightInGrams);
                return (
                  <li key={line.id} className="recipe-ingredient flex items-baseline justify-between gap-3 border-b border-dotted border-[#E2DDD5] py-1.5">
                    <div className="min-w-0">
                      <span className="font-medium">{line.name}</span>
                      {line.note && <p className="recipe-prep-note mt-0.5 whitespace-pre-wrap font-display text-[11px] italic leading-snug text-zinc-500">{line.note}</p>}
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-[#2C3E35]">
                      {num(measure.qty)} <span className="text-zinc-500">{measure.label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {recipe.criticalNotes && (
          <aside className="recipe-critical mt-5 border-l-2 border-[#9A7B4F] bg-[#F4F1EA] p-3">
            <h3 className="font-display text-sm italic leading-snug text-[#2C3E35]">Chef&apos;s Standard &amp; Critical Control</h3>
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed">{recipe.criticalNotes}</p>
          </aside>
        )}
      </section>

      <section className="min-w-0" aria-labelledby={`${sectionId}-method`}>
        <h2 id={`${sectionId}-method`} className="recipe-section-title border-b border-hairline pb-2 font-display text-[23px] italic text-[#2C3E35]">Method of Execution</h2>
        {steps.length === 0 ? <p className="mt-3 text-zinc-500">No method recorded.</p> : (
          <ol className="recipe-method mt-4 grid gap-4">
            {steps.map((step, index) => {
              const { action, detail } = splitStep(step);
              const cues = stepCues(step);
              return (
                <li key={index} className="recipe-step grid grid-cols-[28px_1fr] gap-3">
                  <span className="recipe-step-number whitespace-nowrap font-display text-[29px] italic leading-none tabular-nums text-gold" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="recipe-step-heading flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                      <h3 className="font-semibold text-[#2C3E35]">{action || `Step ${index + 1}`}</h3>
                      {cues.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {cues.map((cue) => <span key={cue} className="recipe-cue rounded-full border border-[#E2DDD5] bg-cream px-2 py-0.5 font-mono text-[8px] tabular-nums text-[#2C3E35]">{cue}</span>)}
                        </span>
                      )}
                    </div>
                    {detail && <p className="recipe-step-prose mt-1 leading-relaxed text-zinc-700">{detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {(storageNotes.length > 0 || shelfLife) && (
          <aside className="recipe-storage mt-5 border border-[#E2DDD5] p-3">
            <h3 className="font-display text-[15px] italic text-[#2C3E35]">Storage, Stewardship &amp; Shelf Life</h3>
            <ul className="mt-2 grid list-disc grid-cols-2 gap-x-5 gap-y-1 pl-3 text-[10px] leading-relaxed marker:text-gold">
              {storageNotes.map((note, index) => <li key={index} className="whitespace-pre-wrap">{note}</li>)}
              {shelfLife && <li><span className="font-semibold">Shelf life:</span> {shelfLife}</li>}
            </ul>
          </aside>
        )}
      </section>
    </div>
  );
}
