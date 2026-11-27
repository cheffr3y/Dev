import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import { allergenReview, priceFreshness, PRICE_STALE_DAYS } from "@/lib/recipes/costing";
import { allergenLabels, parseAllergens } from "@/lib/recipes/allergens";
import { DIETS, parseDiet } from "@/lib/recipes/diet";
import { splitMethodAndNotes } from "@/lib/recipes/method";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { reviewIngredientLabel } from "./actions";

// Everything in the catalog that makes costs or allergen information wrong,
// in one place, most-used ingredients first.

const GRAIN_HINT = /\b(barley|rye|malt|malted|beer|ale|lager|stout|porter|ipa|pilsner|amber|seitan|spelt|farro|bulgur|semolina|couscous)\b/i;
type Query = { all?: string | string[] };

export default async function NeedsAttentionPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const showAll = (await searchParams).all === "1";
  const [items, recipes] = await Promise.all([
    prisma.item.findMany({
      select: { id: true, name: true, category: true, allergens: true, diet: true, allergenReviewedAt: true, unitCost: true, priceUpdatedAt: true, _count: { select: { recipeItems: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.recipe.findMany({ select: { id: true, name: true, instructions: true }, orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  const review = items
    .map((item) => ({ item, status: allergenReview(item.allergenReviewedAt, now) }))
    .filter(({ status }) => status.unreviewed || status.stale)
    .sort((a, b) => b.item._count.recipeItems - a.item._count.recipeItems || a.item.name.localeCompare(b.item.name));
  const untagged = items.filter((item) => !parseDiet(item.diet)).length;
  const prices = items.map((item) => priceFreshness(item.priceUpdatedAt, item.unitCost, now));
  const missingPrice = prices.filter((p) => p.unpriced).length;
  const stalePrice = prices.filter((p) => p.stale).length;
  const noMethod = recipes.filter((recipe) => splitMethodAndNotes(recipe.instructions).steps.length === 0);
  const glutenCheck = items.filter((item) => GRAIN_HINT.test(item.name) && !parseAllergens(item.allergens).includes("gluten"));
  const shown = showAll ? review : review.slice(0, 60);

  return <div className="space-y-6">
    <PageHeader title="Needs attention" subtitle="Everything that makes food cost or allergen information wrong, most-used ingredients first." />

    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Summary">
      <Stat label="Allergen review due" value={review.length} href="#review" />
      <Stat label="Diet not tagged" value={untagged} href="#review" />
      <Stat label="Missing price" value={missingPrice} href="/items?flag=missing" />
      <Stat label={`Price over ${PRICE_STALE_DAYS} days`} value={stalePrice} href="/items?flag=stale" />
      <Stat label="Recipes with no method" value={noMethod.length} href="#no-method" />
      <Stat label="Possible gluten, not tagged" value={glutenCheck.length} href="#gluten" />
    </ul>

    <Card>
      <CardHeader><h2 id="review">Allergen &amp; diet review <span className="text-sm font-normal text-zinc-500">· never reviewed or over 6 months</span></h2></CardHeader>
      <div className="p-4 sm:p-5">
        <p className="mb-3 text-sm text-zinc-600">Check each product label, set the diet, and save. Fix allergen tags on the ingredient page if they&apos;re wrong. Most-used ingredients are at the top.</p>
        {!review.length ? <p className="text-sm">Every ingredient has been reviewed in the last 6 months.</p> : <ul className="divide-y divide-hairline">
          {shown.map(({ item, status }) => <li key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <Link href={`/items/${item.id}`} className="font-medium text-ink underline-offset-2 hover:underline">{item.name}</Link>
              <span className="block text-xs text-zinc-500">
                {item.category} · used in {item._count.recipeItems} recipe{item._count.recipeItems === 1 ? "" : "s"} · {status.label}
              </span>
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
        {!showAll && review.length > shown.length && <Link href="/items/attention?all=1#review" className="mt-3 inline-block text-sm text-gold underline">Show all {review.length}</Link>}
      </div>
    </Card>

    <Card>
      <CardHeader><h2 id="gluten">Possible gluten, not tagged</h2></CardHeader>
      <div className="p-4 text-sm sm:p-5">
        <p className="mb-2 text-zinc-600">Names that suggest barley, rye, malt or beer. A hint only: check each label before tagging.</p>
        {glutenCheck.length ? <ul className="list-disc space-y-1 pl-5">{glutenCheck.map((item) => <li key={item.id}><Link href={`/items/${item.id}`} className="underline">{item.name}</Link> <span className="text-xs text-zinc-500">· {item.category}</span></li>)}</ul> : <p>Nothing flagged.</p>}
      </div>
    </Card>

    <Card>
      <CardHeader><h2 id="no-method">Recipes with no method</h2></CardHeader>
      <div className="p-4 text-sm sm:p-5">
        {noMethod.length ? <ul className="grid gap-1 sm:grid-cols-2">{noMethod.map((recipe) => <li key={recipe.id}><Link href={`/recipes/${recipe.id}`} className="underline">{recipe.name}</Link></li>)}</ul> : <p>Every recipe has a method.</p>}
      </div>
    </Card>
  </div>;
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return <li><Link href={href} className="block h-full rounded-lg border border-hairline bg-canvas px-3 py-2 hover:border-ink">
    <span className="block text-xs text-zinc-600">{label}</span>
    <span className={`block font-display text-2xl tabular-nums ${value ? "text-ink" : "text-sage"}`}>{value}</span>
  </Link></li>;
}
