import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues, getActiveVenue } from "@/lib/venue";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createBanquet } from "./actions";
import { STATUS_COLOR, EVENT_STATUSES as STATUSES, statusLabel } from "@/lib/event-status";

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
            <form action={createBanquet} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Event name">
                  <Input name="name" required placeholder="Miller Wedding" />
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
                <Field label="Service window">
                  <Input name="timeLabel" placeholder="5:00 pm – 1:00 am" />
                </Field>
                <Field label="Guests">
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
                  <Input name="location" placeholder="Foxtown Station" />
                </Field>
                <Field label="Area(s) / room">
                  <Input name="areas" placeholder="Opitz Hall" />
                </Field>
                <Field label="Sales manager">
                  <Input name="salesManager" placeholder="Michelle Banaszak" />
                </Field>
                <Field label="Contact name">
                  <Input name="contactName" placeholder="Sarah Miller" />
                </Field>
                <Field label="Contact email">
                  <Input name="contactEmail" type="email" placeholder="contact@example.com" />
                </Field>
                <Field label="Contact phone">
                  <Input name="contactPhone" placeholder="414-555-1717" />
                </Field>
              </div>
              <Field label="Special instructions">
                <Textarea name="specialInstructions" placeholder="Kings table for head table; white linen grey napkins…" />
              </Field>
              <Field label="Setup">
                <Textarea name="setupNotes" placeholder="Full table setting; salt & pepper; meal indicators on place cards…" />
              </Field>
              <Button type="submit">Create & add food lines →</Button>
            </form>
          </Card>
        </details>
      )}

      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming banquets" hint={canEdit ? "Transcribe a BEO to get started." : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.map((b) => (
            <BanquetCard key={b.id} banquet={b} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Past</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {past.map((b) => (
              <BanquetCard key={b.id} banquet={b} />
            ))}
          </div>
        </>
      )}
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
