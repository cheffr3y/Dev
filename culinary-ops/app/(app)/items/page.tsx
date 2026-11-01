import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import { money, priceFreshness, PRICE_STALE_DAYS } from "@/lib/recipes/costing";
import { Badge, Button, Card, Input, PageHeader, LinkButton } from "@/components/ui";
import { createItem, deleteItem } from "./actions";
import { AllergenBadges } from "@/components/AllergenBadges";
import Link from "next/link";
import { IngredientFields } from "@/components/IngredientFields";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredients/ingredient-fields";
import { duplicateIngredientGroups, ingredientNameKey } from "@/lib/ingredients/ingredient-cleanup";
import { ingredientUsageSelect } from "@/lib/ingredients/ingredient-replacement";
import { EditGrid } from "@/components/EditGrid";
import { CatalogCell } from "@/components/CatalogCells";
import { ingredientIntegrity } from "@/lib/dashboard/morning-pulse";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; flag?: string; q?: string }>;
}) {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const { category, flag, q = "" } = await searchParams;

  const [items, vendors] = await Promise.all([
    // Load the whole catalog so price-coverage counts are global, then filter
    // in memory — the master list is small and this keeps the counts honest.
    prisma.item.findMany({ include: { vendor: true, _count: { select: { ...ingredientUsageSelect, quotes: true } } }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);

  const now = new Date();
  const withFreshness = items.map((item) => ({ item, freshness: priceFreshness(item.priceUpdatedAt, item.unitCost, now) }));
  const missingCount = withFreshness.filter((x) => x.freshness.unpriced).length;
  const staleCount = withFreshness.filter((x) => x.freshness.stale).length;

  const groups = duplicateIngredientGroups(items);
  const duplicateIds = new Set(groups.flatMap(group => group.map(item => item.id)));
  const unused = items.filter(item => Object.values(item._count).every(count => count === 0)).length;
  const categories = [...new Set([...INGREDIENT_CATEGORIES, ...items.map(item => item.category)])];

  const visible = withFreshness.filter(({ item, freshness }) => {
    if (flag === "integrity") {
      const issues = ingredientIntegrity(item);
      if (!Object.values(item._count).some(count => count > 0) || !Object.values(issues).some(Boolean)) return false;
    }
    if (category && item.category !== category) return false;
    if (flag === "duplicates" && !duplicateIds.has(item.id)) return false;
    if (flag === "unused" && Object.values(item._count).some(count => count > 0)) return false;
    const search = ingredientNameKey([item.name, item.vendor?.name, item.sku, item.gcode].filter(Boolean).join(" "));
    if (q && !ingredientNameKey(q).split(" ").every(token => search.includes(token))) return false;
    if (flag === "missing" && !freshness.unpriced) return false;
    if (flag === "stale" && !freshness.stale) return false;
    return true;
  });

  // Build a catalog href preserving the other active filter.
  const hrefWith = (next: { category?: string | null; flag?: string | null }) => {
    const params = new URLSearchParams();
    const cat = next.category === undefined ? category : next.category;
    const fl = next.flag === undefined ? flag : next.flag;
    if (q) params.set("q", q);
    if (cat) params.set("category", cat);
    if (fl) params.set("flag", fl);
    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  };

  return (
    <div>
      <PageHeader
        title="Ingredients"
        subtitle="Shared ingredients, allergen tags, costs, and vendors."
        action={canEdit ? <LinkButton href="/items/cleanup">Review duplicates ({groups.length})</LinkButton> : undefined}
      />

      {canEdit && <Link href="/vendors/invoices" className="mb-4 inline-block text-sm text-blue-600 underline">Invoice documents</Link>}
      {flag === "integrity" && <p className="mb-4 text-sm text-amber-700">Showing in-use ingredients with missing costs, units, or vendors. <Link href="/items" className="underline">View all ingredients</Link></p>}

      {/* Price coverage — theo food cost is only as honest as these prices. */}
      {(missingCount > 0 || staleCount > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="font-medium">Price coverage</span>
          {missingCount > 0 && (
            <a href={hrefWith({ flag: flag === "missing" ? null : "missing" })} className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-white">
              {missingCount} missing a price →
            </a>
          )}
          {staleCount > 0 && (
            <a href={hrefWith({ flag: flag === "stale" ? null : "stale" })} className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-white">
              {staleCount} stale (&gt;{PRICE_STALE_DAYS}d) →
            </a>
          )}
          {flag && (
            <a href={hrefWith({ flag: null })} className="text-xs text-amber-700 underline">
              clear filter
            </a>
          )}
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        {category && <input type="hidden" name="category" value={category} />}
        {flag && <input type="hidden" name="flag" value={flag} />}
        <Input name="q" defaultValue={q} placeholder="Search name, vendor, item # or GCODE…" aria-label="Search ingredients" className="max-w-md" />
        <Button type="submit" variant="secondary">Search</Button>
        <Link href={hrefWith({ flag: flag === "duplicates" ? null : "duplicates" })} className="text-sm text-blue-600 hover:underline">Possible duplicates ({groups.length})</Link>
        <Link href={hrefWith({ flag: flag === "unused" ? null : "unused" })} className="text-sm text-blue-600 hover:underline">Unused ({unused})</Link>
      </form>

      {/* Category filter */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a
          href={hrefWith({ category: null })}
          className={`rounded-full px-3 py-1 ${!category ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 border border-zinc-200"}`}
        >
          All
        </a>
        {categories.map((c) => (
          <a
            key={c}
            href={hrefWith({ category: c })}
            className={`rounded-full px-3 py-1 ${category === c ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 border border-zinc-200"}`}
          >
            {c}
          </a>
        ))}
      </div>

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ Add ingredient</summary>
          <Card className="mt-2 p-4">
            <form action={createItem} className="space-y-3">
              <IngredientFields vendors={vendors} />
              <Button type="submit">Add ingredient</Button>
            </form>
          </Card>
        </details>
      )}

      {canEdit && <p className="mb-3 text-xs text-zinc-500">Click a cell to edit · Tab / Shift+Tab across cells · Enter down a column · Escape cancels. Prices are per cost unit; pack size is descriptive.</p>}
      <Card className="catalog-grid overflow-x-auto"><EditGrid>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Ingredient</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Allergens</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Item #</th>
              <th className="px-4 py-2.5 font-medium">GCODE</th>
              <th className="px-4 py-2.5 font-medium">Pack size</th>
              <th className="px-4 py-2.5 font-medium">Cost unit</th>
              <th className="px-4 py-2.5 text-right font-medium">Unit Cost</th>
              <th className="px-4 py-2.5 font-medium">Price age</th>
              <th className="px-4 py-2.5 font-medium">Recipes</th>
              {canEdit && <th className="px-4 py-2.5"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 12 : 11} className="px-4 py-8 text-center text-zinc-400">
                  {items.length === 0 ? "No ingredients yet." : "No ingredients match your filters."}
                </td>
              </tr>
            )}
            {visible.map(({ item, freshness }) => (
              <tr key={item.id} className="align-top">
                <td className="px-4 py-2.5 font-medium text-zinc-800">
                  <Link href={`/items/${item.id}`} className="hover:underline">{item.name}</Link>
                  {item.packSize && <span className="ml-1 text-xs text-zinc-400">({item.packSize})</span>}
                  <Link href={`/items/${item.id}`} className="mt-1 block text-xs text-blue-600 hover:underline">{canEdit ? "edit / usage" : "view usage"}</Link>
                  {duplicateIds.has(item.id) && <span className="mt-1 block text-xs text-amber-700">Possible duplicate</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Badge>{item.category}</Badge>
                </td>
                <td className="px-4 py-2.5"><AllergenBadges allergens={item.allergens} /></td>
                <td className="px-4 py-2.5 text-zinc-600">{canEdit ? <CatalogCell item={item} field="vendorId" vendors={vendors} /> : item.vendor?.name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{canEdit ? <CatalogCell item={item} field="sku" vendors={vendors} /> : item.sku ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-700">{canEdit ? <CatalogCell item={item} field="gcode" vendors={vendors} /> : item.gcode ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{canEdit ? <CatalogCell item={item} field="packSize" vendors={vendors} /> : item.packSize ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{canEdit ? <CatalogCell item={item} field="unit" vendors={vendors} /> : item.unit}</td>
                <td className={`px-4 py-2.5 text-right ${freshness.unpriced ? "text-red-600" : "text-zinc-800"}`}>
                  {canEdit ? <CatalogCell item={item} field="unitCost" vendors={vendors} /> : freshness.unpriced ? "—" : money(item.unitCost, 5)}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {freshness.unpriced ? (
                    <Badge color="red">no price</Badge>
                  ) : freshness.stale ? (
                    <Badge color="amber">{freshness.label}</Badge>
                  ) : (
                    <span className="text-zinc-500">{freshness.label}</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><Link href={`/items/${item.id}`} className="text-blue-600 hover:underline">{item._count.recipeItems}</Link></td>
                {canEdit && (
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button disabled={Object.values(item._count).some(count => count > 0)} className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-zinc-300" title="Only ingredients with no usage can be deleted">delete</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></EditGrid>
      </Card>
    </div>
  );
}
