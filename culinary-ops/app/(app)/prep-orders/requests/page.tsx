import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePrepUser } from "@/lib/prep-session";
import { chicagoToday } from "@/lib/prep-dates";
import { createPrepOrder } from "../actions";
import {
  Button,
  Input,
  Select,
  Field,
  Card,
  PageHeader,
} from "@/components/ui";
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePrepUser();
  const { date } = await searchParams;
  const [orders, venues] = await Promise.all([
    prisma.prepOrder.findMany({
      where: {
        OR: [
          {
            lines: {
              some: { status: { in: ["REQUESTED", "PRINTED", "IN_PROGRESS"] } },
            },
          },
          { lines: { none: {} } },
        ],
      },
      include: { destinationVenue: true, lines: true },
      orderBy: { forDate: "asc" },
      take: 200,
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" }, take: 200 }),
  ]);
  return (
    <div>
      <PageHeader
        title="Prep orders"
        subtitle="Choose the day and venue, then add what you need."
      />
      {user.role === "ADMIN" || user.homeVenueId ? (
        <Card className="mb-6 p-4">
          <form
            action={createPrepOrder}
            className="flex flex-wrap items-end gap-4"
          >
            <Field label="Date">
              <Input
                name="forDate"
                type="date"
                defaultValue={date ?? chicagoToday()}
                required
              />
            </Field>
            <Field label="Venue">
              <Select name="destinationVenueId" required>
                {venues
                  .filter(
                    (v) => user.role === "ADMIN" || v.id === user.homeVenueId,
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Input name="notes" />
            </Field>
            <Button>Start order</Button>
          </form>
        </Card>
      ) : (
        <p className="mb-6 rounded border p-4">
          Ask an admin to assign your home venue before placing an order. You
          can still view and print the daily prep list.
        </p>
      )}
      <p className="mb-3 text-sm text-zinc-500">
        Up to 200 open requests, earliest first.
      </p>
      <div className="space-y-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-4">
            <Link href={`/prep-orders/${o.id}`}>
              {o.forDate.toISOString().slice(0, 10)} ·{" "}
              {o.destinationVenue?.name ?? "Choose venue"} · #{o.id.slice(-6)} ·{" "}
              {o.lines.length} items
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
