import Link from "next/link";
import { PRICE_STALE_DAYS } from "@/lib/recipes/costing";

const ALLERGEN_REVIEW_MONTHS = 6;
import { LocalTime } from "./LocalTime";
import { Badge } from "./ui";

export function CostIntegrityBanner({ unpriced, stale, unreviewed = [], reviewStale = [], subRecipes = [], compact = false }: { unpriced: string[]; stale: string[]; unreviewed?: string[]; reviewStale?: string[]; subRecipes?: string[]; compact?: boolean }) {
  const pricing = unpriced.length > 0 || stale.length > 0;
  const review = unreviewed.length > 0 || reviewStale.length > 0;
  if (!pricing && !review) return null;
  const details = <>
    <div className="mt-2 space-y-1 text-xs">
      {unpriced.length > 0 && <p><strong>No price:</strong> {unpriced.join(", ")}</p>}
      {stale.length > 0 && <p><strong>Stale price:</strong> {stale.join(", ")}</p>}
      {unreviewed.length > 0 && <p><strong>Allergens never reviewed:</strong> {shortList(unreviewed)}</p>}
      {reviewStale.length > 0 && <p><strong>Allergens not reviewed in {ALLERGEN_REVIEW_MONTHS} months:</strong> {shortList(reviewStale)}</p>}
    </div>
    {subRecipes.length > 0 && <p className="mt-2 text-xs"><strong>Affected sub-recipes:</strong> {subRecipes.join(", ")}</p>}
    <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium">
      {pricing && <Link href={unpriced.length ? "/items?flag=missing" : "/items?flag=stale"} className="underline">Update ingredient prices →</Link>}
      {review && <Link href="/cleanup" className="underline">Review allergens →</Link>}
    </div>
  </>;
  return <aside role="status" className="no-print mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold">Cost Integrity &amp; Price Audit</h2>
      {unpriced.length > 0 && <Badge color="amber">{unpriced.length} missing price</Badge>}
      {stale.length > 0 && <Badge color="amber">{stale.length} stale</Badge>}
      {review && <Badge color="amber">{unreviewed.length + reviewStale.length} allergen review</Badge>}
    </div>
    <p className="mt-1 text-xs tabular-nums">{unpriced.length > 0 && `⚠ ${unpriced.length} unpriced ingredients · cost understated. `}{stale.length > 0 && `⌛ ${stale.length} prices at least ${PRICE_STALE_DAYS} days old. `}{review && `${unreviewed.length + reviewStale.length} ingredients need their allergens and diet checked against the label.`}</p>
    {compact ? <details className="mt-2 text-xs"><summary className="cursor-pointer">Review ingredient price details</summary>{details}</details> : details}
  </aside>;
}

export function CostAuditStamp({ unpriced, stale, date = new Date(), className = "" }: { unpriced: number; stale: number; date?: Date; className?: string }) {
  return <p className={`cost-audit-stamp mt-4 border-t border-hairline pt-2 text-[9px] tabular-nums ${unpriced > 0 || stale > 0 ? "text-amber-700" : "text-emerald-700"} ${className}`}>
    {unpriced > 0 ? `⚠ Cost Understated (${unpriced} Unpriced Items)` : stale > 0 ? `⌛ Cost Status: Review Required (${stale} Stale Prices)` : <>Cost Status: Verified <LocalTime date={date} mode="date" /></>}
    {unpriced > 0 && stale > 0 && ` · ${stale} stale prices`}
  </p>;
}

// The review backlog starts with every ingredient unreviewed; keep warnings
// readable and send people to the full list instead.
function shortList(names: string[], max = 8) {
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
}
