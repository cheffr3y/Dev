"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { AllergenBadges } from "./AllergenBadges";
import { Button, Input } from "./ui";
import { costPerYieldUnit, costUnitLabel, foodCostPct, money, num, pct, preciseNum } from "@/lib/recipes/costing";
import { parseAllergens } from "@/lib/recipes/allergens";
import { displayMeasure } from "@/lib/recipes/units";

const tabs = [
  ["formula", "Formula & Method"],
  ["dependencies", "Cost Rollup & Dependencies"],
  ["compliance", "HACCP & Compliance"],
  ["history", "History / Changelog"],
] as const;
type RecipeTab = typeof tabs[number][0];
type WorkspaceState = {
  activeTab: RecipeTab;
  setActiveTab: (tab: RecipeTab) => void;
  scale: number | null;
  allergens: string[];
};
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export const useRecipeWorkspace = () => useContext(WorkspaceContext);
function useWorkspace() {
  const workspace = useRecipeWorkspace();
  if (!workspace) throw new Error("Recipe workspace is required");
  return workspace;
}

type Props = {
  recipe: { id: string; name: string; prodCode: string; version: number; category: string; station: string | null; yieldQty: number; yieldUnit: string; menuPrice: number | null };
  canEdit: boolean;
  totalCost: number;
  ingredientsCost: number;
  subRecipesCost: number;
  complete: boolean;
  allergens: string[];
  inheritedAllergens: string[];
  staleItems: { id: string; name: string }[];
  saveAction: (data: FormData) => Promise<void>;
  children: ReactNode;
};

export function RecipeWorkspace({ recipe, canEdit, totalCost, ingredientsCost, subRecipesCost, complete, allergens: initialAllergens, inheritedAllergens, staleItems, saveAction, children }: Props) {
  const [activeTab, setActiveTab] = useState<RecipeTab>("formula");
  const [multiplier, setMultiplier] = useState("1");
  const [menuPrice, setMenuPrice] = useState(String(recipe.menuPrice ?? ""));
  const [manualAllergens, setAllergens] = useState(initialAllergens);
  const allergens = parseAllergens([...manualAllergens, ...inheritedAllergens].join(","));
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const submitting = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const scale = multiplier.trim() && Number.isFinite(Number(multiplier)) && Number(multiplier) > 0 && Number(multiplier) * recipe.yieldQty <= 100000000 ? Number(multiplier) : null;
  const perUnit = complete ? costPerYieldUnit(totalCost, recipe.yieldQty) : null;
  const price = menuPrice.trim() !== "" && Number.isFinite(Number(menuPrice)) ? Number(menuPrice) : null;
  const foodCost = perUnit == null ? null : foodCostPct(perUnit, price);
  const costUnit = costUnitLabel(recipe.yieldUnit);

  function reviewStale() {
    // The dependency tree includes nested prices as well as direct ingredients.
    flushSync(() => setActiveTab("dependencies"));
    const explorer = root.current?.querySelector<HTMLElement>(".recipe-dependency-explorer");
    explorer?.querySelectorAll("details").forEach(details => { details.open = true; });
    const row = Array.from(explorer?.querySelectorAll<HTMLElement>("[data-dependency-id]") ?? []).find(node => staleItems.some(item => item.id === node.dataset.dependencyId));
    const target = row ?? explorer;
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.animate([{ backgroundColor: "#78551f" }, { backgroundColor: "transparent" }], { duration: 2200 });
    }
  }

  return <WorkspaceContext.Provider value={{ activeTab, setActiveTab, scale, allergens }}>
    <div ref={root} className="recipe-editor-workspace" onClick={event => {
      if ((event.target as HTMLElement).closest("#recipe-method button")) { setSaveStatus("Unsaved changes"); }
    }} onDrop={event => {
      if ((event.target as HTMLElement).closest("#recipe-method")) { setSaveStatus("Unsaved changes"); }
    }} onInput={event => {
      const target = event.target;
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) && (target.form?.id === "recipeForm" || target.closest("#recipe-method"))) {
        setSaveStatus("Unsaved changes"); setSaveError(false);
      }
    }} onChange={event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "allergen") {
        setAllergens(Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[name="allergen"]:checked:not(:disabled)') ?? []).map(input => input.value));
      }
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) && (target.form?.id === "recipeForm" || target.closest("#recipe-method"))) {
        setSaveStatus("Unsaved changes");
        setSaveError(false);
      }
    }}>
      {canEdit && <form id="recipeForm" noValidate onSubmit={async event => {
        event.preventDefault();
        if (submitting.current) return;
        const form = event.currentTarget;
        // Reveal the first invalid field before native validation focuses it.
        // Every associated field stays mounted, including the hidden panels.
        const invalid = Array.from(form.elements).find((element): element is HTMLInputElement => "validity" in element && !(element as HTMLInputElement).validity.valid);
        if (invalid) {
          const panel = invalid.closest<HTMLElement>("[data-recipe-tab]");
          if (panel) flushSync(() => setActiveTab(panel.dataset.recipeTab as RecipeTab));
          invalid.reportValidity();
          return;
        }
        const data = new FormData(form);
        const savedEntries = JSON.stringify([...data.entries()]);
        submitting.current = true; setSaving(true); setSaveError(false); setSaveStatus("Saving…");
        try {
          // Same updateRecipe action, same complete FormData. Preventing the
          // native action reset preserves edits made while the request runs.
          await saveAction(data);
          setSaveStatus(JSON.stringify([...new FormData(form).entries()]) === savedEntries ? "Changes saved" : "Earlier changes saved · New edits unsaved");
        } catch {
          setSaveError(true); setSaveStatus("Could not save. Your edits are kept; check the fields and retry.");
        } finally { submitting.current = false; setSaving(false); }
      }}><input type="hidden" name="id" value={recipe.id} /></form>}

      <header className="recipe-command-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link href="/recipes" className="text-xs text-zinc-500 hover:text-ink">← Recipes</Link>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{recipe.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <span className="recipe-code">{recipe.prodCode}</span><span>v{recipe.version}</span><span>· {recipe.category}</span>
              {recipe.station && <span>· {recipe.station}</span>}<span>· Standard yield {num(recipe.yieldQty)} {recipe.yieldUnit}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="recipe-print-group" aria-label="Print options">
              <Link href={`/recipes/${recipe.id}/print`} aria-label="Print Recipe Card">Print<span className="hidden sm:inline"> Recipe Card</span></Link>
              <Link href={`/recipes/${recipe.id}/print?costs=1`} aria-label="Print with Costing"><span className="hidden sm:inline">Print </span>with Costing</Link>
            </div>
            {canEdit && <Button type="submit" form="recipeForm" disabled={saving} className="recipe-save">{saving ? "Saving…" : "Save Changes"}</Button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="recipe-eyebrow">Batch preview</span>
            <div className="recipe-scale-pills" aria-label="Batch preview multipliers">{[0.5, 1, 2, 4].map(value => <button key={value} type="button" aria-label={`${value} times standard batch`} aria-pressed={scale === value} onClick={() => setMultiplier(String(value))}>{value}x</button>)}</div>
            <Input aria-label="Custom batch multiplier" className="recipe-custom-scale" type="number" min="0.000001" step="any" max={100000000 / recipe.yieldQty} value={multiplier} onChange={event => setMultiplier(event.target.value)} aria-invalid={scale === null} />
            <span className={scale === 1 ? "text-xs text-zinc-500" : "recipe-preview-label"}>{scale === null ? "Enter a valid multiplier" : scale === 1 ? "Standard saved batch" : `${preciseNum(scale)}x preview · ${num(recipe.yieldQty * scale)} ${recipe.yieldUnit}`}</span>
          </div>
          {staleItems.length > 0 && <button type="button" onClick={reviewStale} className="recipe-stale-pill" title={staleItems.map(item => item.name).join(", ")}>{staleItems.length} Stale {staleItems.length === 1 ? "Price" : "Prices"} · 90d+ ↗</button>}
        </div>
        {canEdit && saveStatus && <p role={saveError ? "alert" : "status"} className={`mt-2 text-xs ${saveError ? "text-red-600" : "text-zinc-500"}`}>{saveStatus}</p>}
      </header>

      <section aria-label="Recipe cost overview" className="recipe-kpis">
        <Kpi label="Total Cost"><p className="recipe-kpi-value"><ScaledCost value={complete ? totalCost : null} /></p><p className="recipe-kpi-note">{complete ? <><ScaledCost value={ingredientsCost} /> raw · <ScaledCost value={subRecipesCost} /> sub-recipes</> : "Review inputs for a batch total"}</p></Kpi>
        <Kpi label={`Cost / ${costUnit}`}><p className="recipe-kpi-value">{money(perUnit, 5)}</p><p className="recipe-kpi-note">{complete ? "All inputs costed" : <RecipeTabButton tab="dependencies">Cost needs review ↗</RecipeTabButton>}</p></Kpi>
        <Kpi label="Menu Price & Food Cost %">
          {canEdit ? <label className="flex items-center gap-1"><span className="text-xl text-zinc-500">$</span><Input aria-label="Menu Price ($)" form="recipeForm" name="menuPrice" type="number" step="0.00001" min="0" value={menuPrice} onChange={event => setMenuPrice(event.target.value)} placeholder="—" className="recipe-price-input" /></label> : <p className="recipe-kpi-value">{money(price, 5)}</p>}
          <p className="recipe-kpi-note">{foodCost == null ? "—" : pct(foodCost)} food cost{perUnit != null && price != null ? ` · ${money(price - perUnit, 5)} margin / ${costUnit}` : ""}</p>
        </Kpi>
        <Kpi label="Active Allergens & Yield"><div className="my-2"><RecipeAllergenSummary /></div><p className="recipe-kpi-note"><ScaledQuantity quantity={recipe.yieldQty} unit={recipe.yieldUnit} /> yield · <RecipeTabButton tab="compliance">Review HACCP ↗</RecipeTabButton></p></Kpi>
      </section>
      <div role="tablist" aria-label="Recipe sections" className="recipe-tabs">{tabs.map(([id, label], index) => <button type="button" role="tab" id={`recipe-tab-${id}`} key={id} aria-controls={`recipe-panel-${id}`} aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1} onClick={() => setActiveTab(id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); setActiveTab(tabs[next][0]); document.getElementById(`recipe-tab-${tabs[next][0]}`)?.focus(); }
      }}>{label}</button>)}</div>
      {children}
    </div>
  </WorkspaceContext.Provider>;
}

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return <div className="recipe-kpi"><h2 className="recipe-eyebrow">{label}</h2>{children}</div>;
}
export function RecipeTabPanel({ tab, children }: { tab: RecipeTab; children: ReactNode }) {
  const { activeTab } = useWorkspace();
  return <section role="tabpanel" id={`recipe-panel-${tab}`} aria-labelledby={`recipe-tab-${tab}`} data-recipe-tab={tab} hidden={activeTab !== tab} className={activeTab !== tab ? "hidden" : ""} tabIndex={0}>{children}</section>;
}
export function RecipeTabButton({ tab, children }: { tab: RecipeTab; children: ReactNode }) {
  const { setActiveTab } = useWorkspace();
  return <button type="button" onClick={() => { setActiveTab(tab); document.getElementById(`recipe-tab-${tab}`)?.focus(); }} className="text-gold hover:underline">{children}</button>;
}
export function RecipeAllergenSummary() {
  return <AllergenBadges allergens={useWorkspace().allergens.join(",")} />;
}
export function ScaledQuantity({ quantity, unit, purchased = false }: { quantity: number | null; unit: string; purchased?: boolean }) {
  const { scale } = useWorkspace();
  if (scale === null || quantity === null) return <>—</>;
  const measured = purchased ? { qty: quantity * scale, label: unit } : displayMeasure(quantity * scale, unit);
  return <>{purchased ? preciseNum(measured.qty) : num(measured.qty)} {measured.label}</>;
}
export function ScaledCost({ value, share }: { value: number | null; share?: number | null }) {
  const { scale } = useWorkspace();
  return <><span className="tabular-nums">{money(value === null || scale === null ? null : value * scale)}</span>{share != null && scale !== null && <span className="recipe-cost-share" title={`${num(share)}% of batch cost`}><span style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></span>}</>;
}
export function FormulaQuickAdd({ raw, subRecipe }: { raw: ReactNode; subRecipe: ReactNode }) {
  const [kind, setKind] = useState("raw");
  return <div className="recipe-quick-add"><div className="mb-3 flex gap-2" aria-label="Formula item type"><button type="button" aria-pressed={kind === "raw"} onClick={() => setKind("raw")}>+ Raw Ingredient</button><button type="button" aria-pressed={kind === "sub"} onClick={() => setKind("sub")}>+ Sub-Recipe</button></div><div hidden={kind !== "raw"}>{raw}</div><div hidden={kind !== "sub"}>{subRecipe}</div></div>;
}
export function DeleteRecipeForm({ id, action }: { id: string; action: (data: FormData) => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  return <details className="recipe-delete"><summary className="cursor-pointer text-xs text-zinc-500">Delete recipe</summary><form action={action} className="mt-3 space-y-3"><input type="hidden" name="id" value={id} /><label className="flex items-start gap-2 text-xs text-zinc-500"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm I want to permanently delete this recipe.</label><Button type="submit" variant="danger" disabled={!confirmed}>Delete recipe</Button></form></details>;
}
