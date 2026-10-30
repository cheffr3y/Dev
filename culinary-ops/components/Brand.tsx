// Shared "M" tile + wordmark used by the desktop sidebar and the mobile
// drawer. Callers own the surrounding spacing.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 font-sans text-base font-semibold text-white" aria-hidden={compact || undefined}>
        M
      </div>
      <div className={compact ? "sr-only" : "whitespace-nowrap"}>
        <p className="font-sans text-base font-semibold leading-none tracking-tight text-white">Mise</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">Culinary Ops</p>
      </div>
    </div>
  );
}
