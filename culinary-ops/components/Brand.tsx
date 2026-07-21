// Shared "M" tile + wordmark used by the desktop sidebar and the mobile
// drawer. Callers own the surrounding spacing.
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-stone font-display text-lg text-charcoal">
        M
      </div>
      <div>
        <p className="font-display text-base leading-none text-white">Mise</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">Culinary Ops</p>
      </div>
    </div>
  );
}
