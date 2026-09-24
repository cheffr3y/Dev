import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { Button, Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { money } from "@/lib/costing";
import { getVenues, getActiveVenue } from "@/lib/venue";
import { createPrepOrder } from "./actions";
import { isOpenStatus } from "@/lib/prep";
import { PrepOrdersTabs, type OrderSummary } from "./PrepOrdersTabs";

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

type OrderWithLines = {
  id: string;
  forDate: Date;
  notes: string | null;
  submittedBy: { name: string };
  lines: { status: string; allocatedCost: number | null }[];
};

// Collapse a single order's lines into the dashboard-card shape, deciding which
// of the three tabs it belongs to.
function toSummary(o: OrderWithLines, startOfTomorrow: Date): { bucket: "active" | "scheduled" | "historical"; summary: OrderSummary } {
  const total = o.lines.length;
  const open = o.lines.filter((l) => isOpenStatus(l.status)).length;
  const started = o.lines.some((l) => l.status === "PRINTED" || l.status === "IN_PROGRESS");
  const cost = o.lines.reduce((sum, l) => sum + (l.allocatedCost ?? 0), 0);

  const status: OrderSummary["status"] =
    total > 0 && open === 0 ? "completed" : started ? "in_progress" : "draft";

  // Completed work is filed away; everything still live is sorted by whether
  // its production date has arrived yet (scheduled = future, active = due/overdue).
  const bucket =
    status === "completed" ? "historical" : o.forDate >= startOfTomorrow ? "scheduled" : "active";

  return {
    bucket,
    summary: {
      id: o.id,
      ref: `#${o.id.slice(-4).toUpperCase()}`,
      dateLabel: o.forDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      total,
      open,
      user: o.submittedBy.name,
      cost: money(cost),
      status,
      notes: o.notes,
    },
  };
}

export default async function PrepOrdersPage() {
  const user = await requireUser();
  const canCreate = hasRole(user, "MANAGER");

  const [orders, venues, { active: activeVenue }] = await Promise.all([
    prisma.prepOrder.findMany({
      include: {
        submittedBy: { select: { name: true } },
        lines: { select: { status: true, allocatedCost: true } },
      },
      orderBy: { forDate: "desc" },
    }),
    getVenues(),
    getActiveVenue(user.homeVenueId),
  ]);

  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(0, 0, 0, 0);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const active: OrderSummary[] = [];
  const scheduled: OrderSummary[] = [];
  const historical: OrderSummary[] = [];
  for (const o of orders) {
    const { bucket, summary } = toSummary(o, startOfTomorrow);
    (bucket === "active" ? active : bucket === "scheduled" ? scheduled : historical).push(summary);
  }
  // Upcoming reads best soonest-first; the rest stay newest-first.
  scheduled.reverse();

  return (
    <div>
      <PageHeader
        title="Prep Orders"
        subtitle="Commissary production — request, print, produce, transfer."
        action={<div className="flex flex-wrap gap-2">
          <LinkButton href="/prep-orders/daily" variant="gold">Daily prep & pickups →</LinkButton>
          <LinkButton href="/prep-orders/report" variant="secondary">Cost-transfer report →</LinkButton>
        </div>}
      />

      {canCreate && (
        <details className="mb-6">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ New prep order</summary>
          <Card className="mt-2 p-4">
            <form action={createPrepOrder} className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <Field label="Production date">
                  <Input name="forDate" type="date" required defaultValue={todayValue()} />
                </Field>
              </div>
              <div className="w-48">
                <Field label="Destination venue" hint="One venue per order.">
                  <Select name="destinationVenueId" required defaultValue={activeVenue?.id ?? venues[0]?.id}>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="min-w-[200px] flex-1">
                <Field label="Notes (optional)">
                  <Input name="notes" placeholder="Morning commissary prep…" />
                </Field>
              </div>
              <Button type="submit">Create & add recipes →</Button>
            </form>
          </Card>
        </details>
      )}

      <PrepOrdersTabs active={active} scheduled={scheduled} historical={historical} />
    </div>
  );
}
