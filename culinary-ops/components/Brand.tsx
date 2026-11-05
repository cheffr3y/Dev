// Shared wordmark; compact navigation keeps a readable initial.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-label="Mise culinary operations">
      <p className="font-display text-[34px] leading-none tracking-tight text-white">{compact ? "m" : "mise"}</p>
      {!compact && <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/60">Culinary operations</p>}
    </div>
  );
}
