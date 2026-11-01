import { baselineChanges, baselineFieldLabel, baselineSchema, type BaselineSnapshot } from "@/lib/banquets/banquet-baseline";

export type BanquetRevisionData = { snapshot: BaselineSnapshot; createdAt: string; updatedAt: string; current: BaselineSnapshot };
export function BanquetRevision({ data }: { data?: BanquetRevisionData | null }) {
  if (!data) return null;
  const changes = baselineChanges(data.snapshot, data.current);
  if (!changes.length) return <p className="my-3 text-xs">BEO baseline locked {data.createdAt.slice(0, 10)} · No changes from baseline.</p>;
  const delta = data.current.guestCount - baselineSchema.parse(data.snapshot).guestCount;
  const date = new Date(data.updatedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return <section className="beo-revision my-4 border-2 border-amber-500 bg-amber-50 p-3 text-amber-950" aria-label="BEO changes">
    <strong>REVISED: {date}{delta ? ` — Pax ${delta > 0 ? "+" : ""}${delta}` : ""}</strong>
    <p className="mt-1 text-xs">{changes.length} changed fields since the locked BEO baseline. Review quantities, timing, and instructions before service.</p>
    <table className="setup-table mt-2 w-full text-left text-xs"><thead><tr><th>Changed field</th><th>Baseline</th><th>Current</th></tr></thead>
      <tbody>{changes.map(change => <tr key={change.field}><th className="break-words">{baselineFieldLabel(change.field, data.snapshot, data.current)}</th><td className="whitespace-pre-wrap break-words">{change.before || "—"}</td><td className="whitespace-pre-wrap break-words font-semibold">{change.after || "—"}</td></tr>)}</tbody></table>
  </section>;
}
