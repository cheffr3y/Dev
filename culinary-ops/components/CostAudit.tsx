import Link from "next/link";
import { PRICE_STALE_DAYS } from "@/lib/costing";
import { LocalTime } from "./LocalTime";

export function CostIntegrityBanner({ unpriced, stale, subRecipes = [] }: { unpriced: string[]; stale: string[]; subRecipes?: string[] }) {
  if (!unpriced.length && !stale.length) return null;
  return <aside role="status" className="no-print mb-5 rounded-lg border border-amber-700 bg-[#2C3E35] p-4 text-[#FCFBF9]">
    <h2 className="font-semibold">Cost Integrity &amp; Price Audit</h2>
    <p className="mt-1 text-sm">{unpriced.length > 0 && `⚠ ${unpriced.length} unpriced ingredients · cost understated. `}{stale.length > 0 && `⌛ ${stale.length} prices at least ${PRICE_STALE_DAYS} days old.`}</p>
    <div className="mt-2 space-y-1 text-xs">{unpriced.length > 0 && <p><strong>No price:</strong> {unpriced.join(", ")}</p>}{stale.length > 0 && <p><strong>Stale price:</strong> {stale.join(", ")}</p>}</div>
    {subRecipes.length > 0 && <p className="mt-2 text-xs"><strong>Affected sub-recipes:</strong> {subRecipes.join(", ")}</p>}
    <Link href={unpriced.length ? "/items?flag=missing" : "/items?flag=stale"} className="mt-3 inline-block text-sm underline">Update prices in the Catalog →</Link>
  </aside>;
}

export function CostAuditStamp({ unpriced, stale, date = new Date(), className = "" }: { unpriced: number; stale: number; date?: Date; className?: string }) {
  return <p className={`cost-audit-stamp mt-4 border-t border-[#E2DDD5] pt-2 font-mono text-[9px] text-zinc-600 ${className}`}>
    {unpriced > 0 ? `⚠ Cost Understated (${unpriced} Unpriced Items)` : stale > 0 ? `⌛ Cost Status: Review Required (${stale} Stale Prices)` : <>Cost Status: Verified <LocalTime date={date} mode="date" /></>}
    {unpriced > 0 && stale > 0 && ` · ${stale} stale prices`}
  </p>;
}
