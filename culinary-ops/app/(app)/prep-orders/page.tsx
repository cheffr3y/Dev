import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, PageHeader } from "@/components/ui";
import { createPrepOrder } from "./actions";
import { isOpenStatus, prepStatusLabel, PREP_STATUS_COLOR, type PrepStatus } from "@/lib/prep";

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PrepOrdersPage() {
  const user = await requireUser();
  const canCreate = hasRole(user, "MANAGER");

  const orders = await prisma.prepOrder.findMany({
    include: {
      submittedBy: { select: { name: true } },
      lines: { select: { status: true } },
    },
    orderBy: { forDate: "desc" },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const current = orders.filter((o) => o.forDate >= startOfToday);
  const past = orders.filter((o) => o.forDate < startOfToday);

  return (
    <div>
      <PageHeader
        title="Prep Orders"
        subtitle="Commissary production — request, print, produce, transfer."
        action={
          <LinkButton href="/prep-orders/report" variant="secondary">
            Cost-transfer report →
          </LinkButton>
        }
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
              <div className="min-w-[220px] flex-1">
                <Field label="Notes (optional)">
                  <Input name="notes" placeholder="Morning commissary prep…" />
                </Field>
              </div>
              <Button type="submit">Create & add recipes →</Button>
            </form>
          </Card>
        </details>
      )}

      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Today &amp; Upcoming</h2>
      {current.length === 0 ? (
        <EmptyState title="No upcoming prep orders" hint={canCreate ? "Create one above to get started." : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {current.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Past</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {past.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: {
    id: string;
    forDate: Date;
    notes: string | null;
    submittedBy: { name: string };
    lines: { status: string }[];
  };
}) {
  const total = order.lines.length;
  const open = order.lines.filter((l) => isOpenStatus(l.status)).length;
  // Dominant status for the summary badge.
  const allResolved = total > 0 && open === 0;
  const printed = order.lines.some((l) => l.status === "PRINTED" || l.status === "IN_PROGRESS");
  const summaryStatus: PrepStatus = allResolved ? "MADE" : printed ? "PRINTED" : "REQUESTED";

  return (
    <Link href={`/prep-orders/${order.id}`}>
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-zinc-900">
              {order.forDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            </h3>
            <p className="text-sm text-zinc-500">
              {total} line{total === 1 ? "" : "s"}
              {total > 0 && ` · ${open} open`} · by {order.submittedBy.name}
            </p>
          </div>
          <Badge color={PREP_STATUS_COLOR[summaryStatus]}>
            {allResolved ? "complete" : prepStatusLabel(summaryStatus).toLowerCase()}
          </Badge>
        </div>
        {order.notes && <p className="mt-2 text-sm text-zinc-600">{order.notes}</p>}
      </Card>
    </Link>
  );
}
