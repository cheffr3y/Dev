export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const points = values.filter(Number.isFinite);
  if (points.length < 2) return null;
  const low = Math.min(...points), high = Math.max(...points);
  const y = (value: number) => high === low ? 12 : 22 - (value - low) / (high - low) * 20;
  return <svg role="img" aria-label={label} viewBox="0 0 80 24" width="80" height="24" className="inline-block shrink-0 align-middle text-gold">
    <title>{label}</title>
    <polyline points={points.map((value, index) => `${2 + index / (points.length - 1) * 76},${y(value)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    <circle cx="78" cy={y(points.at(-1)!)} r="2" fill="currentColor" />
  </svg>;
}
