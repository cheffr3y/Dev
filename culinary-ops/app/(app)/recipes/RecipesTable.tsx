"use client";

import { useMemo } from "react";
import { InspectorLink } from "@/components/InspectorLink";
import { useWorkspaceUrl } from "@/components/useWorkspaceUrl";
import { Badge, Button, Card, Select, TableScroll, cn } from "@/components/ui";
import { CostIntegrityBanner } from "@/components/CostAudit";
import { money, pct } from "@/lib/recipes/costing";

// Costing (including nested sub-recipes) is done on the server; this island
// only filters/renders, so it ships numbers already reduced per recipe.
export type RecipeRow = {
  id: string;
  name: string;
  station: string | null;
  category: string;
  cost: number;
  perUnit: number;
  costUnit: string;
  menuPrice: number | null;
  fcp: number | null;
  unpricedNames?: string[];
  staleNames?: string[];
  unpriced: number; // ingredients in the tree with no price on file
  stale: number; // priced ingredients not re-costed within the window
};

export function RecipesTable({ rows }: { rows: RecipeRow[] }) {
  const { params, update } = useWorkspaceUrl();
  const query = params.get("q") ?? "";
  const category = params.get("category");
  const sort = params.get("sort") ?? "category";
  const requestedPrice = params.get("price") ?? "all";
  const price = ["missing", "stale", "current"].includes(requestedPrice) ? requestedPrice : "all";
  const setQuery = (value: string) => update({ q: value || null });
  const setCategory = (value: string | null) => update({ category: value });

  // Categories are free-form, so derive the chips from the data that's
  // actually present rather than a fixed list.
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category && r.category !== category) return false;
      if (price === "missing" && r.unpriced === 0) return false;
      if (price === "stale" && r.stale === 0) return false;
      if (price === "current" && (r.unpriced > 0 || r.stale > 0)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.station ?? "").toLowerCase().includes(q)
      );
    }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "cost" ? b.cost - a.cost || a.name.localeCompare(b.name) : a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [rows, query, category, sort, price]);

  return (
    <div className="recipe-catalog">
      <CostIntegrityBanner compact unpriced={[...new Set(rows.flatMap(row => row.unpricedNames ?? []))].sort()} stale={[...new Set(rows.flatMap(row => row.staleNames ?? []))].sort()} />
      {/* Filter controls */}
      <div className="mb-4 space-y-3">
        <div className="recipe-catalog-toolbar flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, category, station…"
            aria-label="Filter recipes"
            className="w-full rounded-sm border border-zinc-300 bg-canvas py-2 pl-9 pr-9 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <label className="grid gap-1 text-xs text-zinc-500">Price status
          <Select aria-label="Filter by price status" value={price} onChange={event => update({ price: event.target.value === "all" ? null : event.target.value })}>
            <option value="all">All prices</option><option value="missing">Missing prices</option><option value="stale">Stale prices</option><option value="current">Current prices</option>
          </Select>
        </label>
      <label className="grid gap-1 text-xs text-zinc-500">Sort recipes
        <select aria-label="Sort recipes" className="rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink" value={sort} onChange={event => update({ sort: event.target.value === "category" ? null : event.target.value })}>
          <option value="category">Category</option><option value="name">Name</option><option value="cost">Highest batch cost</option>
        </select>
      </label>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Chip active={!category} onClick={() => setCategory(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-zinc-500">{filtered.length} of {rows.length} recipes</p>
        {(query || category || price !== "all") && <Button variant="secondary" onClick={() => update({ q: null, category: null, price: null })}>Reset filters</Button>}
      </div>
      <Card className="hidden overflow-hidden md:block">
        <TableScroll aria-label="Recipe costs">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-3 py-1 font-medium">Recipe</th>
                <th className="px-3 py-1 font-medium">Category</th>
                <th className="px-3 py-1 font-medium">Price status</th>
                <th className="px-3 py-1 text-right tabular-nums font-medium">Cost</th>
                <th className="px-3 py-1 text-right tabular-nums font-medium">Cost / yield unit</th>
                <th className="px-3 py-1 text-right tabular-nums font-medium">Menu</th>
                <th className="px-3 py-1 text-right tabular-nums font-medium">Food %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                    {rows.length === 0 ? "No recipes yet." : "No recipes match your filters."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-1">
                    <InspectorLink kind="recipe" id={r.id} className="font-medium text-zinc-800 hover:underline">
                      {r.name}
                    </InspectorLink>
                    {r.station && <span className="ml-2 text-xs text-zinc-400">{r.station}</span>}
                  </td>
                  <td className="px-3 py-1">
                    <Badge>{r.category}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1"><RecipePriceStatus row={r} /></td>
                  <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums text-zinc-600">{money(r.cost)}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-zinc-600">{money(r.perUnit, 5)} / {r.costUnit}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-zinc-600">{r.menuPrice ? money(r.menuPrice, 5) : "—"}</td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {r.fcp == null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <Badge color={r.fcp <= 30 ? "green" : r.fcp <= 38 ? "amber" : "red"}>{pct(r.fcp)}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <ul className="divide-y divide-hairline md:hidden" aria-label="Recipe summaries">
        {filtered.map(r => <li key={r.id} className="py-4">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div><InspectorLink kind="recipe" id={r.id} className="block py-1 text-base font-medium text-ink underline decoration-hairline underline-offset-4">{r.name}</InspectorLink><p className="text-sm text-zinc-500">{r.category}{r.station ? ` · ${r.station}` : ""}</p></div>
            <RecipePriceStatus row={r} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-zinc-500">Batch cost</dt><dd className="tabular-nums">{money(r.cost)}</dd></div>
            <div><dt className="text-zinc-500">Cost / {r.costUnit}</dt><dd className="tabular-nums">{money(r.perUnit, 5)}</dd></div>
            <div><dt className="text-zinc-500">Menu price</dt><dd className="tabular-nums">{r.menuPrice ? money(r.menuPrice, 5) : "—"}</dd></div>
            <div><dt className="text-zinc-500">Food cost</dt><dd className="tabular-nums">{r.fcp == null ? "—" : pct(r.fcp)}</dd></div>
          </dl>
        </li>)}
        {!filtered.length && <li className="py-8 text-center text-sm text-zinc-500">{rows.length ? "No recipes match your filters." : "No recipes yet."}</li>}
      </ul>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 transition-colors",
        active
          ? "border border-transparent bg-primary text-white"
          : "border border-hairline bg-canvas text-zinc-600 hover:border-zinc-400",
      )}
    >
      {children}
    </button>
  );
}

function RecipePriceStatus({ row }: { row: RecipeRow }) {
  return <span className="inline-flex flex-wrap gap-1">
    {row.unpriced > 0 && <Badge color="amber">Missing {row.unpriced}</Badge>}
    {row.stale > 0 && <Badge color="amber">Stale {row.stale}</Badge>}
    {row.unpriced === 0 && row.stale === 0 && <Badge color="green">Current prices</Badge>}
  </span>;
}
