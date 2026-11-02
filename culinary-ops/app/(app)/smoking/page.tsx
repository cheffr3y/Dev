import Link from "next/link";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { getVenues } from "@/lib/venues/venue";
import { listSmokeRuns } from "@/lib/smoking/data";
import {
  lotSchema,
  runSchema,
  profileSchema,
  fmtMeasure,
  smokeYield,
} from "@/lib/smoking/smoking";
import { RunForm, ProfileManager } from "./smoking-client";
import "./smoking.css";
export default async function SmokingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePrepUser(),
    params = await searchParams;
  const filters = Object.fromEntries(
    ["from", "to", "venue", "product", "smoker", "cook"].map((key) => [
      key,
      typeof params[key] === "string" ? params[key] : "",
    ]),
  );
  const [runs, venues, profiles] = await Promise.all([
    listSmokeRuns(user, filters),
    getVenues({ includeIds: [user.homeVenueId] }),
    prisma.smokeProfile.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const selectable =
    user.role === "STAFF"
      ? venues.filter((v) => v.id === user.homeVenueId)
      : venues;
  return (
    <main className="smoking">
      <header>
        <p className="smoke-eyebrow">Operations</p>
        <h1>Smoking program</h1>
        <p>Product lots, thermometer photos, checkpoints and yields.</p>
      </header>
      <details className="smoke-card">
        <summary>Start a smoker run</summary>
        <RunForm venues={selectable} cookName={user.name} />
      </details>
      <section className="smoke-card">
        <h2>Cook history</h2>
        <form className="smoke-grid" aria-label="Filter smoking history">
          <label>
            From
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label>
            Through
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
          <label>
            Venue
            <select name="venue" defaultValue={filters.venue}>
              <option value="">All accessible venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {["product", "smoker", "cook"].map((key) => (
            <label key={key}>
              {key[0].toUpperCase() + key.slice(1)}
              <input name={key} defaultValue={filters[key]} />
            </label>
          ))}
          <button>Search history</button>
          <Link href="/smoking">Clear filters</Link>
        </form>
        <p className="smoke-muted">
          Newest 100 matching runs. Yields compare compatible recorded units;
          missing values stay blank.
        </p>
        <div className="smoke-history">
          {runs.map((run) => {
            const data = runSchema.parse(run.data);
            return (
              <article className="smoke-run-row" key={run.id}>
                <h3>
                  <Link href={`/smoking/${run.id}`}>{data.name}</Link>
                </h3>
                <p>
                  {run.businessDate.toISOString().slice(0, 10)} ·{" "}
                  {run.venue.name} · {data.smoker} · {data.cookName}
                </p>
                {run.lots.map((lot) => {
                  const d = lotSchema.parse(lot.data),
                    y = smokeYield(d.actual.raw, d.actual.finished);
                  return (
                    <div key={lot.id} className="smoke-history-lot">
                      <Link
                        href={`/smoking/${run.id}?lot=${lot.id}#lot-${lot.id}`}
                      >
                        {d.plan.label}
                      </Link>
                      <span>
                        {d.plan.product} ·{" "}
                        {d.plan.mode === "COLD" ? "Cold smoke" : "Hot smoke"} ·{" "}
                        {d.status}
                      </span>
                      <span>
                        {d.actual.summary?.durationMinutes == null
                          ? "Duration unrecorded"
                          : `${d.actual.summary.durationMinutes} min reported`}{" "}
                        · {fmtMeasure(d.actual.finished)}
                        {y ? ` · ${y.percent.toFixed(1)}% yield` : ""}
                      </span>
                      {d.actual.qualityNotes && <p>{d.actual.qualityNotes}</p>}
                    </div>
                  );
                })}
              </article>
            );
          })}
          {!runs.length && (
            <p>
              No matching smoker runs. Start a run to record your first cook.
            </p>
          )}
        </div>
      </section>
      <ProfileManager
        manager={user.role !== "STAFF"}
        profiles={profiles.map((p) => ({
          ...p,
          data: profileSchema.parse(p.data),
        }))}
      />
    </main>
  );
}
