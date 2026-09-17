// Shared "M" tile + wordmark used by the desktop sidebar and the mobile
// drawer. Callers own the surrounding spacing.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone font-display text-lg text-charcoal" aria-hidden={compact || undefined}>
        M
      </div>
      <div className={compact ? "sr-only" : "whitespace-nowrap"}>
        <p className="font-display text-base leading-none text-white">Mise</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">Culinary Ops</p>
      </div>
    </div>
  );
}
