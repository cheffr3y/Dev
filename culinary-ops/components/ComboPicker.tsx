"use client";

import { useMemo, useRef, useState } from "react";

// One selectable row. `label` is the primary text; `meta` is muted secondary
// text shown to the right (e.g. "yields 12 each", "$2.50 / lb"); `keywords`
// adds extra searchable text that isn't displayed (e.g. a prod code).
export type ComboOption = {
  id: string;
  label: string;
  meta?: string;
  keywords?: string;
};

const LIMIT = 8;

// Generic typeahead combobox. Renders a search field + dropdown and writes the
// chosen option's id into a hidden input so a surrounding server-action <form>
// submits it like a normal field. `onSelect` lets a parent react to the choice
// (e.g. lock a unit to the recipe's family, or enable the submit button).
//
// This is the shared engine behind every "search recipes / ingredients" picker
// in the app — RecipePicker wraps it for recipes; item pickers use it directly.
export function ComboPicker({
  options,
  name,
  placeholder = "Search…",
  disabled = false,
  defaultId = "",
  onSelect,
}: {
  options: ComboOption[];
  name: string;
  placeholder?: string;
  disabled?: boolean;
  defaultId?: string;
  onSelect?: (option: ComboOption | null) => void;
}) {
  const initial = options.find((o) => o.id === defaultId) ?? null;
  const [query, setQuery] = useState(initial?.label ?? "");
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.keywords?.toLowerCase().includes(q) ?? false),
        )
      : options;
    return matches.slice(0, LIMIT);
  }, [query, options]);

  const select = (o: ComboOption) => {
    setSelectedId(o.id);
    setQuery(o.label);
    setOpen(false);
    onSelect?.(o);
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
      <div
        className={
          "flex items-center gap-2 rounded-sm border border-zinc-300 bg-canvas px-3 focus-within:border-form-focus focus-within:ring-1 focus-within:ring-form-focus " +
          (disabled ? "opacity-50" : "")
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-zinc-400">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedId) onSelect?.(null);
            setSelectedId("");
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            e.currentTarget.select();
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 text-sm text-ink placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed"
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
          {results.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(o);
                }}
                className={
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors " +
                  (i === active ? "bg-stone" : "hover:bg-cream")
                }
              >
                <span className="font-medium text-ink">{o.label}</span>
                {o.meta && <span className="shrink-0 text-[11px] text-zinc-400">{o.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
