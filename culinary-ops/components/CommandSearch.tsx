"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { commandActions, type CommandAction } from "@/lib/command-actions";

type Recipe = { id: string; name: string; category: string; station: string | null };
type Item = { id: string; name: string; unit: string };
type Result = CommandAction | { kind: "recipe" | "item"; id: string; name: string; meta: string; href: string };
const LIMIT = 6;

export function CommandSearch({ recipes, items, role }: { recipes: Recipe[]; items: Item[]; role: "ADMIN" | "MANAGER" | "STAFF" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [actions, setActions] = useState<CommandAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef(false);

  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setError("");
    // Resolve dates on every open, even when the shell has stayed open overnight.
    setActions(commandActions(role));
    setOpen(true);
  }, [role]);
  const closePalette = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) closePalette(); else openPalette();
      } else if (event.key === "Escape" && open) closePalette();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette, closePalette]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; };
  }, [open]);

  const { groups, flat } = useMemo(() => {
    const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'");
    const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const matches = (text: string) => tokens.every(token => normalize(text).includes(token));
    const groups: Array<{ name: string; results: Result[] }> = [
      { name: "Actions", results: actions.filter(action => matches(`${action.name} ${action.meta} ${action.keywords}`)) },
      { name: "Recipes", results: recipes.filter(recipe => matches(`${recipe.name} ${recipe.category} ${recipe.station ?? ""}`)).slice(0, LIMIT).map(recipe => ({
        kind: "recipe", id: recipe.id, name: recipe.name,
        meta: recipe.station ? `${recipe.category} · ${recipe.station}` : recipe.category, href: `/recipes/${recipe.id}`,
      })) },
      { name: "Ingredients", results: items.filter(item => matches(item.name)).slice(0, LIMIT).map(item => ({
        kind: "item", id: item.id, name: item.name, meta: `per ${item.unit}`, href: `/items/${item.id}`,
      })) },
    ];
    return { groups, flat: groups.flatMap(group => group.results) };
  }, [query, recipes, items, actions]);

  const selected = Math.min(active, Math.max(0, flat.length - 1));
  useEffect(() => {
    if (open) resultsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, selected, query]);

  const go = async (result: Result) => {
    if (downloadRef.current) return;
    if (result.kind !== "action" || result.behavior !== "download") {
      closePalette();
      if (result.kind === "action" && result.id === "new-recipe" && window.location.pathname === "/recipes") {
        const form = document.querySelector<HTMLDetailsElement>("#new-recipe");
        if (form) {
          form.open = true;
          form.scrollIntoView({ block: "start" });
          form.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
          return;
        }
      }
      router.push(result.href);
      return;
    }
    downloadRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(result.href);
      if (!response.ok) throw new Error(response.status === 403 ? "You no longer have access to accounting exports." : "The accounting export could not be created. Try again.");
      if (!response.headers.get("content-type")?.includes("spreadsheetml")) throw new Error("The export was unavailable. Sign in again and retry.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "prep-accounting.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      closePalette();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The accounting export could not be created.");
    } finally {
      downloadRef.current = false;
      setBusy(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActive(flat.length ? (selected + direction + flat.length) % flat.length : 0);
    } else if (event.key === "Enter" && flat[selected]) {
      event.preventDefault();
      void go(flat[selected]);
    }
  };

  return <>
    <button ref={triggerRef} type="button" onClick={openPalette} aria-label="Search actions, recipes & ingredients" aria-haspopup="dialog" aria-expanded={open}
      className="flex items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-300 hover:text-ink">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
      <span className="hidden sm:inline">Search or run an action…</span>
      <kbd className="ml-2 hidden rounded border border-hairline px-1.5 py-0.5 text-[10px] sm:inline-block">⌘K</kbd>
    </button>
    {!open ? null : <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={closePalette}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Action center" aria-busy={busy}
        className="relative w-full max-w-2xl overflow-hidden rounded-lg border border-hairline bg-canvas shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)');
          if (!focusable?.length) return;
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <input ref={inputRef} role="combobox" aria-label="Search actions, recipes & ingredients" aria-autocomplete="list" aria-expanded="true" aria-controls="command-results" aria-activedescendant={flat[selected] ? `command-${flat[selected].kind}-${flat[selected].id}` : undefined}
            value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown}
            placeholder="Search actions, recipes & ingredients…" className="min-w-0 w-full bg-transparent py-4 text-base text-ink placeholder:text-zinc-400 focus:outline-none" />
          <button type="button" aria-label="Close action center" onClick={closePalette} className="rounded border border-hairline px-1.5 py-0.5 text-xs text-zinc-500">Esc</button>
        </div>
        <div ref={resultsRef} id="command-results" role="listbox" aria-label="Search results" className="max-h-[55vh] overflow-y-auto py-2">
          {flat.length === 0 && <p className="px-4 py-10 text-center text-sm text-zinc-500">No matches for “{query}”.</p>}
          {groups.map(group => {
            const offset = flat.findIndex(result => result === group.results[0]);
            return group.results.length > 0 && <div key={group.name} role="group" aria-label={group.name}>
              <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{group.name}</p>
              {group.results.map((result, index) => <button key={`${result.kind}-${result.id}`} id={`command-${result.kind}-${result.id}`} type="button" role="option" aria-selected={offset + index === selected} disabled={busy}
                onFocus={() => setActive(offset + index)} onClick={() => { void go(result); }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left disabled:opacity-50 ${offset + index === selected ? "bg-stone" : "hover:bg-stone"}`}>
                <span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="text-xs text-zinc-500">{result.kind === "action" ? "↗" : result.kind === "recipe" ? "R" : "I"}</span><span className="text-sm font-medium text-ink">{result.name}</span></span>
                <span className="shrink-0 text-xs text-zinc-500">{result.meta}</span>
              </button>)}
            </div>;
          })}
        </div>
        {busy && <p role="status" className="border-t border-hairline px-4 py-2 text-sm text-zinc-500">Preparing accounting export…</p>}
        {error && <p role="alert" className="border-t border-hairline px-4 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-4 border-t border-hairline px-4 py-2.5 text-xs text-zinc-500"><span><kbd>↑ ↓</kbd> Navigate</span><span><kbd>Enter</kbd> Execute</span><span><kbd>Esc</kbd> Close</span></div>
      </div>
    </div>}
  </>;
}
