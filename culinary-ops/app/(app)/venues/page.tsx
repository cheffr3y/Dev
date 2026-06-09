import { prisma } from "@/lib/prisma";
import { requireRole, getCurrentUser } from "@/lib/session";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { createVenue, updateVenue, deleteVenue } from "./actions";

function VenueFields({ venue }: { venue?: { name: string; code: string; address: string | null; notes: string | null } }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="Name">
        <Input name="name" required defaultValue={venue?.name} placeholder="Downtown Kitchen" />
      </Field>
      <Field label="Code">
        <Input name="code" required maxLength={6} defaultValue={venue?.code} placeholder="DT" />
      </Field>
      <div className="col-span-2">
        <Field label="Address">
          <Input name="address" defaultValue={venue?.address ?? ""} placeholder="120 Market St" />
        </Field>
      </div>
      <div className="col-span-2 md:col-span-4">
        <Field label="Notes">
          <Textarea name="notes" defaultValue={venue?.notes ?? ""} />
        </Field>
      </div>
    </div>
  );
}

export default async function VenuesPage() {
  // Managers and admins reach this page.
  await requireRole("MANAGER");
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const venues = await prisma.venue.findMany({
    include: { _count: { select: { events: true, orderGuides: true, inventory: true, users: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Venues" subtitle="Physical locations you operate." />

      <details className="mb-5">
        <summary className="cursor-pointer text-sm font-medium text-blue-600">+ Add venue</summary>
        <Card className="mt-2 p-4">
          <form action={createVenue} className="space-y-3">
            <VenueFields />
            <Button type="submit">Add venue</Button>
          </form>
        </Card>
      </details>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {venues.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-zinc-900">{v.name}</h3>
                {v.address && <p className="text-sm text-zinc-500">{v.address}</p>}
              </div>
              <Badge color="blue">{v.code}</Badge>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              {v._count.users} users · {v._count.events} events · {v._count.orderGuides} guides · {v._count.inventory} stocked
            </p>
            <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3">
              <details className="flex-1">
                <summary className="cursor-pointer text-xs text-blue-600">edit</summary>
                <form action={updateVenue} className="mt-2 space-y-3">
                  <input type="hidden" name="id" value={v.id} />
                  <VenueFields venue={{ name: v.name, code: v.code, address: v.address, notes: v.notes }} />
                  <Button type="submit" variant="secondary">Save</Button>
                </form>
              </details>
              {isAdmin && (
                <form action={deleteVenue}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className="text-xs text-red-500 hover:underline">delete</button>
                </form>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
