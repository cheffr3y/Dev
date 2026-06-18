import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import {
  recipeCost,
  costPerServing,
  foodCostPct,
  lineCost,
  componentLineCost,
  buildCostMap,
  money,
  pct,
  num,
} from "@/lib/costing";
import { UNIT_OPTIONS, unitLabel, displayMeasure } from "@/lib/units";
import { allergenLabels, effectiveAllergens, inheritedAllergenSources, parseAllergens } from "@/lib/allergens";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { AllergenPicker } from "@/components/AllergenPicker";
import { MethodEditor } from "@/components/MethodEditor";
import { SubRecipeForm } from "../SubRecipeForm";
import {
  addRecipeItem,
  removeRecipeItem,
  updateRecipe,
  deleteRecipe,
  removeSubRecipe,
} from "../actions";

const CATEGORIES = ["Starter", "Entrée", "Side", "Dessert", "Sauce", "Prep/Build", "Beverage", "Other"];

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
        items: { include: { item: true }, orderBy: { item: { name: "asc" } } },
        components: { include: { child: true }, orderBy: { child: { name: "asc" } } },
        changes: { orderBy: { createdAt: "desc" }, take: 25 },
      },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" } }),
    prisma.recipe.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        yieldQty: true,
        yieldUnit: true,
        allergens: true,
        items: { select: { quantity: true, unit: true, item: { select: { unitCost: true, unit: true } } } },
        components: { select: { childId: true, quantity: true, unit: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!recipe) notFound();

  const costMap = buildCostMap(allRecipes);
  const byId = new Map(allRecipes.map((r) => [r.id, r]));

  const ingredientsCost = recipeCost(recipe.items);
  const subRecipesCost = recipe.components.reduce(
    (sum, c) => sum + componentLineCost(c, costMap, byId),
    0,
  );
  const totalCost = ingredientsCost + subRecipesCost;
  const perServing = costPerServing(totalCost, recipe.yieldQty);
  const fcp = foodCostPct(perServing, recipe.menuPrice);
  const margin = recipe.menuPrice ? recipe.menuPrice - perServing : null;
  const methodSteps = parseSteps(recipe.instructions);

  // Allergens: this recipe's own selections, plus those auto-inherited from its
  // sub-recipes (shown locked in the editor; rolled into the effective set
  // displayed everywhere else).
  const ownAllergens = parseAllergens(recipe.allergens);
  const inheritedAllergens = inheritedAllergenSources(recipe.id, byId);
  const effectiveAllergenKeys = effectiveAllergens(recipe.id, byId);

  // Recipes available to add as sub-recipes (everything but this one).
  const subRecipeOptions = allRecipes.filter((r) => r.id !== recipe.id);

  return (
    <div>
      <div className="mb-4">
        <Link href="/recipes" className="text-sm text-blue-600 hover:underline">
          ← Recipes
        </Link>
      </div>
      <PageHeader
        title={recipe.name}
        subtitle={`${recipe.prodCode} · ${recipe.category}${recipe.station ? ` · ${recipe.station}` : ""} · yields ${num(recipe.yieldQty)} ${recipe.yieldUnit}`}
        action={
          <LinkButton href={`/recipes/${recipe.id}/print`} variant="gold">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" strokeLinejoin="round" />
            </svg>
            Print Recipe Card
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCardBlock label="Total Cost" value={money(totalCost)} sub={`${recipe.items.length} ingredients${recipe.components.length ? ` · ${recipe.components.length} sub-recipe${recipe.components.length === 1 ? "" : "s"}` : ""}`} />
        <StatCardBlock label="Cost / Serving" value={money(perServing)} />
        <StatCardBlock label="Menu Price" value={recipe.menuPrice ? money(recipe.menuPrice) : "—"} sub={margin != null ? `${money(margin)} margin` : undefined} />
        <StatCardBlock label="Food Cost %" value={fcp == null ? "—" : pct(fcp)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---- Left: builds (ingredients, sub-recipes, method, changelog) ---- */}
        <div className="space-y-6 lg:col-span-2">
          {/* Ingredients */}
          <Card>
            <CardHeader>Ingredients</CardHeader>
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
                  return (
                    <tr key={ri.id}>
                      <td className="px-4 py-2 text-zinc-800">
                        {ri.item.name}
                        {!lc.converted && (
                          <span
                            className="ml-2 align-middle"
                            title={`Can't convert ${unitLabel(ri.unit)} to ${unitLabel(ri.item.unit)} — cost assumes quantity is in ${unitLabel(ri.item.unit)}.`}
                          >
                            <Badge color="amber">unit mismatch</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-600">
                        {num(m.qty)} {m.label}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-500">
                        {money(ri.item.unitCost)}/{unitLabel(ri.item.unit)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-zinc-800">{money(lc.cost)}</td>
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

            {canEdit && (
              <div className="border-t border-zinc-100 p-4">
                <form action={addRecipeItem} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <div className="min-w-[180px] flex-1">
                    <Field label="Add ingredient">
                      <Select name="itemId" required defaultValue="">
                        <option value="" disabled>
                          Select item…
                        </option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({money(it.unitCost)}/{it.unit})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field label="Qty">
                      <Input name="quantity" type="number" step="0.01" min="0" defaultValue={1} />
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field label="Unit">
                      <Select name="unit" defaultValue="each">
                        {UNIT_OPTIONS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.units.map((u) => (
                              <option key={u} value={u}>
                                {unitLabel(u)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button type="submit">Add</Button>
                </form>
              </div>
            )}
          </Card>

          {/* Sub-recipes */}
          {(recipe.components.length > 0 || canEdit) && (
            <Card>
              <CardHeader>Sub-Recipes</CardHeader>
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
                        <Link href={`/recipes/${c.childId}`} className="hover:underline">
                          {c.child.name}
                        </Link>
                        <span className="ml-2 align-middle">
                          <Badge color="blue">sub-recipe</Badge>
                        </span>
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

              {canEdit && (
                <SubRecipeForm
                  parentId={recipe.id}
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
          <Card>
            <CardHeader>Method</CardHeader>
            {canEdit ? (
              <MethodEditor initialSteps={methodSteps} />
            ) : methodSteps.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">No method recorded.</p>
            ) : (
              <ol className="space-y-4 p-5">
                {methodSteps.map((step, i) => (
                  <li key={i} className="flex gap-4 text-sm leading-relaxed text-zinc-700">
                    <span className="font-display text-lg leading-none text-gold tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Changelog */}
          <Card>
            <CardHeader>Changelog</CardHeader>
            {recipe.changes.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">No changes recorded yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recipe.changes.map((c) => (
                  <li key={c.id} className="flex gap-3 px-4 py-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium text-zinc-800">{c.summary}</p>
                        <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-400">
                          {c.createdAt.toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {c.detail && (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                          {c.detail}
                        </p>
                      )}
                      {c.userName && <p className="mt-0.5 text-[11px] text-zinc-400">by {c.userName}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---- Right: recipe details ---- */}
        <div className="space-y-3">
          {canEdit ? (
            <>
              <Card>
                <CardHeader>Recipe Details</CardHeader>
                <form id="recipeForm" action={updateRecipe} className="space-y-5 p-4">
                  <input type="hidden" name="id" value={recipe.id} />

                  <div className="space-y-3">
                    <Field label="Name">
                      <Input name="name" required defaultValue={recipe.name} />
                    </Field>
                    <Field label="Category">
                      <Select name="category" defaultValue={recipe.category}>
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Station">
                      <Input name="station" defaultValue={recipe.station ?? ""} placeholder="Garde Manger, Bar…" />
                    </Field>
                  </div>

                  <Section title="Yield & Pricing">
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Yield Qty">
                        <Input name="yieldQty" type="number" step="0.1" min="0.1" defaultValue={recipe.yieldQty} />
                      </Field>
                      <Field label="Yield Unit">
                        <Input name="yieldUnit" defaultValue={recipe.yieldUnit} />
                      </Field>
                      <Field label="Menu Price ($)">
                        <Input name="menuPrice" type="number" step="0.01" min="0" defaultValue={recipe.menuPrice ?? ""} placeholder="—" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Timing">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Prep (min)">
                        <Input name="prepMinutes" type="number" min="0" defaultValue={recipe.prepMinutes ?? ""} placeholder="—" />
                      </Field>
                      <Field label="Cook (min)">
                        <Input name="cookMinutes" type="number" min="0" defaultValue={recipe.cookMinutes ?? ""} placeholder="—" />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Safety & Storage">
                    <div className="space-y-3">
                      <Field label="Critical / Food Safety" hint="HACCP critical limits — put each point on its own line for clarity.">
                        <Textarea name="criticalNotes" rows={3} defaultValue={recipe.criticalNotes ?? ""} placeholder={"Cook to 165°F internal\nHold above 140°F\nDiscard after 4 hrs in danger zone"} />
                      </Field>
                      <Field label="Allergens" hint="Check what this recipe's own ingredients contain. Allergens from sub-recipes are added automatically.">
                        <AllergenPicker selected={ownAllergens} inherited={inheritedAllergens} />
                      </Field>
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
              <CardHeader>Recipe Details</CardHeader>
              <dl className="space-y-2 p-4 text-sm">
                <DetailRow label="Category" value={recipe.category} />
                <DetailRow label="Station" value={recipe.station} />
                <DetailRow label="Yield" value={`${num(recipe.yieldQty)} ${recipe.yieldUnit}`} />
                <DetailRow label="Prep" value={recipe.prepMinutes != null ? `${recipe.prepMinutes} min` : null} />
                <DetailRow label="Cook" value={recipe.cookMinutes != null ? `${recipe.cookMinutes} min` : null} />
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
    </div>
  );
}

function StatCardBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-stone p-5">
      <p className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">{label}</p>
      <p className="mt-3 font-display text-3xl leading-none tracking-tight text-ink">{value}</p>
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
