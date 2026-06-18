"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Recipe = { id: string; name: string; category: string; station: string | null };
type Item = { id: string; name: string; unit: string };

type Result =
  | { kind: "recipe"; id: string; name: string; meta: string; href: string }
  | { kind: "item"; id: string; name: string; meta: string; href: string };

const LIMIT = 6;

export function CommandSearch({ recipes, items }: { recipes: Recipe[]; items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);
  const closePalette = useCallback(() => setOpen(false), []);

  // Cmd/Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      } else if (e.key === "Escape") {
        closePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette, closePalette]);

  // Focus the field once the panel is mounted (side effect only — no setState).
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const { recipeResults, itemResults, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchRecipe = (r: Recipe) =>
      !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) ||
      (r.station ?? "").toLowerCase().includes(q);
    const matchItem = (i: Item) => !q || i.name.toLowerCase().includes(q);

    const rr: Result[] = recipes
      .filter(matchRecipe)
      .slice(0, LIMIT)
      .map((r) => ({
        kind: "recipe",
        id: r.id,
        name: r.name,
        meta: r.station ? `${r.category} · ${r.station}` : r.category,
        href: `/recipes/${r.id}`,
      }));
    const ir: Result[] = items
      .filter(matchItem)
      .slice(0, LIMIT)
      .map((i) => ({ kind: "item", id: i.id, name: i.name, meta: `per ${i.unit}`, href: `/items` }));

    return { recipeResults: rr, itemResults: ir, flat: [...rr, ...ir] };
  }, [query, recipes, items]);

  const go = useCallback(
    (r: Result) => {
      setOpen(false);
      router.push(r.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active]);
    }
  };

  return (
    <>
      {/* Header trigger */}
      <button
        type="button"
        onClick={openPalette}
        className="hidden items-center gap-2 rounded-full border border-hairline bg-canvas px-3.5 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600 sm:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <span>Search recipes &amp; ingredients…</span>
        <kbd className="ml-2 rounded border border-hairline bg-cream px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400">
          ⌘K
        </kbd>
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          onMouseDown={() => setOpen(false)}
        >
          {/* Frosted-glass scrim */}
          <div className="absolute inset-0 bg-charcoal/25 backdrop-blur-md" />

          <div
            className="relative w-full max-w-xl overflow-hidden rounded-xl border border-hairline bg-canvas/95 shadow-2xl backdrop-blur-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-zinc-400">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search recipes & ingredients…"
                className="w-full bg-transparent py-4 text-base text-ink placeholder:text-zinc-400 focus:outline-none"
              />
              <kbd className="rounded border border-hairline bg-cream px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400">
                ESC
              </kbd>
            </div>

            <div className="max-h-[55vh] overflow-y-auto py-2">
              {flat.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-zinc-400">
                  No matches for “{query}”.
                </p>
              )}

              {recipeResults.length > 0 && (
                <section className="mb-1">
                  <h3 className="px-4 py-1.5 font-display text-sm italic text-zinc-500">Recipes</h3>
                  {recipeResults.map((r, i) => (
                    <Row key={r.id} result={r} active={i === active} onSelect={go} />
                  ))}
                </section>
              )}

              {itemResults.length > 0 && (
                <section>
                  <h3 className="px-4 py-1.5 font-display text-sm italic text-zinc-500">Ingredients</h3>
                  {itemResults.map((r, j) => (
                    <Row
                      key={r.id}
                      result={r}
                      active={recipeResults.length + j === active}
                      onSelect={go}
                    />
                  ))}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  result,
  active,
  onSelect,
}: {
  result: Result;
  active: boolean;
  onSelect: (r: Result) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(result);
      }}
      className={
        "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors " +
        (active ? "bg-stone" : "hover:bg-cream")
      }
    >
      <span className="flex items-center gap-3">
        <span
          className={
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] uppercase tracking-wide " +
            (result.kind === "recipe" ? "bg-pale-gold text-gold" : "bg-pale-sage text-sage")
          }
        >
          {result.kind === "recipe" ? "R" : "I"}
        </span>
        <span className="text-sm font-medium text-ink">{result.name}</span>
      </span>
      <span className="text-xs text-zinc-400">{result.meta}</span>
    </button>
  );
}
