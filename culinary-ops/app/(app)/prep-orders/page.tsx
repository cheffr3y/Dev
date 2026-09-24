import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePrepUser } from "@/lib/prep-session";
import { hasRole } from "@/lib/session";
import { businessDate, chicagoToday } from "@/lib/prep-dates";
import { groupPrepRequests } from "@/lib/prep-worksheet";
import { Card, PageHeader, Input, Button, LinkButton } from "@/components/ui";
import { generateDailyPacket } from "./actions";

export default async function DailyPrep({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePrepUser();
  const p = await searchParams;
  const date = businessDate(p.date ?? chicagoToday());
  const day = date.toISOString().slice(0, 10);
  const [requests, packets, closeout] = await Promise.all([
    prisma.prepOrderLine.findMany({
      where: { prepOrder: { forDate: date } },
      include: { recipe: true, destinationVenue: true, prepOrder: true },
      orderBy: { id: "asc" },
    }),
    prisma.prepPacketSnapshot.findMany({
      where: { scope: { startsWith: `day-${day}-` } },
      select: { id: true, scope: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.productionCloseout.findUnique({ where: { businessDate: date } }),
  ]);
  const groups = groupPrepRequests(
    requests.map((l) => ({
      id: l.id,
      prepOrderId: l.prepOrderId,
      recipeId: l.recipeId,
      recipeName: l.recipe.name,
      yieldUnit: l.recipe.yieldUnit,
      yieldQty: l.recipe.yieldQty,
      productionPersonMinutes: l.recipe.productionPersonMinutes,
      venueId: l.destinationVenueId,
      venueName: l.destinationVenue.name,
      quantity: l.requestedQty,
      unit: l.requestedUnit,
      lot: l.lot,
      status: l.status,
      instructions: l.prepOrder.notes,
    })),
  );
  return (
    <div>
      <PageHeader
        title="Daily Prep"
        subtitle="Order what you need. Make from the shared prep sheet."
        action={
          <LinkButton href={`/prep-orders/requests?date=${day}`}>
            Place order
          </LinkButton>
        }
      />
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <form className="flex flex-wrap gap-2">
          <Input
            aria-label="Prep date"
            name="date"
            type="date"
            defaultValue={day}
          />
          <Button variant="secondary">View day</Button>
        </form>
        {hasRole(user, "MANAGER") &&
          !closeout?.finalizedAt &&
          requests.length > 0 && (
            <form action={generateDailyPacket}>
              <input type="hidden" name="date" value={day} />
              <input type="hidden" name="operationKey" value={randomUUID()} />
              <Button>Print prep sheet</Button>
            </form>
          )}
        {packets[0] && (
          <LinkButton
            variant="secondary"
            href={`/prep-orders/${packets[0].scope}/packet`}
          >
            View / reprint prep sheet
          </LinkButton>
        )}
        {user.role === "ADMIN" && (
          <Link
            className="text-blue-700"
            href={`/prep-orders/closeout?date=${day}`}
          >
            Open daily worksheet →
          </Link>
        )}
      </div>
      <p className="no-print mb-4 text-sm">
        <Link href="/prep-orders/history" className="text-blue-700">
          Past orders
        </Link>
      </p>
      <h2 className="mb-4 text-lg font-semibold">
        {date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })}
        {closeout?.finalizedAt ? " · Day finished" : ""}
      </h2>
      {!groups.length && (
        <Card className="p-6">
          No prep ordered for this day. Start with Place order.
        </Card>
      )}
      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.recipeId} className="p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">{group.name}</h3>
              <p className="font-medium">
                {group.requested == null
                  ? "Check request units"
                  : `${Number(group.requested.toFixed(3))} ${group.unit} total requested`}
              </p>
            </div>
            <div className="divide-y">
              {group.rows.map((row) => (
                <div key={row.id} className="py-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Link
                      className="text-blue-700"
                      href={`/prep-orders/${row.prepOrderId}`}
                    >
                      {row.venueName}
                    </Link>
                    <span>
                      {row.quantity} {row.unit} ·{" "}
                      {["MADE", "SHORT", "NOT_MADE"].includes(row.status)
                        ? "Results recorded"
                        : "Ordered"}
                    </span>
                  </div>
                  {row.instructions && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">
                      {row.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {packets.length > 1 && (
        <details className="no-print mt-6">
          <summary>Earlier prep sheets</summary>
          {packets.slice(1).map((packet) => (
            <p key={packet.id} className="mt-2">
              <Link href={`/prep-orders/${packet.scope}/packet`}>
                {packet.createdAt.toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })}
              </Link>
            </p>
          ))}
        </details>
      )}
      {!hasRole(user, "MANAGER") && !packets.length && requests.length > 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          The prep sheet will be available here once a manager prints it.
          Individual order sheets are available from each order.
        </p>
      )}
    </div>
  );
}
