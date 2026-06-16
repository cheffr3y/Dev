"use client";

import { useMemo, useRef, useState } from "react";

type Recipe = { id: string; name: string; prodCode: string };

const LIMIT = 8;

// Typeahead recipe combobox for the prep-order add-line form. Renders a search
// field + dropdown and writes the chosen recipe id into a hidden input so the
// surrounding server-action <form> submits it like a normal field.
export function RecipePicker({ recipes, name = "recipeId" }: { recipes: Recipe[]; name?: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? recipes.filter((r) => r.name.toLowerCase().includes(q) || r.prodCode.toLowerCase().includes(q))
      : recipes;
    return matches.slice(0, LIMIT);
  }, [query, recipes]);

  const select = (r: Recipe) => {
    setSelectedId(r.id);
    setQuery(`${r.name} (${r.prodCode})`);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <div className="flex items-center gap-2 rounded-sm border border-zinc-300 bg-canvas px-3 focus-within:border-form-focus focus-within:ring-1 focus-within:ring-form-focus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-zinc-400">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId("");
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search recipes…"
          className="w-full bg-transparent py-2 text-sm text-ink placeholder:text-zinc-400 focus:outline-none"
          autoComplete="off"
        />
      </div>

      {open && results.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-hairline bg-canvas py-1 shadow-lg"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(r);
                }}
                className={
                  "flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition-colors " +
                  (i === active ? "bg-stone" : "hover:bg-cream")
                }
              >
                <span className="font-medium text-ink">{r.name}</span>
                <span className="font-mono text-[11px] text-zinc-400">({r.prodCode})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
