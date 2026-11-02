import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { getSmokeRun } from "@/lib/smoking/data";
import {
  CHECKPOINTS,
  fmtMeasure,
  fmtSmokeTime,
  lotSchema,
  runSchema,
  smokeTemperature,
  smokeYield,
} from "@/lib/smoking/smoking";
import { PrintController } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";
import { ProductionJobQr } from "@/components/ProductionJobQr";
import "./smoke-print.css";
export default async function SmokePrint({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lot?: string }>;
}) {
  const user = await requirePrepUser(),
    { id } = await params,
    { lot: lotId } = await searchParams,
    run = await getSmokeRun(user, id);
  if (!run) notFound();
  const data = runSchema.parse(run.data),
    lots = run.lots.filter((l) => !lotId || l.id === lotId);
  if (lotId && !lots.length) notFound();
  return (
    <PrintController className="paper-preview smoke-print">
      <div className="no-print">
        <Link href={`/smoking/${id}`}>← Back to smoker run</Link>
      </div>
      {lots.map((lot) => {
        const d = lotSchema.parse(lot.data),
          y = smokeYield(d.actual.raw, d.actual.finished);
        return (
          <section className="smoke-print-lot" key={lot.id}>
            <PrintSpecHeader
              venue={run.venue.name}
              title={`Smoke sheet · ${d.plan.label}`}
              targetDate={run.businessDate}
              printedAt={new Date()}
            />
            <div className="smoke-print-heading">
              <div>
                <h1>
                  {d.plan.product} ·{" "}
                  {d.plan.mode === "HOT" ? "Hot smoking" : "Cold smoking"}
                </h1>
                <p>
                  {data.name} · {data.smoker} · Cook: {d.plan.cookName}
                </p>
                <p>
                  Lot {lot.id} · {d.status}
                </p>
                <p>
                  Recipe:{" "}
                  {d.recipe
                    ? `${d.recipe.name} v${d.recipe.version}`
                    : "____________________"}
                </p>
                <p>
                  Probes:{" "}
                  {d.plan.probes
                    .map((p) => `${p.name} (${p.kind})`)
                    .join(", ") || "____________________"}
                </p>
              </div>
              <ProductionJobQr
                href={`/smoking/${id}?lot=${lot.id}#lot-${lot.id}`}
                label="Scan lot / enter readings"
              />
            </div>
            <div className="smoke-print-settings">
              <p>
                Planned target:{" "}
                {smokeTemperature(
                  d.plan.targetTemperature,
                  d.plan.temperatureUnit,
                )}
              </p>
              <p>Planned output: {fmtMeasure(d.plan.targetYield)}</p>
              <p>
                Smoker settings:{" "}
                {d.plan.smokerSettings || "____________________"}
              </p>
              <p>Wood / fuel: {d.plan.woodFuel || "____________________"}</p>
              <p>
                Seasoning / brine: {d.plan.seasoning || "____________________"}
              </p>
            </div>
            <p className="smoke-print-procedure">
              Procedure:{" "}
              {d.plan.procedure ||
                "________________________________________________________________"}
            </p>
            <table>
              <caption>
                Checkpoints · Write date/time, temperature and probe. Mark N/A
                where the procedure does not apply.
              </caption>
              <thead>
                <tr>
                  <th>Checkpoint</th>
                  <th>Date / time · CT</th>
                  <th>Temperature / unit</th>
                  <th>Probe / food or ambient</th>
                  <th>Initials</th>
                </tr>
              </thead>
              <tbody>
                {CHECKPOINTS.map((k) => (
                  <tr key={k}>
                    <td>□ {k}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                ))}
                {Array.from({ length: 2 }, (_, i) => (
                  <tr key={i}>
                    <td>□ CHECK</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <caption>Yield & process notes</caption>
              <thead>
                <tr>
                  <th>Raw weight / count</th>
                  <th>Trimmed</th>
                  <th>Finished usable</th>
                  <th>Yield / shrink</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{d.actual.raw ? fmtMeasure(d.actual.raw) : ""}</td>
                  <td>
                    {d.actual.trimmed ? fmtMeasure(d.actual.trimmed) : ""}
                  </td>
                  <td>
                    {d.actual.finished ? fmtMeasure(d.actual.finished) : ""}
                  </td>
                  <td>
                    {y
                      ? `${y.percent.toFixed(1)}% / ${y.shrinkPercent.toFixed(1)}%`
                      : ""}
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              Trim / waste:{" "}
              {d.actual.wasteNotes ||
                "________________________________________________________________"}
            </p>
            <p>
              Quality notes:{" "}
              {d.actual.qualityNotes ||
                "________________________________________________________________"}
            </p>
            <p>
              Notes:
              __________________________________________________________________________________
            </p>
            <p>
              Cook initials: __________ Manager review / date:
              ______________________________________________
            </p>
            {(d.actual.summary || lot.readings.length > 0) && (
              <details open className="smoke-print-recorded">
                <summary>Previously entered facts</summary>
                {d.actual.summary && (
                  <p>
                    Device: {d.actual.summary.sourceTitle} ·{" "}
                    {d.actual.summary.sourceDate} ·{" "}
                    {d.actual.summary.durationMinutes ?? "Unknown"} min reported
                    · target{" "}
                    {smokeTemperature(
                      d.actual.summary.target,
                      d.actual.summary.temperatureUnit,
                    )}{" "}
                    · peak{" "}
                    {smokeTemperature(
                      d.actual.summary.peak,
                      d.actual.summary.temperatureUnit,
                    )}
                  </p>
                )}
                {lot.readings.map((r) => {
                  const v = r.data as {
                    at: string;
                    kind: string;
                    temperature: number | null;
                    temperatureUnit: string;
                    probeName: string;
                    voided: boolean;
                  };
                  return (
                    <p key={r.id}>
                      {v.voided ? "VOID · " : ""}
                      {v.kind} · {fmtSmokeTime(v.at)} CT ·{" "}
                      {smokeTemperature(v.temperature, v.temperatureUnit)} ·{" "}
                      {v.probeName}
                    </p>
                  );
                })}
              </details>
            )}
            <p className="smoke-print-footnote">
              Record sheet only. Device presets, targets and reported durations
              do not approve a cook. Enter paper results and supporting photos
              into this lot for review.
            </p>
          </section>
        );
      })}
      {!lots.length && <p>Add product lots before printing smoke sheets.</p>}
    </PrintController>
  );
}
