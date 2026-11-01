import Link from "next/link";
import { PRICE_STALE_DAYS } from "@/lib/recipes/costing";
import { LocalTime } from "./LocalTime";
import { Badge } from "./ui";

export function CostIntegrityBanner({ unpriced, stale, subRecipes = [] }: { unpriced: string[]; stale: string[]; subRecipes?: string[] }) {
  if (!unpriced.length && !stale.length) return null;
  return <aside role="status" className="no-print mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold">Cost Integrity &amp; Price Audit</h2>
      {unpriced.length > 0 && <Badge color="amber">{unpriced.length} missing price</Badge>}
      {stale.length > 0 && <Badge color="amber">{stale.length} stale</Badge>}
    </div>
    <p className="mt-1 text-xs tabular-nums">{unpriced.length > 0 && `⚠ ${unpriced.length} unpriced ingredients · cost understated. `}{stale.length > 0 && `⌛ ${stale.length} prices at least ${PRICE_STALE_DAYS} days old.`}</p>
    <div className="mt-2 space-y-1 text-xs">{unpriced.length > 0 && <p><strong>No price:</strong> {unpriced.join(", ")}</p>}{stale.length > 0 && <p><strong>Stale price:</strong> {stale.join(", ")}</p>}</div>
    {subRecipes.length > 0 && <p className="mt-2 text-xs"><strong>Affected sub-recipes:</strong> {subRecipes.join(", ")}</p>}
    <Link href={unpriced.length ? "/items?flag=missing" : "/items?flag=stale"} className="mt-2 inline-block text-xs font-medium underline">Update prices in Items →</Link>
  </aside>;
}

export function CostAuditStamp({ unpriced, stale, date = new Date(), className = "" }: { unpriced: number; stale: number; date?: Date; className?: string }) {
  return <p className={`cost-audit-stamp mt-4 border-t border-hairline pt-2 text-[9px] tabular-nums ${unpriced > 0 || stale > 0 ? "text-amber-700" : "text-emerald-700"} ${className}`}>
    {unpriced > 0 ? `⚠ Cost Understated (${unpriced} Unpriced Items)` : stale > 0 ? `⌛ Cost Status: Review Required (${stale} Stale Prices)` : <>Cost Status: Verified <LocalTime date={date} mode="date" /></>}
    {unpriced > 0 && stale > 0 && ` · ${stale} stale prices`}
  </p>;
}
