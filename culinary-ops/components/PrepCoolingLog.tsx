import { num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";

type CoolingLine = {
  id: string;
  lot: string | null;
  recipe: { name: string };
  requestedQty: number;
  requestedUnit: string;
  destinationVenue: { name: string };
};

// Cooling follows physical lots; destination splits stay together. Blank pan
// rows allow separate readings when portions of a lot cool independently.
export function PrepCoolingLog({ lines, madeOn }: { lines: CoolingLine[]; madeOn: string }) {
  const lots = new Map<string, CoolingLine[]>();
  for (const line of lines) {
    if (!line.lot) continue;
    lots.set(line.lot, [...(lots.get(line.lot) ?? []), line]);
  }
  if (!lots.size) return null;

  return (
    <section className="mt-10 break-before-page text-zinc-900">
      <div className="break-inside-avoid break-after-avoid">
        <h2 className="font-display text-3xl font-medium">Cooling Log · Cooked TCS Foods</h2>
        <p className="mt-1 text-sm">Production {madeOn} · TCS = time/temperature control for safety.</p>
        <div className="mt-3 border-2 border-zinc-900 p-3 text-sm">
          <p><strong>Stage 1:</strong> Cool from 135°F to 70°F or below within 2 hours.</p>
          <p><strong>Stage 2:</strong> Reach 41°F or below within 6 hours total from 135°F (2 + 4 hours).</p>
          <p className="mt-1 text-xs">If stage 1 finishes early, the final deadline remains start + 6 hours. Record dates and AM/PM, including overnight cooling.</p>
        </div>
        <p className="mt-2 text-xs">Use for cooked foods requiring temperature control. Mark N/A with a reason when this process does not apply. Use additional copies for more pans or separate cooling runs.</p>
      </div>

      <div className="mt-5 space-y-6">
        {[...lots.entries()].map(([lot, batch]) => (
          <article key={lot} className="break-inside-avoid border border-zinc-400 p-3 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold">{batch[0].recipe.name}</h3>
              <p className="font-mono font-semibold">Lot {lot} · {madeOn}</p>
            </div>
            <p className="mt-1">Planned prep: {batch.map((line) => `${num(line.requestedQty)} ${unitLabel(line.requestedUnit)} → ${line.destinationVenue.name}`).join(" · ")}</p>
            <p className="mt-4">Cooling method / equipment: __________________________________________________</p>
            <table className="mt-3 w-full table-fixed border-collapse text-left text-[11px]">
              <thead>
                <tr className="bg-zinc-100">
                  <th className="w-[22%] border border-zinc-400 p-2">Pan / quantity<br />Person cooling</th>
                  <th className="w-[26%] border border-zinc-400 p-2">Start at 135°F<br />Date / time / temp / initials</th>
                  <th className="w-[26%] border border-zinc-400 p-2">Stage 1 · ≤70°F<br />Due: start + 2 hours</th>
                  <th className="w-[26%] border border-zinc-400 p-2">Stage 2 · ≤41°F<br />Due: start + 6 hours</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((row) => (
                  <tr key={row} className="align-top">
                    <td className="border border-zinc-400 p-2 leading-7">Pan: __________<br />Qty: __________<br />Name: _________</td>
                    <td className="border border-zinc-400 p-2 leading-7">Date: ___________<br />Time: ___________<br />°F / initials: _______</td>
                    {[1, 2].map((stage) => (
                      <td key={stage} className="border border-zinc-400 p-2 leading-7">Due date/time: _____<br />Actual date/time: ____<br />°F / initials: _______</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3">Notes / corrective action / N/A reason: ______________________________________________</p>
            <div className="mt-6 border-b border-zinc-400" />
          </article>
        ))}
      </div>

      <div className="mt-5 break-inside-avoid text-xs">
        <p>If a limit is missed, notify the chef immediately and document the corrective action and disposition under your food safety procedure.</p>
        <div className="mt-9 flex gap-6 text-sm">
          <p className="flex-1 border-t border-zinc-600 pt-2">Chef cooling review signature</p>
          <p className="w-36 border-t border-zinc-600 pt-2">Date / time</p>
        </div>
        <p className="mt-4 text-[10px] text-zinc-600">
          Reference: FDA Food Code 2022 §3-501.14(A), §3-501.15 · FDA cooling guidance: {" "}
          <a href="https://www.fda.gov/media/181882/download?attachment=" className="underline">fda.gov/media/181882/download</a>
        </p>
      </div>
    </section>
  );
}
