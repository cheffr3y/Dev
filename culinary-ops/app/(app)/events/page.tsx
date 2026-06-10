import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues, getActiveVenue } from "@/lib/venue";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createEvent } from "./actions";
import { STATUS_COLOR, EVENT_STATUSES as STATUSES, statusLabel } from "@/lib/event-status";

export default async function EventsPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const [venues, { active }, events] = await Promise.all([
    getVenues(),
    getActiveVenue(user.homeVenueId),
    prisma.event.findMany({
      include: { venue: true, _count: { select: { menuItems: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const now = new Date();
  const upcoming = events.filter((e) => e.date >= now);
  const past = events.filter((e) => e.date < now);

  return (
    <div>
      <PageHeader title="Events" subtitle="Plan menus, headcounts, and prep across venues." />

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ New event</summary>
          <Card className="mt-2 p-4">
            <form action={createEvent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Event name">
                  <Input name="name" required placeholder="Charity Gala" />
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
                <Field label="Date">
                  <Input name="date" type="date" required />
                </Field>
                <Field label="Guest count">
                  <Input name="guestCount" type="number" min="0" defaultValue={0} />
                </Field>
                <Field label="Status">
                  <Select name="status" defaultValue="PLANNED">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Location">
                  <Input name="location" placeholder="Ballroom / offsite" />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea name="notes" placeholder="Dietary restrictions, service style, timing…" />
              </Field>
              <Button type="submit">Create & build menu →</Button>
            </form>
          </Card>
        </details>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming events" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Past</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {past.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EventCard({
  event,
}: {
  event: {
    id: string;
    name: string;
    date: Date;
    guestCount: number;
    status: string;
    venue: { code: string; name: string };
    _count: { menuItems: number };
  };
}) {
  return (
    <Link href={`/events/${event.id}`}>
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-zinc-900">{event.name}</h3>
            <p className="text-sm text-zinc-500">
              {event.venue.name} · {event.guestCount} guests · {event._count.menuItems} dishes
            </p>
          </div>
          <Badge color={STATUS_COLOR[event.status]}>{event.status.toLowerCase()}</Badge>
        </div>
        <p className="mt-2 text-sm font-medium text-zinc-700">
          {event.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </p>
      </Card>
    </Link>
  );
}
