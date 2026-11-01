import { pct } from "@/lib/recipes/costing";

export function MenuCostBar({ value, target, stale }: { value: number | null; target: number; stale?: boolean }) {
  if (value == null) return <span className="text-xs font-semibold text-amber-700">Needs cost / price review</span>;
  const ceiling = Math.max(100, value, target);
  const over = value > target;
  return <div className="min-w-40 text-xs">
    <span className={`tabular-nums font-semibold ${over ? "text-red-700" : "text-emerald-700"}`}>{pct(value)} · {over ? "Over target" : "On target"}</span>
    <div className="relative my-1 h-2 rounded bg-zinc-200" role="img" aria-label={`Food cost ${pct(value)}, target ${pct(target)}`}>
      <div className={`h-full rounded ${over ? "bg-red-600" : "bg-emerald-600"}`} style={{ width: `${Math.max(0, value) / ceiling * 100}%` }} />
      <span className="absolute inset-y-[-2px] border-l-2 border-zinc-900" style={{ left: `${Math.max(0, target) / ceiling * 100}%` }} />
    </div>
    <span>Target {pct(target)}{stale ? " · Stale prices" : ""}</span>
  </div>;
}
