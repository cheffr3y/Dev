import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import { allergenReview, money, priceFreshness, PRICE_STALE_DAYS } from "@/lib/recipes/costing";
import { allergenLabels, parseAllergens } from "@/lib/recipes/allergens";
import { DIETS, parseDiet } from "@/lib/recipes/diet";
import { splitMethodAndNotes } from "@/lib/recipes/method";
import { measurementSelect } from "@/lib/ingredients/measurements";
import { duplicateIngredientGroups } from "@/lib/ingredients/ingredient-cleanup";
import { nameHasNotes, similarCategoryGroups, stepLooksClipped, unitProblems } from "@/lib/cleanup/cleanup-checks";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { moveIngredientCategory, reviewIngredientLabel } from "./actions";

// One place for everything that makes food cost, allergen lines, pull lists
// or printed recipe cards wrong. Most-used first; every row links to the fix.

const GRAIN_HINT = /\b(barley|rye|malt|malted|beer|ale|lager|stout|porter|ipa|pilsner|amber|seitan|spelt|farro|bulgur|semolina|couscous)\b/i;
const LIST_LIMIT = 60;
type Query = { all?: string | string[]; moved?: string; from?: string; to?: string };

export default async function CleanupPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const query = await searchParams;
  const showAll = query.all === "1";
  const [items, recipes, lines] = await Promise.all([
    prisma.item.findMany({
      select: { id: true, name: true, category: true, allergens: true, diet: true, allergenReviewedAt: true, unitCost: true, unit: true, priceUpdatedAt: true, _count: { select: { recipeItems: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.recipe.findMany({ select: { id: true, name: true, instructions: true }, orderBy: { name: "asc" } }),
    prisma.recipeItem.findMany({
      select: { quantity: true, unit: true, recipe: { select: { id: true, name: true } }, item: { select: { id: true, name: true, unit: true, ...measurementSelect } } },
    }),
  ]);
  const now = new Date();
  const byUse = <T extends { item: { name: string; _count: { recipeItems: number } } }>(a: T, b: T) =>
    b.item._count.recipeItems - a.item._count.recipeItems || a.item.name.localeCompare(b.item.name);
  const limit = <T,>(list: T[]) => showAll ? list : list.slice(0, LIST_LIMIT);

  // Allergens & diet
  const review = items.map((item) => ({ item, status: allergenReview(item.allergenReviewedAt, now) }))
    .filter(({ status }) => status.unreviewed || status.stale).sort(byUse);
  const untagged = items.filter((item) => !parseDiet(item.diet)).length;
  const glutenCheck = items.filter((item) => GRAIN_HINT.test(item.name) && !parseAllergens(item.allergens).includes("gluten"));
  // Prices: only ingredients a recipe uses affect food cost.
  const priced = items.filter((item) => item._count.recipeItems > 0)
    .map((item) => ({ item, price: priceFreshness(item.priceUpdatedAt, item.unitCost, now) }));
  const missingPrice = priced.filter(({ price }) => price.unpriced).sort(byUse);
  const stalePrice = priced.filter(({ price }) => price.stale).sort(byUse);
  // Duplicates
  const duplicates = duplicateIngredientGroups(items);
  const categoryCounts = new Map<string, number>();
  for (const item of items) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  const categoryGroups = similarCategoryGroups([...categoryCounts.keys()]);
  // Units
  const units = unitProblems(lines.map((line) => ({ recipeId: line.recipe.id, recipeName: line.recipe.name, quantity: line.quantity, unit: line.unit, item: line.item })));
  // Recipes & names
  const methods = recipes.map((recipe) => ({ recipe, steps: splitMethodAndNotes(recipe.instructions).steps }));
  const noMethod = methods.filter(({ steps }) => steps.length === 0).map(({ recipe }) => recipe);
  const clipped = methods.map(({ recipe, steps }) => ({ recipe, steps: steps.map((text, i) => ({ n: i + 1, text })).filter(({ text }) => stepLooksClipped(text)) }))
    .filter(({ steps }) => steps.length);
  const noisyNames = items.filter((item) => nameHasNotes(item.name));
  // Matches the sidebar badge (lib/cleanup/cleanup-badge.ts).
  const reviewIds = new Set(review.map(({ item }) => item.id));
  const badge = items.filter((item) => item._count.recipeItems > 0 && (reviewIds.has(item.id) || priceFreshness(item.priceUpdatedAt, item.unitCost, now).unpriced)).length;

  const sections = [
    { id: "allergens", label: "Allergens & diet", count: review.length + glutenCheck.length },
    { id: "prices", label: "Prices", count: missingPrice.length + stalePrice.length },
    { id: "duplicates", label: "Duplicates", count: duplicates.length + categoryGroups.length },
    { id: "units", label: "Units", count: units.length },
    { id: "recipes", label: "Recipes & names", count: noMethod.length + clipped.length + noisyNames.length },
  ];

  return <div className="space-y-6">
    <PageHeader title="Cleanup" subtitle={`Everything that makes food cost, allergen lines, pull lists or recipe cards wrong. Most-used first. ${badge ? `${badge} ingredient${badge === 1 ? "" : "s"} used in recipes need a label check or a price.` : "Every ingredient used in a recipe has a current label check and a price."}`} />

    {query.moved && <p role="status" className="rounded-lg border border-sage-soft bg-pale-sage p-3 text-sm">
      Moved {query.moved} ingredient{query.moved === "1" ? "" : "s"} from “{query.from}” to “{query.to}”.
    </p>}

    <nav aria-label="Cleanup sections" className="sticky top-14 z-20 -mx-4 overflow-x-auto border-b border-hairline bg-cream/95 px-4 backdrop-blur md:-mx-6 md:px-6 no-print">
      <ul className="flex gap-1 py-2">
        {sections.map((section) => <li key={section.id}>
          <a href={`#${section.id}`} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-hairline bg-canvas px-3 py-1.5 text-sm hover:border-ink">
            {section.label}
            <span className={`tabular-nums text-xs font-semibold ${section.count ? "text-paprika" : "text-sage"}`}>{section.count || "✓"}</span>
          </a>
        </li>)}
      </ul>
    </nav>

    {/* Allergens & diet */}
    <section id="allergens" className="scroll-mt-28 space-y-4">
      <SectionTitle title="Allergens & diet" note="Never reviewed, or last checked over 6 months ago." />
      <Card>
        <CardHeader><h3>Label review <span className="text-sm font-normal text-zinc-500">· {review.length} due · {untagged} with no diet</span></h3></CardHeader>
        <div className="p-4 sm:p-5">
          <p className="mb-3 text-sm text-zinc-600">Check each product label, set the diet, and press Label checked. Fix allergen tags on the ingredient page if they&apos;re wrong.</p>
          {!review.length ? <Done>Every ingredient has been reviewed in the last 6 months.</Done> : <ul className="divide-y divide-hairline">
            {limit(review).map(({ item, status }) => <li key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <Link href={`/items/${item.id}`} className="font-medium text-ink underline-offset-2 hover:underline">{item.name}</Link>
                <span className="block text-xs text-zinc-500">{item.category} · {usedIn(item._count.recipeItems)} · {status.label}</span>
                <span className="block text-xs text-zinc-600">Allergens: {allergenLabels(parseAllergens(item.allergens)) || "none tagged"}</span>
              </div>
              {canEdit ? <form action={reviewIngredientLabel} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={item.id} />
                <label className="sr-only" htmlFor={`diet-${item.id}`}>Diet for {item.name}</label>
                <select id={`diet-${item.id}`} name="diet" defaultValue={item.diet ?? ""} className="rounded border border-hairline bg-canvas px-2 py-1.5 text-sm">
                  <option value="">Diet not tagged</option>
                  {DIETS.map((diet) => <option key={diet.key} value={diet.key}>{diet.label}</option>)}
                </select>
                <button className="rounded-full border border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white">Label checked</button>
                <Link href={`/items/${item.id}`} className="text-xs text-gold underline">Edit allergens</Link>
              </form> : <Badge color="amber">{parseDiet(item.diet) ?? "diet not tagged"}</Badge>}
            </li>)}
          </ul>}
          <ShowAll shown={limit(review).length} total={review.length} anchor="allergens" />
        </div>
      </Card>
      <Card>
        <CardHeader><h3>Possible gluten, not tagged ({glutenCheck.length})</h3></CardHeader>
        <div className="p-4 text-sm sm:p-5">
          <p className="mb-2 text-zinc-600">Names that suggest barley, rye, malt or beer. A hint only: check each label before tagging.</p>
          {glutenCheck.length ? <ItemLinks items={glutenCheck.map((item) => ({ id: item.id, name: item.name, meta: item.category }))} /> : <Done>Nothing flagged.</Done>}
        </div>
      </Card>
    </section>

    {/* Prices */}
    <section id="prices" className="scroll-mt-28 space-y-4">
      <SectionTitle title="Prices" note="Ingredients used in at least one recipe. A missing price makes food cost read low." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h3>No price ({missingPrice.length})</h3></CardHeader>
          <div className="p-4 text-sm sm:p-5">
            {missingPrice.length ? <PriceList rows={limit(missingPrice).map(({ item }) => ({ id: item.id, name: item.name, uses: item._count.recipeItems, detail: `per ${item.unit}` }))} /> : <Done>Every used ingredient has a price.</Done>}
            <ShowAll shown={limit(missingPrice).length} total={missingPrice.length} anchor="prices" />
          </div>
        </Card>
        <Card>
          <CardHeader><h3>Price over {PRICE_STALE_DAYS} days old ({stalePrice.length})</h3></CardHeader>
          <div className="p-4 text-sm sm:p-5">
            {stalePrice.length ? <PriceList rows={limit(stalePrice).map(({ item, price }) => ({ id: item.id, name: item.name, uses: item._count.recipeItems, detail: `${money(item.unitCost, 2)}/${item.unit} · ${price.label}` }))} /> : <Done>No stale prices.</Done>}
            <ShowAll shown={limit(stalePrice).length} total={stalePrice.length} anchor="prices" />
          </div>
        </Card>
      </div>
    </section>

    {/* Duplicates */}
    <section id="duplicates" className="scroll-mt-28 space-y-4">
      <SectionTitle title="Duplicates" note="Two records for one thing split the pull list and the order." />
      <Card>
        <CardHeader><h3>Categories that look the same ({categoryGroups.length})</h3></CardHeader>
        <div className="space-y-3 p-4 text-sm sm:p-5">
          {!categoryGroups.length ? <Done>No look-alike categories.</Done> : categoryGroups.map((group) => <div key={group.join("|")} className="rounded-lg border border-hairline p-3">
            <p className="font-medium">{group.map((name) => `${name} (${categoryCounts.get(name)})`).join(" · ")}</p>
            {canEdit && <div className="mt-2 flex flex-wrap gap-2">
              {group.flatMap((from) => group.filter((to) => to !== from).map((to) => <form key={`${from}>${to}`} action={moveIngredientCategory}>
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <button className="rounded-full border border-hairline px-3 py-1 text-xs hover:border-ink">Move {categoryCounts.get(from)} from “{from}” into “{to}”</button>
              </form>))}
            </div>}
          </div>)}
          <p className="text-xs text-zinc-500">Also worth a look: ingredients filed in the wrong category (e.g. Water under Frozen). Change those on the ingredient page.</p>
        </div>
      </Card>
      <Card>
        <CardHeader><h3>Possible duplicate ingredients ({duplicates.length})</h3></CardHeader>
        <div className="p-4 text-sm sm:p-5">
          <p className="mb-2 text-zinc-600">Same words in a different order or plural. Compare product and vendor before merging. Names that differ more (e.g. “Black Pepper” vs “Black Pepper, Coarse Grind”) won&apos;t show here; use the compare tool for those.</p>
          {duplicates.length ? <ul className="space-y-1">{duplicates.map((group) => <li key={group[0].id}>
            {group.map((item, i) => <span key={item.id}>{i > 0 && " / "}<Link href={`/items/${item.id}`} className="underline">{item.name}</Link></span>)}
            {canEdit && <Link href={`/items/merge?source=${group[1].id}&target=${group[0].id}`} className="ml-2 text-xs text-gold underline">Compare</Link>}
          </li>)}</ul> : <Done>No look-alike names.</Done>}
          {canEdit && <Link href="/items/cleanup" className="mt-3 inline-block text-sm text-gold underline">Open the compare &amp; merge tool →</Link>}
        </div>
      </Card>
    </section>

    {/* Units */}
    <section id="units" className="scroll-mt-28 space-y-4">
      <SectionTitle title="Units" note="Recipe amounts that can't be turned into how the ingredient is bought." />
      <Card>
        <CardHeader><h3>Can&apos;t convert ({units.length})</h3></CardHeader>
        <div className="p-4 text-sm sm:p-5">
          <p className="mb-3 text-zinc-600">These lines add no cost and print as split amounts on pull lists (“1.28 qt + 1.14 lb”). Fix by recording a weight per cup or per each on the ingredient (Measurements), or change the recipe line&apos;s unit.</p>
          {!units.length ? <Done>Every recipe line converts.</Done> : <ul className="divide-y divide-hairline">
            {limit(units).map((problem) => <li key={problem.itemId} className="py-2">
              <Link href={`/items/${problem.itemId}`} className="font-medium underline-offset-2 hover:underline">{problem.itemName}</Link>
              <span className="text-zinc-600"> · bought by <b>{problem.purchaseUnit}</b>, recipes use <b>{problem.units.join(", ")}</b></span>
              <span className="block text-xs text-zinc-500">
                {problem.recipes.slice(0, 6).map((recipe, i) => <span key={recipe.id}>{i > 0 && ", "}<Link href={`/recipes/${recipe.id}`} className="underline">{recipe.name}</Link></span>)}
                {problem.recipes.length > 6 && ` and ${problem.recipes.length - 6} more`}
              </span>
            </li>)}
          </ul>}
          <ShowAll shown={limit(units).length} total={units.length} anchor="units" />
        </div>
      </Card>
    </section>

    {/* Recipes & names */}
    <section id="recipes" className="scroll-mt-28 space-y-4">
      <SectionTitle title="Recipes & names" note="Things that print wrong on recipe cards and order lists." />
      <Card>
        <CardHeader><h3>Steps that may be missing a first letter ({clipped.length} recipes)</h3></CardHeader>
        <div className="p-4 text-sm sm:p-5">
          <p className="mb-2 text-zinc-600">Steps that start with a lowercase letter, like “lace brisket”. Open the recipe and fix the step if it&apos;s cut off.</p>
          {clipped.length ? <ul className="space-y-2">{clipped.map(({ recipe, steps }) => <li key={recipe.id}>
            <Link href={`/recipes/${recipe.id}`} className="font-medium underline">{recipe.name}</Link>
            <ul className="mt-0.5 space-y-0.5 text-xs text-zinc-600">{steps.slice(0, 4).map((step) => <li key={step.n}>Step {step.n}: “{step.text.slice(0, 70)}{step.text.length > 70 ? "…" : ""}”</li>)}</ul>
          </li>)}</ul> : <Done>Nothing flagged.</Done>}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h3>Recipes with no method ({noMethod.length})</h3></CardHeader>
          <div className="p-4 text-sm sm:p-5">
            {noMethod.length ? <ul className="grid gap-1 sm:grid-cols-2">{noMethod.map((recipe) => <li key={recipe.id}><Link href={`/recipes/${recipe.id}`} className="underline">{recipe.name}</Link></li>)}</ul> : <Done>Every recipe has a method.</Done>}
          </div>
        </Card>
        <Card>
          <CardHeader><h3>Ingredient names with notes in them ({noisyNames.length})</h3></CardHeader>
          <div className="p-4 text-sm sm:p-5">
            <p className="mb-2 text-zinc-600">Brackets, question marks or “please…” typed into the name print on order lists.</p>
            {noisyNames.length ? <ItemLinks items={noisyNames.map((item) => ({ id: item.id, name: item.name, meta: item.category }))} /> : <Done>Names are clean.</Done>}
          </div>
        </Card>
      </div>
    </section>
  </div>;
}

function usedIn(n: number) {
  return `used in ${n} recipe${n === 1 ? "" : "s"}`;
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return <div><h2 className="font-display text-2xl text-ink">{title}</h2><p className="text-sm text-zinc-600">{note}</p></div>;
}

function Done({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-sage">✓ {children}</p>;
}

function ShowAll({ shown, total, anchor }: { shown: number; total: number; anchor: string }) {
  return total > shown ? <Link href={`/cleanup?all=1#${anchor}`} className="mt-3 inline-block text-sm text-gold underline">Show all {total}</Link> : null;
}

function ItemLinks({ items }: { items: { id: string; name: string; meta: string }[] }) {
  return <ul className="list-disc space-y-1 pl-5">{items.map((item) => <li key={item.id}><Link href={`/items/${item.id}`} className="underline">{item.name}</Link> <span className="text-xs text-zinc-500">· {item.meta}</span></li>)}</ul>;
}

function PriceList({ rows }: { rows: { id: string; name: string; uses: number; detail: string }[] }) {
  return <ul className="divide-y divide-hairline">{rows.map((row) => <li key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
    <Link href={`/items/${row.id}`} className="min-w-0 truncate underline-offset-2 hover:underline">{row.name}</Link>
    <span className="shrink-0 text-xs tabular-nums text-zinc-500">{row.detail} · {usedIn(row.uses)}</span>
  </li>)}</ul>;
}
