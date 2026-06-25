"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, cn } from "@/components/ui";
import { money, pct } from "@/lib/costing";

// Costing (including nested sub-recipes) is done on the server; this island
// only filters/renders, so it ships numbers already reduced per recipe.
export type RecipeRow = {
  id: string;
  name: string;
  station: string | null;
  category: string;
  cost: number;
  perServing: number;
  menuPrice: number | null;
  fcp: number | null;
};

export function RecipesTable({ rows }: { rows: RecipeRow[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

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
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.station ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, category]);

  return (
    <div>
      {/* Filter controls */}
      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-6 py-4 font-medium">Recipe</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 text-right font-medium">Cost</th>
                <th className="px-6 py-4 text-right font-medium">$ / serving</th>
                <th className="px-6 py-4 text-right font-medium">Menu</th>
                <th className="px-6 py-4 text-right font-medium">Food %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    {rows.length === 0 ? "No recipes yet." : "No recipes match your filters."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <Link href={`/recipes/${r.id}`} className="font-medium text-zinc-800 hover:underline">
                      {r.name}
                    </Link>
                    {r.station && <span className="ml-2 text-xs text-zinc-400">{r.station}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <Badge>{r.category}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right text-zinc-600">{money(r.cost)}</td>
                  <td className="px-6 py-4 text-right text-zinc-600">{money(r.perServing)}</td>
                  <td className="px-6 py-4 text-right text-zinc-600">{r.menuPrice ? money(r.menuPrice) : "—"}</td>
                  <td className="px-6 py-4 text-right">
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
        </div>
      </Card>

      <p className="mt-2 text-xs text-zinc-400">
        {filtered.length === rows.length
          ? `${rows.length} recipe${rows.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${rows.length} recipes`}
      </p>
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
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 transition-colors",
        active
          ? "bg-zinc-900 text-white"
          : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
      )}
    >
      {children}
    </button>
  );
}
