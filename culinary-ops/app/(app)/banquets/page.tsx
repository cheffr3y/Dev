import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues, getActiveVenue } from "@/lib/venue";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { createBanquet } from "./actions";
import { STATUS_COLOR } from "@/lib/event-status";

export default async function BanquetsPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const [venues, { active }, banquets] = await Promise.all([
    getVenues(),
    getActiveVenue(user.homeVenueId),
    prisma.banquet.findMany({
      include: { venue: true, _count: { select: { menuItems: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const now = new Date();
  const upcoming = banquets.filter((b) => b.date >= now);
  const past = banquets.filter((b) => b.date < now);

  return (
    <div>
      <PageHeader title="Banquets" subtitle="Transcribe BEOs and scale every dish to the ordered count." />

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ New banquet (from a BEO)</summary>
          <Card className="mt-2 p-4">
            {/* Just enough to file the BEO — name + date. The rest (guests, service
                window, contact, setup, instructions) lives on the banquet itself
                and is filled in on the next screen straight from the sheet. */}
            <form action={createBanquet} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                <Field label="Event name">
                  <Input name="name" required placeholder="Miller Wedding" />
                </Field>
                <Field label="Date">
                  <Input name="date" type="date" required />
                </Field>
                <Field label="Venue">
                  <Select name="venueId" defaultValue={active?.id ?? venues[0]?.id}>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">Everything else off the BEO is filled in on the next screen.</p>
                <Button type="submit">Create & add food lines →</Button>
              </div>
            </form>
          </Card>
        </details>
      )}

      {upcoming.length === 0 ? (
        <>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Upcoming</h2>
          <EmptyState title="No upcoming banquets" hint={canEdit ? "Transcribe a BEO to get started." : undefined} />
        </>
      ) : (
        <DaySections heading="Upcoming" banquets={upcoming} />
      )}

      {past.length > 0 && <DaySections heading="Past" banquets={[...past].reverse()} className="mt-10" />}
    </div>
  );
}

type BanquetListItem = Parameters<typeof BanquetCard>[0]["banquet"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcWeek(d: Date): Date {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function fmtWeekStart(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Group a banquet list by calendar date (UTC, matching how dates are stored)
// so a chef sees the whole day at once. When a date holds more than one event,
// surface a "Day prep" link to the combined make-once rollup.
function DaySections({ heading, banquets, className }: { heading: string; banquets: BanquetListItem[]; className?: string }) {
  const groups = new Map<string, BanquetListItem[]>();
  for (const b of banquets) {
    const key = b.date.toISOString().slice(0, 10);
    const arr = groups.get(key) ?? [];
    arr.push(b);
    groups.set(key, arr);
  }

  return (
    <div className={className}>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">{heading}</h2>
      <div className="space-y-6">
        {[...groups.entries()].map(([key, group]) => {
          const date = group[0].date;
          return (
            <section key={key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-zinc-700">
                  {date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                  {group.length > 1 && <span className="ml-2 text-xs font-normal text-zinc-400">{group.length} events</span>}
                </h3>
                <div className="flex items-center gap-3">
                  <Link href={`/banquets/week/${isoDate(startOfUtcWeek(date))}`} className="text-xs font-medium text-blue-600 hover:underline">
                    Week prep - {fmtWeekStart(startOfUtcWeek(date))}
                  </Link>
                  {group.length > 1 && (
                    <Link href={`/banquets/day/${key}`} className="text-xs font-medium text-blue-600 hover:underline">
                      Day prep →
                    </Link>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.map((b) => (
                  <BanquetCard key={b.id} banquet={b} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BanquetCard({
  banquet,
}: {
  banquet: {
    id: string;
    name: string;
    date: Date;
    guestCount: number;
    status: string;
    timeLabel: string | null;
    venue: { code: string; name: string };
    _count: { menuItems: number };
  };
}) {
  return (
    <Link href={`/banquets/${banquet.id}`}>
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-zinc-900">{banquet.name}</h3>
            <p className="text-sm text-zinc-500">
              {banquet.venue.name} · {banquet.guestCount} guests · {banquet._count.menuItems} dishes
            </p>
          </div>
          <Badge color={STATUS_COLOR[banquet.status]}>{banquet.status.toLowerCase()}</Badge>
        </div>
        <p className="mt-2 text-sm font-medium text-zinc-700">
          {banquet.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          {banquet.timeLabel ? ` · ${banquet.timeLabel}` : ""}
        </p>
      </Card>
    </Link>
  );
}
