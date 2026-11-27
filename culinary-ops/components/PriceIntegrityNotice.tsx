import Link from "next/link";

// Compact, print-friendly price-check notice for prep / pull surfaces. Shows a
// one-line summary (color-coded counts) and tucks the ingredient names into a
// collapsed <details> so it never floods the sheet — collapsed is also what
// prints, keeping the printout clean. Renders nothing when everything is priced
// and current. `unpriced` = no cost on file (cost understated); `stale` =
// priced but not re-costed within the window.
export function PriceIntegrityNotice({
  unpriced,
  stale,
  unreviewed = [],
  reviewStale = [],
  className,
}: {
  unpriced: string[];
  stale: string[];
  unreviewed?: string[];
  reviewStale?: string[];
  className?: string;
}) {
  const review = unreviewed.length + reviewStale.length;
  if (unpriced.length === 0 && stale.length === 0 && review === 0) return null;
  const hasMissing = unpriced.length > 0;

  return (
    <div
      className={`rounded-lg border px-4 py-2.5 text-sm ${
        hasMissing ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"
      } ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">Price check</span>
        {hasMissing && (
          <span className="font-medium text-red-700">
            ⚠ {unpriced.length} missing a price{" "}
            <span className="font-normal text-red-600">· food cost understated</span>
          </span>
        )}
        {stale.length > 0 && (
          <span className="font-medium text-amber-800">⌛ {stale.length} not re-costed recently</span>
        )}
        {review > 0 && (
          <span className="font-medium text-amber-800">{review} allergen review{review === 1 ? "" : "s"} due</span>
        )}
        <Link
          href={hasMissing ? "/items?flag=missing" : "/items?flag=stale"}
          className="no-print ml-auto text-xs underline"
        >
          Review in Ingredients
        </Link>
      </div>
      <details className="no-print mt-1.5">
        <summary className="cursor-pointer text-xs opacity-80">Show ingredients</summary>
        <div className="mt-1 space-y-1 text-xs">
          {hasMissing && (
            <p>
              <span className="font-semibold text-red-700">No price:</span> {unpriced.join(", ")}.
            </p>
          )}
          {stale.length > 0 && (
            <p>
              <span className="font-semibold text-amber-800">Stale:</span> {stale.join(", ")}.
            </p>
          )}
          {unreviewed.length > 0 && (
            <p>
              <span className="font-semibold text-amber-800">Allergens never reviewed:</span> {shortList(unreviewed)}.
            </p>
          )}
          {reviewStale.length > 0 && (
            <p>
              <span className="font-semibold text-amber-800">Allergens not reviewed in 6 months:</span> {shortList(reviewStale)}.
            </p>
          )}
          {review > 0 && <Link href="/cleanup" className="underline">Review allergens</Link>}
        </div>
      </details>
    </div>
  );
}

// The review backlog starts with every ingredient unreviewed; keep warnings
// readable and send people to the full list instead.
function shortList(names: string[], max = 8) {
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
}
