import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { prepReportDates } from "@/lib/prep-report";
import { Card, PageHeader, Input, Button } from "@/components/ui";
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const p = await searchParams,
    r = prepReportDates(p.from, p.to);
  const [orders, days] = await Promise.all([
    prisma.prepOrder.findMany({
      where: {
        forDate: { gte: r.fromDate, lte: r.toDate },
        lines: {
          every: { status: { in: ["MADE", "SHORT", "NOT_MADE"] } },
          some: {},
        },
      },
      include: { destinationVenue: true },
      orderBy: { forDate: "desc" },
      take: 500,
    }),
    prisma.productionCloseout.findMany({
      where: {
        businessDate: { gte: r.fromDate, lte: r.toDate },
        finalizedAt: { not: null },
      },
      orderBy: { businessDate: "desc" },
      take: 500,
    }),
  ]);
  return (
    <div>
      <PageHeader
        title="History"
        subtitle="Closed days and completed requests are preserved."
      />
      <form className="mb-5 flex gap-3">
        <Input
          aria-label="From date"
          type="date"
          name="from"
          defaultValue={r.from}
        />
        <Input aria-label="To date" type="date" name="to" defaultValue={r.to} />
        <Button>Apply</Button>
      </form>
      <div className="space-y-3">
        {days.map((d) => (
          <Card key={d.id} className="p-3">
            <Link
              href={`/prep-orders?date=${d.businessDate.toISOString().slice(0, 10)}`}
            >
              Closed day · {d.businessDate.toISOString().slice(0, 10)}
            </Link>
          </Card>
        ))}
        {orders.map((o) => (
          <Card key={o.id} className="p-3">
            <Link href={`/prep-orders/${o.id}`}>
              {o.forDate.toISOString().slice(0, 10)} ·{" "}
              {o.destinationVenue?.name} · #{o.id.slice(-6)}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
