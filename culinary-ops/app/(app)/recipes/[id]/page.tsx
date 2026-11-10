import { measurementSelect, recipePurchaseQuantity } from "@/lib/ingredients/measurements";
import { PriceTrend } from "@/components/PriceTrend";
import { loadPriceTrends } from "@/lib/invoices/price-trends-data";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import {
  recipeCost,
  buildPriceGapMap,
  lineCost,
  componentLineCost,
  componentBatchFactor,
  buildCostMap,
  priceFreshness,
  money,
  num,
} from "@/lib/recipes/costing";
import { unitLabel } from "@/lib/recipes/units";
import { allergenLabels, effectiveAllergens, inheritedAllergenSources, parseAllergens } from "@/lib/recipes/allergens";
import { Badge, Card, CardHeader, Field, Input, Select, TableScroll, Textarea } from "@/components/ui";
import { AllergenPicker } from "@/components/AllergenPicker";
import { AllergenBadges } from "@/components/AllergenBadges";
import { RecipeIngredientEditor } from "@/components/RecipeIngredientEditor";
import { MethodEditor } from "@/components/MethodEditor";
import { splitStep } from "@/lib/recipes/method";
import { SubRecipeForm } from "../SubRecipeForm";
import { AddIngredientForm } from "../AddIngredientForm";
import {
  removeRecipeItem,
  updateRecipe,
  deleteRecipe,
  removeSubRecipe,
} from "../actions";
import { RECIPE_CATEGORIES } from "@/lib/ingredients/categories";
import { RecipeWorkspace, RecipeTabPanel, RecipeTabButton, RecipeAllergenSummary, ScaledQuantity, ScaledCost, FormulaQuickAdd, DeleteRecipeForm } from "@/components/RecipeWorkspace";
import "./recipe-workspace.css";
import { LocalTime } from "@/components/LocalTime";
import { RecipeDependencyTree } from "@/components/RecipeDependencyTree";
import { loadDependencyData } from "@/lib/recipes/recipe-dependencies-data";
import { buildDependencyPlan } from "@/lib/recipes/recipe-dependencies";
import { InspectorLink } from "@/components/InspectorLink";
import { WorkspaceInspector } from "@/components/WorkspaceInspector";

// One changelog row per recipe version: all the change entries recorded in
// that editing session, newest session first (input is already createdAt desc).
type ChangeEntry = {
  id: string;
  summary: string;
  detail: string | null;
  version: number;
  userName: string | null;
  createdAt: Date;
};

function groupChangesByVersion(changes: ChangeEntry[]) {
  const groups: { version: number; entries: ChangeEntry[] }[] = [];
  for (const c of changes) {
    const g = groups[groups.length - 1];
    if (g && g.version === c.version) g.entries.push(c);
    else groups.push({ version: c.version, entries: [c] });
  }
  return groups;
}

// Sum a session up into one headline, e.g. "Added 4 ingredients · Edited details".
function summarizeSession(entries: ChangeEntry[]): string {
  if (entries.length === 1) return entries[0].summary;
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.summary, (counts.get(e.summary) ?? 0) + 1);
  return Array.from(counts, ([summary, n]) => {
    if (n === 1) return summary;
    const m = summary.match(/^(Added|Updated|Removed) (ingredient|sub-recipe)$/);
    return m ? `${m[1]} ${n} ${m[2]}s` : summary;
  }).join(" · ");
}

function parseSteps(instructions: string | null): string[] {
  return (instructions ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [recipe, items, allRecipes] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id },
      include: {
        items: { include: { item: true }, orderBy: [{ sortOrder: "asc" }, { item: { name: "asc" } }] },
        components: { include: { child: true }, orderBy: { child: { name: "asc" } } },
        changes: { orderBy: { createdAt: "desc" }, take: 25 },
      },
    }),
    canEdit ? prisma.item.findMany({ include: { vendor: { select: { name: true } } }, orderBy: { name: "asc" } }) : [],
    prisma.recipe.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        yieldQty: true,
        yieldUnit: true,
        allergens: true,
        items: { select: { quantity: true, unit: true, item: { select: { id: true, priceUpdatedAt: true, name: true, allergens: true, ...measurementSelect, unitCost: true, unit: true } } } },
        components: { select: { childId: true, quantity: true, unit: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!recipe) notFound();
  const asOf = new Date();
  const dependencyData = await loadDependencyData(id, allRecipes.map(node => ({ ...node,
    items: node.items.map(line => ({ ...line, item: { ...line.item, priceUpdatedAt: line.item.priceUpdatedAt?.toISOString() ?? null } })),
  })));
  const priceTrends = await loadPriceTrends(recipe.items.map(line => line.item));

  const groupNames = [...new Set(recipe.items.map(line => line.groupName?.trim()).filter((name): name is string => !!name))];
  const gapMap = buildPriceGapMap(allRecipes.map(node => ({ id: node.id, components: node.components, items: node.items.map(({ item }) => ({ itemId: item.id, unitCost: item.unitCost, priceUpdatedAt: item.priceUpdatedAt })) })), asOf);
  const gap = gapMap.get(id);
  const costMap = buildCostMap(allRecipes);
  const byId = new Map(allRecipes.map((r) => [r.id, r]));

  const ingredientsCost = recipeCost(recipe.items);
  const subRecipesCost = recipe.components.reduce(
    (sum, c) => sum + componentLineCost(c, costMap, byId),
    0,
  );
  const totalCost = ingredientsCost + subRecipesCost;
  const costPlan = buildDependencyPlan(id, dependencyData.recipes, recipe.yieldQty, recipe.yieldUnit, asOf);
  const complete = costPlan?.complete === true && Number.isFinite(totalCost);
  const methodSteps = parseSteps(recipe.instructions);

  // Ingredient and sub-recipe tags are inherited; manual tags remain additive.
  const ownAllergens = parseAllergens(recipe.allergens);
  const inheritedAllergens = inheritedAllergenSources(recipe.id, byId);
  const effectiveAllergenKeys = effectiveAllergens(recipe.id, byId);

  // Recipes available to add as sub-recipes (everything but this one).
  const subRecipeOptions = allRecipes.filter((r) => r.id !== recipe.id);

  const identity = {
    id: recipe.id, name: recipe.name, prodCode: recipe.prodCode, version: recipe.version,
    category: recipe.category, station: recipe.station, yieldQty: recipe.yieldQty,
    yieldUnit: recipe.yieldUnit, menuPrice: recipe.menuPrice,
  };
  const itemNames = new Map(allRecipes.flatMap(node => node.items.map(({ item }) => [item.id, item.name] as const)));
  const staleItems = [...(gap?.stale ?? [])].map(itemId => ({ id: itemId, name: itemNames.get(itemId) ?? itemId }));
  const subOptions = subRecipeOptions.map(r => ({ id: r.id, name: r.name, yieldQty: r.yieldQty, yieldUnit: r.yieldUnit, cost: costMap.get(r.id) ?? 0 }));
  const linked = recipe.components.map(({ childId, quantity, unit }) => ({ childId, quantity, unit }));
  return (
    <WorkspaceInspector>
    <RecipeWorkspace key={recipe.id} recipe={identity} canEdit={canEdit} totalCost={totalCost} ingredientsCost={ingredientsCost} subRecipesCost={subRecipesCost} complete={complete}
      allergens={ownAllergens} inheritedAllergens={[...inheritedAllergens.keys()]} staleItems={staleItems} saveAction={updateRecipe}>
      <RecipeTabPanel tab="formula">
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="min-w-0 space-y-4 xl:col-span-8">
            <Card id="recipe-ingredients">
              <CardHeader><div className="flex items-center justify-between gap-2"><h2>Recipe Formula</h2><span className="font-normal text-zinc-500">{recipe.items.length} raw · {recipe.components.length} sub-recipes</span></div></CardHeader>
              <TableScroll aria-label="Recipe formula">
                <table className="recipe-formula-table w-full text-sm">
                  <thead><tr><th>Item / preparation</th><th className="text-right">Quantity</th><th className="text-right">Unit Cost</th><th className="text-right">Line Cost</th>{canEdit && <th><span className="sr-only">Actions</span></th>}</tr></thead>
                  <tbody>
                    {!recipe.items.length && !recipe.components.length && <tr><td colSpan={canEdit ? 5 : 4} className="text-center text-zinc-500">Add a raw ingredient or sub-recipe to start the formula.</td></tr>}
                    {recipe.items.map(ri => {
                      const lc = lineCost(ri);
                      const freshness = priceFreshness(ri.item.priceUpdatedAt, ri.item.unitCost, asOf);
                      const purchased = ri.item.measurementReviewedAt ? recipePurchaseQuantity(ri.quantity, ri.unit, ri.item) : null;
                      return <tr key={ri.id} id={`formula-item-${ri.item.id}`} className="group">
                        <td>
                          <div className="flex flex-wrap items-center gap-2"><InspectorLink kind="item" id={ri.item.id} className="font-medium text-ink hover:underline">{ri.item.name}</InspectorLink><span className="recipe-type-badge">RAW</span></div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">{parseAllergens(ri.item.allergens).length > 0 && <AllergenBadges allergens={ri.item.allergens} />}{ri.note && <span className="text-xs text-zinc-500">{ri.note}</span>}{ri.groupName && <span className="text-[10px] text-gold">{ri.groupName} · {ri.sortOrder}</span>}</div>
                          {!lc.converted && <span title={ri.item.measurementReviewedAt ? "Reviewed ingredient conversion is unavailable; cost remains unknown." : `Can't convert ${unitLabel(ri.unit)} to ${unitLabel(ri.item.unit)} — cost assumes quantity is in ${unitLabel(ri.item.unit)}.`}><Badge color="amber">Unit mismatch</Badge></span>}
                        </td>
                        <td className="text-right tabular-nums"><ScaledQuantity quantity={ri.quantity} unit={ri.unit} />{ri.item.measurementReviewedAt && <span className="block text-[10px] text-zinc-500">Purchased: {purchased == null ? "Needs review" : <ScaledQuantity quantity={purchased} unit={ri.item.unit} purchased />}</span>}</td>
                        <td className="text-right text-xs">{freshness.unpriced ? <Badge color="amber">No price</Badge> : <><span className="tabular-nums">{money(ri.item.unitCost, 5)}/{unitLabel(ri.item.unit)}</span><span className={`mt-1 block text-[10px] ${freshness.stale ? "text-amber-700" : freshness.untracked ? "text-zinc-500" : "text-emerald-600"}`}>{freshness.stale ? <Badge color="amber">90d+ stale</Badge> : freshness.label}</span>{priceTrends[ri.item.id] && <PriceTrend trend={priceTrends[ri.item.id]} />}</>}</td>
                        <td className="text-right font-medium"><ScaledCost value={freshness.unpriced ? null : lc.cost} share={complete && totalCost > 0 ? lc.cost / totalCost * 100 : null} /></td>
                        {canEdit && <td className="recipe-row-actions"><RecipeIngredientEditor recipeId={recipe.id} line={ri} items={items} groupNames={groupNames} /><form action={removeRecipeItem}><input type="hidden" name="id" value={ri.id} /><input type="hidden" name="recipeId" value={recipe.id} /><button className="text-xs text-red-600 hover:underline" aria-label={`Remove ${ri.item.name}`}>Remove</button></form></td>}
                      </tr>;
                    })}
                  </tbody>
                  <tbody id="recipe-sub-recipes">
                    {recipe.components.map(c => {
                      const childGap = gapMap.get(c.childId);
                      const childCost = componentLineCost(c, costMap, byId);
                      const childPlan = buildDependencyPlan(c.childId, dependencyData.recipes, c.child.yieldQty, c.child.yieldUnit, asOf);
                      const childComplete = childPlan?.complete === true;
                      return <tr key={c.id} className="group">
                        <td><div className="flex flex-wrap items-center gap-2"><InspectorLink kind="recipe" id={c.childId} className="font-medium text-ink hover:underline">{c.child.name}</InspectorLink><span className="recipe-type-badge">SUB-RECIPE</span></div><div className="mt-1 flex flex-wrap items-center gap-2"><AllergenBadges allergens={effectiveAllergens(c.childId, byId).join(",")} />{c.note && <span className="text-xs text-zinc-500">{c.note}</span>}</div>{!componentBatchFactor(c.quantity, c.unit, c.child.yieldQty, c.child.yieldUnit).converted && <Badge color="amber">Unit mismatch</Badge>}</td>
                        <td className="text-right tabular-nums"><ScaledQuantity quantity={c.quantity} unit={c.unit} /></td>
                        <td className="text-right text-xs">{money(childComplete ? (costMap.get(c.childId) ?? 0) / c.child.yieldQty : null, 5)}/{unitLabel(c.child.yieldUnit)}<span className="mt-1 block text-[10px] text-zinc-500">{childGap?.stale.size ? <Badge color="amber">90d+ stale input</Badge> : childComplete ? "Rolled-up cost" : "Needs review"}</span></td>
                        <td className="text-right font-medium"><ScaledCost value={childComplete ? childCost : null} share={complete && totalCost > 0 ? childCost / totalCost * 100 : null} /></td>
                        {canEdit && <td className="recipe-row-actions"><details><summary className="cursor-pointer text-xs text-gold">Edit</summary><SubRecipeForm parentId={recipe.id} options={subOptions} linked={linked} initialChildId={c.childId} /></details><form action={removeSubRecipe}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="parentId" value={recipe.id} /><button className="text-xs text-red-600 hover:underline" aria-label={`Remove ${c.child.name}`}>Remove</button></form></td>}
                      </tr>;
                    })}
                  </tbody>
                  <tfoot><tr><td colSpan={3}>{complete ? "Formula total" : "Formula total · review incomplete inputs"}</td><td className="text-right"><ScaledCost value={complete ? totalCost : null} /></td>{canEdit && <td />}</tr></tfoot>
                </table>
              </TableScroll>
              {canEdit && <FormulaQuickAdd raw={<AddIngredientForm recipeId={recipe.id} groupNames={groupNames} nextSortOrder={Math.max(-1, ...recipe.items.map(line => line.sortOrder)) + 1} items={items.filter(item => !recipe.items.some(line => line.itemId === item.id))} />} subRecipe={<SubRecipeForm parentId={recipe.id} linked={linked} options={subOptions} />} />}
            </Card>
            <Card id="recipe-method">
              <CardHeader><h2>Execution Method</h2></CardHeader>
              {canEdit ? <MethodEditor initialSteps={methodSteps} /> : !methodSteps.length ? <p className="p-4 text-sm text-zinc-500">No method recorded.</p> : <ol className="space-y-3 p-4">{methodSteps.map((step, i) => { const { action, detail } = splitStep(step); return <li key={i} className="flex gap-3 text-sm"><span className="font-mono text-gold">{String(i + 1).padStart(2, "0")}</span><span>{action && <strong className="mr-2 text-gold">{action}</strong>}{detail}</span></li>; })}</ol>}
            </Card>
          </div>
          <aside id="recipe-details" className="min-w-0 space-y-4 xl:col-span-4">
            <Card><CardHeader><h2>Recipe Identity & Quick Specs</h2></CardHeader>
              {canEdit ? <div className="space-y-4 p-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Yield &amp; pricing</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Yield Qty">
                        <Input form="recipeForm" name="yieldQty" type="number" step="0.1" min="0.1" defaultValue={recipe.yieldQty} />
                      </Field>
                      <Field label="Yield Unit">
                        <Input form="recipeForm" name="yieldUnit" defaultValue={recipe.yieldUnit} />
                      </Field>
                    </div>
                    <p className="text-xs text-zinc-500">Edit menu price in the summary above.</p>
                  </div>

                  <Section title="Identity">
                    <div className="space-y-3">
                      <Field label="Name">
                        <Input form="recipeForm" name="name" required defaultValue={recipe.name} />
                      </Field>
                      <Field label="Category">
                        <Select form="recipeForm" name="category" defaultValue={recipe.category}>
                          {!RECIPE_CATEGORIES.includes(recipe.category) && <option value={recipe.category}>{recipe.category}</option>}
                          {RECIPE_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Station">
                        <Input form="recipeForm" name="station" defaultValue={recipe.station ?? ""} placeholder="Garde Manger, Bar…" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Timing">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Field label="Prep (min)">
                        <Input form="recipeForm" name="prepMinutes" type="number" min="0" defaultValue={recipe.prepMinutes ?? ""} placeholder="—" />
                      </Field>
                      <Field label="Cook (min)">
                        <Input form="recipeForm" name="cookMinutes" type="number" min="0" defaultValue={recipe.cookMinutes ?? ""} placeholder="—" />
                      </Field>
                      <Field label="Production person-min" hint="Standard hands-on estimate per recipe yield.">
                        <Input form="recipeForm" name="productionPersonMinutes" type="number" min="0" step="0.1" defaultValue={recipe.productionPersonMinutes ?? ""} placeholder="—" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Production">
                    <Field label="Production Code" hint="Auto-generated, used in lot numbers. Frozen once it appears on a printed lot.">
                      <Input value={recipe.prodCode} disabled readOnly />
                    </Field>
                  </Section>


              </div> : <dl className="space-y-2 p-4 text-sm">
                <DetailRow label="Category" value={recipe.category} /><DetailRow label="Station" value={recipe.station} /><DetailRow label="Standard yield" value={`${num(recipe.yieldQty)} ${recipe.yieldUnit}`} />
                <DetailRow label="Prep" value={recipe.prepMinutes != null ? `${recipe.prepMinutes} min` : null} /><DetailRow label="Cook" value={recipe.cookMinutes != null ? `${recipe.cookMinutes} min` : null} />
                <DetailRow label="Production labor" value={recipe.productionPersonMinutes != null ? `${num(recipe.productionPersonMinutes)} person-min / standard yield` : null} /><DetailRow label="Prod. code" value={recipe.prodCode} />
              </dl>}
            </Card>
            <Card><CardHeader><h2>Safety & Allergen Summary</h2></CardHeader><div className="space-y-3 p-4 text-xs"><RecipeAllergenSummary /><p className="text-zinc-500">{recipe.shelfLife || "Shelf life not recorded"}{recipe.holdLifeDays != null ? ` · ${recipe.holdLifeDays} day hold` : ""}</p><RecipeTabButton tab="compliance">Open HACCP & Compliance →</RecipeTabButton></div></Card>
            {canEdit && <DeleteRecipeForm id={recipe.id} action={deleteRecipe} />}
          </aside>
        </div>
      </RecipeTabPanel>
      <RecipeTabPanel tab="dependencies"><RecipeDependencyTree rootId={id} {...dependencyData} asOf={asOf.toISOString()} /></RecipeTabPanel>
      <RecipeTabPanel tab="compliance"><Card><CardHeader><h2>HACCP & Compliance</h2></CardHeader><div className="p-4 sm:p-5">
        {canEdit ? <div className="recipe-compliance-fields">
                  <Section title="Safety & Storage">
                    <div className="space-y-3">
                      <Field label="Critical / Food Safety" hint="HACCP critical limits — put each point on its own line for clarity.">
                        <Textarea form="recipeForm" name="criticalNotes" rows={3} defaultValue={recipe.criticalNotes ?? ""} placeholder={"Cook to 165°F internal\nHold above 140°F\nDiscard after 4 hrs in danger zone"} />
                      </Field>
                      <div>
                        <AllergenPicker form="recipeForm" selected={ownAllergens} inherited={inheritedAllergens} />
                        <p className="mt-2 text-xs text-zinc-500">Ingredient and sub-recipe tags are inherited automatically. Select any additional allergens here.</p>
                      </div>
                      <Field label="Storage Instructions" hint="One step per line so it's easy to follow on the line.">
                        <Textarea form="recipeForm" name="storage" rows={3} defaultValue={recipe.storage ?? ""} placeholder={"Cool rapidly to 41°F within 4 hrs\nStore covered & labeled, FIFO\nKeep below 40°F"} />
                      </Field>
                      <Field label="Shelf Life">
                        <Input form="recipeForm" name="shelfLife" defaultValue={recipe.shelfLife ?? ""} placeholder="3 days refrigerated" />
                      </Field>
                      <Field label="Hold Life (days)" hint="Drives the use-by date printed on cook packets. Leave blank if N/A.">
                        <Input form="recipeForm" name="holdLifeDays" type="number" min="0" defaultValue={recipe.holdLifeDays ?? ""} placeholder="—" />
                      </Field>
                    </div>
                  </Section>


        </div> : <dl className="max-w-3xl space-y-4 text-sm"><DetailRow label="Critical / Food Safety" value={recipe.criticalNotes} multiline /><DetailRow label="Allergens" value={allergenLabels(effectiveAllergenKeys) || "None recorded"} multiline /><DetailRow label="Storage Instructions" value={recipe.storage} multiline /><DetailRow label="Shelf Life" value={recipe.shelfLife} /><DetailRow label="Hold Life (days)" value={recipe.holdLifeDays != null ? `${recipe.holdLifeDays} days` : null} /></dl>}
      </div></Card></RecipeTabPanel>
      <RecipeTabPanel tab="history">
      {/* Changelog — one row per version (editing session) */}
      <Card id="recipe-history" className="scroll-mt-20">
        <CardHeader><h2>Changelog</h2></CardHeader>
        {recipe.changes.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {groupChangesByVersion(recipe.changes).map((g) => {
              const latest = g.entries[0];
              const editors = Array.from(
                new Set(g.entries.map((e) => e.userName).filter(Boolean)),
              ) as string[];
              return (
                <li key={`${g.version}-${latest.id}`} className="flex items-start gap-3 px-4 py-3">
                  <Badge>v{g.version}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium text-zinc-800">{summarizeSession(g.entries)}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-400">
                        <LocalTime date={latest.createdAt} />
                      </p>
                    </div>
                    {g.entries.length === 1 ? (
                      latest.detail && (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                          {latest.detail}
                        </p>
                      )
                    ) : (
                      <ul className="mt-1 space-y-0.5">
                        {g.entries.map((e) => (
                          <li key={e.id} className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                            {e.detail ? (e.detail.includes("\n") ? `${e.summary}:\n${e.detail}` : `${e.summary} — ${e.detail}`) : e.summary}
                          </li>
                        ))}
                      </ul>
                    )}
                    {editors.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-zinc-400">by {editors.join(", ")}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      </RecipeTabPanel>
    </RecipeWorkspace>
    </WorkspaceInspector>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-hairline pt-4">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-700">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;
  // Free-text fields (storage, food safety) can run several lines — stack the
  // label above a left-aligned block that preserves the entered line breaks.
  if (multiline) {
    return (
      <div>
        <dt className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-800">{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-3">
      <dt className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-800">{value}</dd>
    </div>
  );
}
