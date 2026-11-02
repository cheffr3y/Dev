import { priceJump, type PriceTrend as Trend } from "@/lib/invoices/price-trends";
import { Sparkline } from "./Sparkline";
import { Badge } from "./ui";
export function PriceTrend({ trend }: { trend?: Trend | null }) {
  if (!trend || trend.prices.length < 2) return null;
  const label = `Last ${trend.prices.length} reviewed paid prices from ${trend.supplier}, USD per ${trend.unit}: ${trend.prices.map(price => price.toFixed(5)).join(", ")}`;
  return <span className="no-print mt-1 flex flex-wrap items-center justify-end gap-1 text-[10px]" title={label}>
    <Sparkline values={trend.prices} label={label} />
    {trend.change != null && (priceJump(trend.change, trend.threshold)
      ? <Badge color="amber">Paid price +{trend.change.toFixed(1)}%</Badge>
      : <span className="tabular-nums text-zinc-500">Paid {trend.change > 0 ? "+" : ""}{trend.change.toFixed(1)}%</span>)}
  </span>;
}
