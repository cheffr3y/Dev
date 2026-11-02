import type { Charge } from "@/lib/prep/prep-costing";
const money = (cents: number | null) =>
  cents == null
    ? "Needs cost review"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100);

export function ChargePreview({ preview, venues }: { preview: { requestLineId?: string; venueId: string; charge: Charge }[]; venues: { id: string; name: string }[] }) {
  return (
          <div className="mt-4 rounded-lg bg-stone p-4" aria-live="polite">
            <h3 className="mb-3 font-semibold">Charges for this item</h3>
            {preview.length === 0 && (
              <p className="text-sm">
                Nothing made or sent. These requests will close with their
                shortage notes and no charge.
              </p>
            )}
            {preview.map((p, i) => (
              <div
                key={p.requestLineId ?? i}
                className="border-t border-hairline py-3"
              >
                <p className="font-medium">
                  {venues.find((v) => v.id === p.venueId)?.name}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {(
                    [
                      ["Food before deduction", p.charge.gross],
                      ["Ingredient deduction", p.charge.excluded],
                      ["Production labor", p.charge.production],
                      ["Dishwasher labor", p.charge.dishwasher],
                      ["Net charge", p.charge.total],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-zinc-600">{label}</dt>
                      <dd className="font-medium">{money(value)}</dd>
                    </div>
                  ))}
                </dl>
                {p.charge.issues.length > 0 && (
                  <p className="mt-3 text-sm text-amber-800">
                    Needs cost review:{" "}
                    {p.charge.issues
                      .map((i) => i.split(": ").at(-1))
                      .join("; ")}
                    . You can save the result; this charge stays out of ready
                    totals until resolved.
                  </p>
                )}
              </div>
            ))}
          </div>
  );
}
