import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { updateVenue } from "./actions";

const usage = { select: { users: true, events: true, banquets: true, menuRollouts: true, toGoRollups: true, orderGuides: true, inventory: true } } as const;

export default async function VenuesPage() {
  await requireRole("MANAGER");
  const venues = await prisma.venue.findMany({ include: { _count: usage }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  type Venue = typeof venues[number];
  function Details({ venue }: { venue: Venue }) {
    return <div className="space-y-2"><div className="flex items-start justify-between gap-3"><h3 className="font-medium text-ink">{venue.name}</h3><Badge>{venue.code}</Badge></div>
      {venue.address && <p className="text-sm text-zinc-500">{venue.address}</p>}
      <p className="text-xs text-zinc-500">{venue._count.users} users · {venue._count.events + venue._count.banquets} events · {venue._count.menuRollouts + venue._count.toGoRollups} rollups · {venue._count.orderGuides} guides · {venue._count.inventory} stocked</p>
      <details><summary className="cursor-pointer text-xs text-gold">Edit address / notes</summary><form action={updateVenue} className="mt-3 space-y-3"><input type="hidden" name="id" value={venue.id} /><Field label="Address"><Input name="address" maxLength={1000} defaultValue={venue.address ?? ""} /></Field><Field label="Notes"><Textarea name="notes" maxLength={5000} defaultValue={venue.notes ?? ""} /></Field><Button variant="secondary">Save location details</Button></form></details>
    </div>;
  }
  const standard = venues.filter(venue => venue.standardKey != null);
  const legacy = venues.filter(venue => venue.standardKey == null);
  return <div><PageHeader title="Venues & Rooms" subtitle="One company directory for menus, holiday rollups, events, prep and scheduling." />
    <p className="mb-6 text-sm text-zinc-600">Rooms appear under their parent venue in location selectors throughout the app. Select the overall venue when a plan covers the whole property.</p>
    <div className="grid gap-5 lg:grid-cols-2">{standard.filter(venue => !venue.parentId).map(venue => <Card key={venue.id} className="p-5"><Details venue={venue} />{standard.some(room => room.parentId === venue.id) && <div className="mt-4 space-y-4 border-l-2 border-hairline pl-4">{standard.filter(room => room.parentId === venue.id).map(room => <Details key={room.id} venue={room} />)}</div>}</Card>)}</div>
    {legacy.length > 0 && <details className="mt-8"><summary className="cursor-pointer text-sm text-gold">Legacy locations · {legacy.length} records retained</summary><p className="my-4 text-sm text-zinc-600">These records retain their existing users, stock, events and accounting history. They are excluded from new location choices. Existing assignments remain visible when editing or reviewing past activity.</p><div className="grid gap-4 lg:grid-cols-2">{legacy.map(venue => <Card key={venue.id} className="p-5"><Details venue={venue} /></Card>)}</div></details>}
  </div>;
}
