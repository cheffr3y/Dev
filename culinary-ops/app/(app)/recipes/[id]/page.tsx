import { measurementSelect, recipePurchaseQuantity } from "@/lib/ingredients/measurements";
import { PriceTrend } from "@/components/PriceTrend";
import { loadPriceTrends } from "@/lib/invoices/price-trends-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import {
  recipeCost,
  buildPriceGapMap,
  costPerYieldUnit,
  costUnitLabel,
  foodCostPct,
  lineCost,
  componentLineCost,
  componentBatchFactor,
  buildCostMap,
  priceFreshness,
  preciseNum, money,
  pct,
  num,
} from "@/lib/recipes/costing";
import { unitLabel, displayMeasure } from "@/lib/recipes/units";
import { allergenLabels, effectiveAllergens, inheritedAllergenSources, parseAllergens } from "@/lib/recipes/allergens";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, TableScroll, Textarea } from "@/components/ui";
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
import { CostIntegrityBanner } from "@/components/CostAudit";
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
  const affectedSubRecipes = new Set<string>();
  const visitedAuditRecipes = new Set<string>([id]);
  const auditById = new Map(allRecipes.map(node => [node.id, node]));
  const walkAudit = (recipeId: string) => {
    for (const component of auditById.get(recipeId)?.components ?? []) {
      if (visitedAuditRecipes.has(component.childId)) continue;
      visitedAuditRecipes.add(component.childId);
      const childGap = gapMap.get(component.childId);
      const child = auditById.get(component.childId);
      if (child && childGap && (childGap.unpriced.size || childGap.stale.size)) affectedSubRecipes.add(child.name);
      walkAudit(component.childId);
    }
  };
  walkAudit(id);
  const itemNames = new Map(allRecipes.flatMap(node => node.items.map(({ item }) => [item.id, item.name] as const)));
  const gapNames = (ids?: Set<string>) => [...(ids ?? [])].map(id => itemNames.get(id) ?? id).sort();
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
  const costStatus = !complete ? "Cost needs review" : costPlan.stale ? "Estimate uses stale prices" : "All inputs costed";
  const perUnit = costPerYieldUnit(totalCost, recipe.yieldQty);
  const costUnit = costUnitLabel(recipe.yieldUnit);
  const fcp = complete ? foodCostPct(perUnit, recipe.menuPrice) : null;
  const margin = complete && recipe.menuPrice ? recipe.menuPrice - perUnit : null;
  const methodSteps = parseSteps(recipe.instructions);

  // Ingredient and sub-recipe tags are inherited; manual tags remain additive.
  const ownAllergens = parseAllergens(recipe.allergens);
  const inheritedAllergens = inheritedAllergenSources(recipe.id, byId);
  const effectiveAllergenKeys = effectiveAllergens(recipe.id, byId);

  // Recipes available to add as sub-recipes (everything but this one).
  const subRecipeOptions = allRecipes.filter((r) => r.id !== recipe.id);

  return (
    <WorkspaceInspector><div>
      <div className="mb-4">
        <Link href="/recipes" className="text-sm text-blue-600 hover:underline">
          ← Recipes
        </Link>
      </div>
      <PageHeader
        title={recipe.name}
        subtitle={`${recipe.prodCode} · v${recipe.version} · ${recipe.category}${recipe.station ? ` · ${recipe.station}` : ""} · yields ${num(recipe.yieldQty)} ${recipe.yieldUnit}`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/recipes/${recipe.id}/print`} variant="secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" strokeLinejoin="round" />
              </svg>
              Print Recipe Card
            </LinkButton>
            <LinkButton href={`/recipes/${recipe.id}/print?costs=1`} variant="gold">
              Print with Costing
            </LinkButton>
          </div>
        }
      />

      <nav aria-label="Recipe sections" className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-600">
        <a href="#recipe-ingredients" className="py-1 underline">Ingredients</a>
        {(canEdit || recipe.components.length > 0) && <a href="#recipe-sub-recipes" className="py-1 underline">Sub-recipes</a>}
        <a href="#recipe-details" className="py-1 underline">{canEdit ? "Edit yield & details" : "Recipe details"}</a>
        <a href="#recipe-method" className="py-1 underline">Method</a>
        <a href="#recipe-dependencies" className="py-1 underline">Dependencies</a>
        <a href="#recipe-history" className="py-1 underline">History</a>
      </nav>
      <section aria-label="Recipe cost overview" className="mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">Standard batch costing</h2>
          <Badge color={!complete || costPlan.stale ? "amber" : "green"}>{costStatus}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCardBlock label="Total Cost" value={money(complete ? totalCost : null)} sub={complete ? `${money(ingredientsCost)} ingredients · ${money(subRecipesCost)} sub-recipes` : "Review inputs for a batch total"} />
          <StatCardBlock label={`Cost / ${costUnit}`} value={money(complete ? perUnit : null, 5)} />
          <StatCardBlock label="Menu Price" value={money(recipe.menuPrice, 5)} sub={margin != null ? `${money(margin, 5)} margin / ${costUnit}` : undefined} />
          <StatCardBlock label="Food Cost %" value={fcp == null ? "—" : pct(fcp)} />
        </div>
        {!complete && <p className="mt-2 text-sm text-amber-700">Some prices, quantities, units, or nested builds need review. Line estimates are below. <a href="#recipe-dependencies" className="underline">Inspect the full build</a>.</p>}
      </section>
      <CostIntegrityBanner compact unpriced={gapNames(gap?.unpriced)} stale={gapNames(gap?.stale)} subRecipes={[...affectedSubRecipes].sort()} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Ingredients, sub-recipes, and method */}
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {/* Ingredients */}
          <Card id="recipe-ingredients" className="scroll-mt-20">
            <CardHeader><h2>Ingredients</h2></CardHeader>
            <TableScroll aria-label="Recipe ingredients">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-4 py-2 text-right font-medium">Line Cost</th>
                  {canEdit && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recipe.items.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-4 py-6 text-center text-zinc-400">
                      No ingredients yet.
                    </td>
                  </tr>
                )}
                {recipe.items.map((ri) => {
                  const lc = lineCost(ri);
                  const m = displayMeasure(ri.quantity, ri.unit);
                  const freshness = priceFreshness(ri.item.priceUpdatedAt, ri.item.unitCost, asOf);
                  const purchased = ri.item.measurementReviewedAt ? recipePurchaseQuantity(ri.quantity, ri.unit, ri.item) : null;
                  return (
                    <tr key={ri.id}>
                      <td className="px-4 py-2 text-zinc-800">
                        <InspectorLink kind="item" id={ri.item.id} className="font-medium text-blue-600 underline">{ri.item.name}</InspectorLink>
                        {canEdit && <RecipeIngredientEditor recipeId={recipe.id} line={ri} items={items} groupNames={groupNames} />}
                        {parseAllergens(ri.item.allergens).length > 0 && <div className="mt-1"><AllergenBadges allergens={ri.item.allergens} /></div>}
                        {ri.groupName && <span className="ml-2 font-mono text-[10px] uppercase text-gold">{ri.groupName} · {ri.sortOrder}</span>}
                        {ri.note && <span className="ml-2 text-xs text-zinc-400">{ri.note}</span>}
                        {!lc.converted && (
                          <span
                            className="ml-2 align-middle"
                            title={ri.item.measurementReviewedAt ? "Reviewed ingredient conversion is unavailable; cost remains unknown." : `Can't convert ${unitLabel(ri.unit)} to ${unitLabel(ri.item.unit)} — cost assumes quantity is in ${unitLabel(ri.item.unit)}.`}
                          >
                            <Badge color="amber">unit mismatch</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-600">
                        {num(m.qty)} {m.label}
                        {ri.item.measurementReviewedAt && <span className="block text-xs text-zinc-500">Purchased: {purchased == null ? "Needs review" : `${preciseNum(purchased)} ${ri.item.unit}`}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-500">
                        {freshness.unpriced ? <Badge color="amber">No price</Badge> : <>
                          <span className="tabular-nums">{money(ri.item.unitCost, 5)}/{unitLabel(ri.item.unit)}</span>
                          <span className="block text-xs">{freshness.stale ? <Badge color="amber">{freshness.label}</Badge> : freshness.label}</span>
                          {priceTrends[ri.item.id] && <PriceTrend trend={priceTrends[ri.item.id]} />}
                        </>}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-zinc-800">{money(freshness.unpriced ? null : lc.cost)}</td>
                      {canEdit && (
                        <td className="px-4 py-2 text-right">
                          <form action={removeRecipeItem}>
                            <input type="hidden" name="id" value={ri.id} />
                            <input type="hidden" name="recipeId" value={recipe.id} />
                            <button className="text-xs text-red-500 hover:underline">remove</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                  <td className="px-4 py-2 text-zinc-700" colSpan={3}>
                    Ingredients subtotal
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-900">{money(ingredientsCost)}</td>
                  {canEdit && <td></td>}
                </tr>
              </tfoot>
            </table>
            </TableScroll>

            {canEdit && (
              <div className="border-t border-zinc-100 p-4">
                <AddIngredientForm
                  groupNames={groupNames}
                  nextSortOrder={Math.max(-1, ...recipe.items.map(line => line.sortOrder)) + 1}
                  recipeId={recipe.id}
                  items={items.filter(item => !recipe.items.some(line => line.itemId === item.id))}
                />
              </div>
            )}
          </Card>

          {/* Sub-recipes */}
          {(recipe.components.length > 0 || canEdit) && (
            <Card id="recipe-sub-recipes" className="scroll-mt-20">
              <CardHeader><h2>Sub-recipes</h2></CardHeader>
              <TableScroll aria-label="Recipe sub-recipes">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Recipe</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Line Cost</th>
                    {canEdit && <th className="px-4 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {recipe.components.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 4 : 3} className="px-4 py-6 text-center text-zinc-400">
                        No sub-recipes. Build this recipe from other recipes below.
                      </td>
                    </tr>
                  )}
                  {recipe.components.map((c) => {
                    const cm = displayMeasure(c.quantity, c.unit);
                    return (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-zinc-800">
                        <InspectorLink kind="recipe" id={c.childId} className="font-medium text-blue-600 underline">
                          {c.child.name}
                        </InspectorLink>
                        {!componentBatchFactor(c.quantity, c.unit, c.child.yieldQty, c.child.yieldUnit).converted && <span className="ml-2"><Badge color="amber">Unit mismatch</Badge></span>}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-600">
                        {num(cm.qty)} {cm.label}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-zinc-800">
                        {money(componentLineCost(c, costMap, byId))}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2 text-right">
                          <form action={removeSubRecipe}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="parentId" value={recipe.id} />
                            <button className="text-xs text-red-500 hover:underline">remove</button>
                          </form>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
                {recipe.components.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                      <td className="px-4 py-2 text-zinc-700" colSpan={2}>
                        Sub-recipes subtotal
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-900">{money(subRecipesCost)}</td>
                      {canEdit && <td></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
              </TableScroll>

              {canEdit && (
                <SubRecipeForm
                  parentId={recipe.id}
                  linked={recipe.components.map(({ childId, quantity, unit }) => ({ childId, quantity, unit }))}
                  options={subRecipeOptions.map((r) => ({
                    id: r.id,
                    name: r.name,
                    yieldQty: r.yieldQty,
                    yieldUnit: r.yieldUnit,
                    cost: costMap.get(r.id) ?? 0,
                  }))}
                />
              )}
            </Card>
          )}

          {/* Method */}
          <Card id="recipe-method" className="scroll-mt-20">
            <CardHeader><h2>Method</h2></CardHeader>
            {canEdit ? (
              <>
                <MethodEditor initialSteps={methodSteps} />
                <div className="flex flex-wrap items-center gap-3 border-t border-hairline p-4">
                  <Button type="submit" form="recipeForm" variant="secondary">Save method &amp; details</Button>
                  <p className="text-xs text-zinc-500">Saves the method and recipe detail fields together.</p>
                </div>
              </>
            ) : methodSteps.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">No method recorded.</p>
            ) : (
              <ol className="space-y-4 p-5">
                {methodSteps.map((step, i) => {
                  const { action, detail } = splitStep(step);
                  return (
                    <li key={i} className="flex gap-4 text-sm leading-relaxed text-zinc-700">
                      <span className="font-display text-lg leading-none text-gold tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="pt-0.5">
                        {action && <span className="font-semibold text-ink">{action} — </span>}
                        {detail}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

        </div>

        {/* ---- Right: recipe details ---- */}
        <div id="recipe-details" className="min-w-0 scroll-mt-20 space-y-3">
          {canEdit ? (
            <>
              <Card>
                <CardHeader><h2>Recipe details</h2></CardHeader>
                <form id="recipeForm" action={updateRecipe} className="space-y-5 p-4">
                  <input type="hidden" name="id" value={recipe.id} />

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Yield &amp; pricing</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Yield Qty">
                        <Input name="yieldQty" type="number" step="0.1" min="0.1" defaultValue={recipe.yieldQty} />
                      </Field>
                      <Field label="Yield Unit">
                        <Input name="yieldUnit" defaultValue={recipe.yieldUnit} />
                      </Field>
                    </div>
                    <Field label="Menu Price ($)">
                      <Input name="menuPrice" type="number" step="0.00001" min="0" defaultValue={recipe.menuPrice ?? ""} placeholder="—" />
                    </Field>
                  </div>

                  <Section title="Identity">
                    <div className="space-y-3">
                      <Field label="Name">
                        <Input name="name" required defaultValue={recipe.name} />
                      </Field>
                      <Field label="Category">
                        <Select name="category" defaultValue={recipe.category}>
                          {!RECIPE_CATEGORIES.includes(recipe.category) && <option value={recipe.category}>{recipe.category}</option>}
                          {RECIPE_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Station">
                        <Input name="station" defaultValue={recipe.station ?? ""} placeholder="Garde Manger, Bar…" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Timing">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Field label="Prep (min)">
                        <Input name="prepMinutes" type="number" min="0" defaultValue={recipe.prepMinutes ?? ""} placeholder="—" />
                      </Field>
                      <Field label="Cook (min)">
                        <Input name="cookMinutes" type="number" min="0" defaultValue={recipe.cookMinutes ?? ""} placeholder="—" />
                      </Field>
                      <Field label="Production person-min" hint="Standard hands-on estimate per recipe yield.">
                        <Input name="productionPersonMinutes" type="number" min="0" step="0.1" defaultValue={recipe.productionPersonMinutes ?? ""} placeholder="—" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Safety & Storage">
                    <div className="space-y-3">
                      <Field label="Critical / Food Safety" hint="HACCP critical limits — put each point on its own line for clarity.">
                        <Textarea name="criticalNotes" rows={3} defaultValue={recipe.criticalNotes ?? ""} placeholder={"Cook to 165°F internal\nHold above 140°F\nDiscard after 4 hrs in danger zone"} />
                      </Field>
                      <div>
                        <AllergenPicker selected={ownAllergens} inherited={inheritedAllergens} />
                        <p className="mt-2 text-xs text-zinc-500">Ingredient and sub-recipe tags are inherited automatically. Select any additional allergens here.</p>
                      </div>
                      <Field label="Storage Instructions" hint="One step per line so it's easy to follow on the line.">
                        <Textarea name="storage" rows={3} defaultValue={recipe.storage ?? ""} placeholder={"Cool rapidly to 41°F within 4 hrs\nStore covered & labeled, FIFO\nKeep below 40°F"} />
                      </Field>
                      <Field label="Shelf Life">
                        <Input name="shelfLife" defaultValue={recipe.shelfLife ?? ""} placeholder="3 days refrigerated" />
                      </Field>
                      <Field label="Hold Life (days)" hint="Drives the use-by date printed on cook packets. Leave blank if N/A.">
                        <Input name="holdLifeDays" type="number" min="0" defaultValue={recipe.holdLifeDays ?? ""} placeholder="—" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Production">
                    <Field label="Production Code" hint="Auto-generated, used in lot numbers. Frozen once it appears on a printed lot.">
                      <Input value={recipe.prodCode} disabled readOnly />
                    </Field>
                  </Section>

                  <Button type="submit" className="w-full">
                    Save changes
                  </Button>
                </form>
              </Card>
              <form action={deleteRecipe}>
                <input type="hidden" name="id" value={recipe.id} />
                <Button type="submit" variant="danger" className="w-full">
                  Delete recipe
                </Button>
              </form>
            </>
          ) : (
            <Card>
              <CardHeader><h2>Recipe details</h2></CardHeader>
              <dl className="space-y-2 p-4 text-sm">
                <DetailRow label="Category" value={recipe.category} />
                <DetailRow label="Station" value={recipe.station} />
                <DetailRow label="Yield" value={`${num(recipe.yieldQty)} ${recipe.yieldUnit}`} />
                <DetailRow label="Prep" value={recipe.prepMinutes != null ? `${recipe.prepMinutes} min` : null} />
                <DetailRow label="Cook" value={recipe.cookMinutes != null ? `${recipe.cookMinutes} min` : null} />
                <DetailRow label="Production labor" value={recipe.productionPersonMinutes != null ? `${num(recipe.productionPersonMinutes)} person-min / standard yield` : null} />
                <DetailRow label="Allergens" value={allergenLabels(effectiveAllergenKeys) || null} multiline />
                <DetailRow label="Storage" value={recipe.storage} multiline />
                <DetailRow label="Shelf life" value={recipe.shelfLife} />
                <DetailRow label="Hold life" value={recipe.holdLifeDays != null ? `${recipe.holdLifeDays} days` : null} />
                <DetailRow label="Prod. code" value={recipe.prodCode} />
                <DetailRow label="Critical" value={recipe.criticalNotes} multiline />
              </dl>
            </Card>
          )}
        </div>
      </div>
      <div id="recipe-dependencies" className="scroll-mt-20">
        <RecipeDependencyTree rootId={id} {...dependencyData} asOf={asOf.toISOString()} />
      </div>
      {/* Changelog — one row per version (editing session) */}
      <Card id="recipe-history" className="mt-5 scroll-mt-20">
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
    </div></WorkspaceInspector>
  );
}

function StatCardBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-canvas p-3 sm:p-4">
      <p className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold leading-tight tabular-nums text-ink sm:text-2xl">{value}</p>
      {sub && <p className="mt-2 text-xs text-zinc-500">{sub}</p>}
    </div>
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
