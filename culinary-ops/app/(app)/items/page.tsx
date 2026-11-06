import { loadPriceTrends } from "@/lib/invoices/price-trends-data";
import { PriceTrend } from "@/components/PriceTrend";
import { WorkspaceInspector } from "@/components/WorkspaceInspector";
import { InspectorLink } from "@/components/InspectorLink";
import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import { money, priceFreshness, PRICE_STALE_DAYS } from "@/lib/recipes/costing";
import { Badge, Button, Card, Input, PageHeader, LinkButton, Select } from "@/components/ui";
import { createItem, deleteItem } from "./actions";
import { AllergenBadges } from "@/components/AllergenBadges";
import Link from "next/link";
import Form from "next/form";
import { IngredientFields } from "@/components/IngredientFields";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredients/ingredient-fields";
import { duplicateIngredientGroups, ingredientNameKey } from "@/lib/ingredients/ingredient-cleanup";
import { ingredientUsageSelect } from "@/lib/ingredients/ingredient-replacement";
import { EditGrid } from "@/components/EditGrid";
import { CatalogCell } from "@/components/CatalogCells";
import { ingredientIntegrity } from "@/lib/dashboard/morning-pulse";

const PAGE_SIZE = 40;

function DeleteIngredient({ id, disabled = false }: { id: string; disabled?: boolean }) {
  return (
    <form action={deleteItem}>
      <input type="hidden" name="id" value={id} />
      <button disabled={disabled} className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-zinc-300" title="Only ingredients with no usage can be deleted">Delete</button>
    </form>
  );
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : "";
  const flag = typeof params.flag === "string" ? params.flag : "";
  const q = typeof params.q === "string" ? params.q : "";
  const requestedPage = typeof params.page === "string" && /^[1-9]\d*$/.test(params.page) ? Number(params.page) : 1;

  const [items, vendors] = await Promise.all([
    // Load the whole catalog so price-coverage counts are global, then filter
    // in memory — the master list is small and this keeps the counts honest.
    prisma.item.findMany({ include: { vendor: true, _count: { select: { ...ingredientUsageSelect, quotes: true } } }, orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }] }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);

  const now = new Date();
  const withFreshness = items.map((item) => ({ item, freshness: priceFreshness(item.priceUpdatedAt, item.unitCost, now) }));
  const missingCount = withFreshness.filter((x) => x.freshness.unpriced).length;
  const staleCount = withFreshness.filter((x) => x.freshness.stale).length;

  const groups = duplicateIngredientGroups(items);
  const duplicateIds = new Set(groups.flatMap(group => group.map(item => item.id)));
  const categories = [...new Set([...INGREDIENT_CATEGORIES, ...items.map(item => item.category), ...(category ? [category] : [])])].sort((a, b) => a.localeCompare(b));
  const searchTokens = ingredientNameKey(q).split(" ").filter(Boolean);

  const visible = withFreshness.filter(({ item, freshness }) => {
    if (flag === "integrity") {
      const issues = ingredientIntegrity(item);
      if (!Object.values(item._count).some(count => count > 0) || !Object.values(issues).some(Boolean)) return false;
    }
    if (category && item.category !== category) return false;
    if (flag === "duplicates" && !duplicateIds.has(item.id)) return false;
    if (flag === "unused" && Object.values(item._count).some(count => count > 0)) return false;
    if (searchTokens.length) {
      const search = ingredientNameKey([item.name, item.vendor?.name, item.sku, item.gcode].filter(Boolean).join(" "));
      if (!searchTokens.every(token => search.includes(token))) return false;
    }
    if (flag === "missing" && !freshness.unpriced) return false;
    if (flag === "stale" && !freshness.stale) return false;
    if (flag === "current" && (freshness.unpriced || freshness.stale)) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const rows = visible.slice(start, start + PAGE_SIZE);
  const trends = await loadPriceTrends(rows.map(({ item }) => item));

  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (flag) params.set("flag", flag);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  };

  return (
    <WorkspaceInspector><div>
      <PageHeader
        title="Ingredients"
        subtitle="Shared ingredients, allergen tags, costs, and vendors."
        action={canEdit ? <LinkButton href="/items/cleanup">Review duplicates ({groups.length})</LinkButton> : undefined}
      />

      <Card className="mb-4 space-y-3 p-4">
        <Form action="/items" className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(11rem,1fr)_auto] lg:items-end">
          <label className="col-span-2 min-w-0 space-y-1 text-sm lg:col-span-1">
            <span className="font-medium">Find an ingredient</span>
            <Input key={q} name="q" defaultValue={q} placeholder="Name, vendor, item # or GCODE" aria-label="Search ingredients" className="min-h-11 max-sm:text-base" />
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span className="font-medium">Category</span>
            <Select key={category} name="category" defaultValue={category} className="min-h-11 max-sm:text-base">
              <option value="">All categories</option>
              {categories.map(value => <option key={value}>{value}</option>)}
            </Select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span className="font-medium">Review filter</span>
            <Select key={flag} name="flag" defaultValue={flag} className="min-h-11 max-sm:text-base">
              <option value="">All ingredients</option>
              <option value="missing">Missing price</option>
              <option value="stale">Stale price</option>
              <option value="current">Current price</option>
              <option value="integrity">Data issues</option>
              <option value="duplicates">Duplicates</option>
              <option value="unused">Unused</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary" className="col-span-2 min-h-11 lg:col-span-1">Search</Button>
        </Form>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p aria-live="polite" className="text-zinc-600">
            {rows.length ? `Showing ${start + 1}–${start + rows.length} of ${visible.length} ingredients` : items.length ? "No ingredients match your filters." : "No ingredients yet."}
          </p>
          {(category || flag || q) && <Link href="/items" className="text-blue-600 underline">Reset filters</Link>}
          {canEdit && <Link href="/invoices" className="text-blue-600 underline">Invoices</Link>}
        </div>
        {(missingCount > 0 || staleCount > 0) && (
          <p className="text-xs text-zinc-600">Catalog price coverage: {missingCount} missing · {staleCount} stale ({PRICE_STALE_DAYS}+ days)</p>
        )}
        {flag === "integrity" && <p className="text-sm text-amber-700">Showing in-use ingredients with missing costs, units, or vendors.</p>}
      </Card>

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

      {canEdit && rows.length > 0 && (
        <details className="mb-3 hidden text-xs text-zinc-500 md:block">
          <summary className="cursor-pointer">Keyboard editing help</summary>
          <p className="mt-2">Click a cell to edit. Use arrows to move between cells (left/right at text edges and Alt+arrows in vendor lists). Use Tab / Shift+Tab across cells and Enter / Shift+Enter down/up a column. Escape cancels. Prices are per cost unit and pack size is descriptive.</p>
        </details>
      )}
      {rows.length > 0 && <Card role="region" aria-label="Ingredient editing grid" tabIndex={0} className="catalog-grid hidden overflow-x-auto md:block print:block"><EditGrid>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Ingredient</th>
              <th className="px-4 py-2.5 font-medium">Cost unit</th>
              <th className="px-4 py-2.5 text-right font-medium">Unit Cost</th>
              <th className="px-4 py-2.5 font-medium">Price age</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Allergens</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Item #</th>
              <th className="px-4 py-2.5 font-medium">GCODE</th>
              <th className="px-4 py-2.5 font-medium">Pack size</th>
              <th className="px-4 py-2.5 font-medium">Recipes</th>
              {canEdit && <th className="px-4 py-2.5"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(({ item, freshness }) => (
              <tr key={item.id} className="align-top">
                <td className="px-4 py-2.5 font-medium text-zinc-800">
                  <InspectorLink kind="item" id={item.id}>{item.name}</InspectorLink>
                  <Link href={`/items/${item.id}`} className="mt-1 block text-xs text-blue-600 hover:underline">{canEdit ? "edit / usage" : "view usage"}</Link>
                  {duplicateIds.has(item.id) && <span className="mt-1 block text-xs text-amber-700">Possible duplicate</span>}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{canEdit ? <CatalogCell item={item} field="unit" vendors={vendors} /> : item.unit}</td>
                <td className={`px-4 py-2.5 text-right ${freshness.unpriced ? "text-red-600" : "text-zinc-800"}`}>
                  {canEdit ? <CatalogCell item={item} field="unitCost" vendors={vendors} trend={trends[item.id]} /> : freshness.unpriced ? "—" : <>{money(item.unitCost, 5)}<PriceTrend trend={trends[item.id]} /></>}
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
                <td className="px-4 py-2.5"><Badge>{item.category}</Badge></td>
                <td className="px-4 py-2.5"><AllergenBadges allergens={item.allergens} /></td>
                <td className="px-4 py-2.5 text-zinc-600">{canEdit ? <CatalogCell item={item} field="vendorId" vendors={vendors} /> : item.vendor?.name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{canEdit ? <CatalogCell item={item} field="sku" vendors={vendors} /> : item.sku ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-700">{canEdit ? <CatalogCell item={item} field="gcode" vendors={vendors} /> : item.gcode ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{canEdit ? <CatalogCell item={item} field="packSize" vendors={vendors} /> : item.packSize ?? "—"}</td>
                <td className="px-4 py-2.5"><Link href={`/items/${item.id}`} className="text-blue-600 hover:underline">{item._count.recipeItems}</Link></td>
                {canEdit && (
                  <td className="px-4 py-2.5 text-right">
                    <DeleteIngredient id={item.id} disabled={Object.values(item._count).some(count => count > 0)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></EditGrid>
      </Card>}
      {rows.length > 0 && (
        <ul aria-label="Ingredient results" className="space-y-2 md:hidden print:hidden">
          {rows.map(({ item, freshness }) => (
            <li key={item.id}>
              <Card className="min-w-0 space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <InspectorLink kind="item" id={item.id} className="min-w-0 break-words py-3 font-semibold text-blue-600 hover:underline">{item.name}</InspectorLink>
                  {freshness.unpriced ? <Badge color="red">No price</Badge> : (
                    <span className="tabular-nums text-sm font-medium">{money(item.unitCost, 5)} / {item.unit}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                  <span className="break-words">{item.category} · {item.vendor?.name ?? "No vendor"}</span>
                  {freshness.stale && <Badge color="amber">{freshness.label}</Badge>}
                  {duplicateIds.has(item.id) && <Badge color="amber">Possible duplicate</Badge>}
                </div>
                {(trends[item.id]?.prices.length ?? 0) >= 2 && <PriceTrend trend={trends[item.id]} />}
                <AllergenBadges allergens={item.allergens} />
                {canEdit && Object.values(item._count).every(count => count === 0) && <DeleteIngredient id={item.id} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav aria-label="Ingredient pages" className="mt-4 flex flex-wrap items-center justify-end gap-4 text-sm">
          <span className="tabular-nums text-zinc-600">Page {page} of {pageCount}</span>
          {page > 1 && <LinkButton href={pageHref(page - 1)}>Previous page</LinkButton>}
          {page < pageCount && <LinkButton href={pageHref(page + 1)}>Next page</LinkButton>}
        </nav>
      )}
    </div></WorkspaceInspector>
  );
}
