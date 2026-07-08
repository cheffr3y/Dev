import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createFestival } from "./actions";
import { STATUS_COLOR } from "@/lib/event-status";

const CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;

export default async function FestivalsPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const [venues, festivals] = await Promise.all([
    getVenues(),
    prisma.festival.findMany({
      include: { _count: { select: { tents: true, menuItems: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const now = new Date();
  const upcoming = festivals.filter((f) => f.date >= now);
  const past = festivals.filter((f) => f.date < now);

  return (
    <div>
      <PageHeader title="Festivals" subtitle="Forecast, scale, and order for tented festival menus." />

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ New festival</summary>
          <Card className="mt-2 p-4">
            <form action={createFestival} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Festival name">
                  <Input name="name" required placeholder="Red White & Brews" />
                </Field>
                <Field label="Date">
                  <Input name="date" type="date" required />
                </Field>
                <Field label="Venue (inventory hint)" hint="Optional — festivals count their own on-hand">
                  <Select name="venueId" defaultValue="">
                    <option value="">— none —</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Expected attendance">
                  <Input name="expectedAttendance" type="number" min="0" defaultValue={0} />
                </Field>
                <Field label="Capture rate (%)" hint="Share of attendance that buys food">
                  <Input name="captureRate" type="number" min="0" max="100" step="1" defaultValue={35} />
                </Field>
                <Field label="Confidence">
                  <Select name="forecastConfidence" defaultValue="MEDIUM">
                    {CONFIDENCES.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0) + c.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Buffer (%)" hint="Default prep cushion on top of forecast">
                  <Input name="bufferPct" type="number" min="0" max="100" step="1" defaultValue={10} />
                </Field>
                <Field label="Weather notes">
                  <Input name="weatherNotes" placeholder="Hot & sunny, rain risk pm…" />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea name="notes" placeholder="Permits, load-in times, power…" />
              </Field>
              <Button type="submit">Create & plan →</Button>
            </form>
          </Card>
        </details>
      )}

      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming festivals" hint="Create one to start forecasting." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.map((f) => (
            <FestivalCard key={f.id} festival={f} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Past</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {past.map((f) => (
              <FestivalCard key={f.id} festival={f} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FestivalCard({
  festival,
}: {
  festival: {
    id: string;
    name: string;
    date: Date;
    expectedAttendance: number;
    captureRate: number;
    status: string;
    _count: { tents: number; menuItems: number };
  };
}) {
  const covers = Math.round(festival.expectedAttendance * festival.captureRate);
  return (
    <Link href={`/festivals/${festival.id}`}>
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-zinc-900">{festival.name}</h3>
            <p className="text-sm text-zinc-500">
              {festival.expectedAttendance.toLocaleString()} attendance · ~{covers.toLocaleString()} covers ·{" "}
              {festival._count.tents} tents · {festival._count.menuItems} items
            </p>
          </div>
          <Badge color={STATUS_COLOR[festival.status]}>{festival.status.toLowerCase()}</Badge>
        </div>
        <p className="mt-2 text-sm font-medium text-zinc-700">
          {festival.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </p>
      </Card>
    </Link>
  );
}
