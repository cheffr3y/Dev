import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { businessDate, chicagoToday } from "@/lib/prep-dates";
import { readCost } from "@/lib/prep-costing";
import { Card, PageHeader, Input, Button, LinkButton } from "@/components/ui";
import { EntryForm, CloseDayForm } from "./EntryForms";
import { generateDailyPacket } from "./actions";
export default async function PrepToday({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser(),
    p = await searchParams,
    date = businessDate(p.date ?? chicagoToday()),
    day = date.toISOString().slice(0, 10),
    manager = hasRole(user, "MANAGER");
  const [
    requests,
    batches,
    transfers,
    closeout,
    recipes,
    venues,
    items,
    waste,
    packets,
  ] = await Promise.all([
    prisma.prepOrderLine.findMany({
      where: { prepOrder: { forDate: date } },
      include: { recipe: true, destinationVenue: true },
      orderBy: [{ recipeId: "asc" }, { id: "asc" }],
      take: 1000,
    }),
    prisma.productionBatch.findMany({
      where: { producedOn: date },
      include: { recipe: true, transfers: { include: { venue: true } } },
      orderBy: { createdAt: "asc" },
      take: 1000,
    }),
    prisma.stockTransfer.findMany({
      where: { transferDate: date },
      include: {
        recipe: true,
        batch: { include: { recipe: true } },
        venue: true,
        amendments: {
          where: { kind: "COST_COMPLETION" },
          orderBy: { revision: "desc" },
          take: 1,
        },
      },
      take: 1000,
    }),
    prisma.productionCloseout.findUnique({ where: { businessDate: date } }),
    prisma.recipe.findMany({
      select: {
        id: true,
        name: true,
        prodCode: true,
        yieldQty: true,
        yieldUnit: true,
        productionPersonMinutes: true,
      },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.venue.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.finishedStockAdjustment.findMany({ where: { date }, take: 1000 }),
    prisma.prepPacketSnapshot.findMany({
      where: { scope: { startsWith: `day-${day}-` } },
      select: { id: true, scope: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const open = requests.filter((l) =>
    ["REQUESTED", "PRINTED", "IN_PROGRESS"].includes(l.status),
  );
  const closed = !!closeout?.finalizedAt;
  return (
    <div>
      <PageHeader
        title="Prep Orders"
        subtitle={date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })}
        action={
          <LinkButton href="/prep-orders/requests">New request</LinkButton>
        }
      />
      <form className="mb-5 flex gap-3">
        <Input
          aria-label="Business date"
          name="date"
          type="date"
          defaultValue={day}
        />
        <Button>View day</Button>
      </form>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <form action={generateDailyPacket}>
          <input type="hidden" name="date" value={day} />
          <input type="hidden" name="operationKey" value={randomUUID()} />
          {manager && !closed && (
            <Button variant="secondary">Print cook packet</Button>
          )}
        </form>
        <a href="#results-entry" className="text-blue-700">
          Enter results
        </a>
        <a href="#pickup-entry" className="text-blue-700">
          Record pickup
        </a>
        {closed && <strong>Day closed</strong>}
      </div>
      {packets.length > 0 && (
        <details className="mb-5">
          <summary>Reprint a frozen packet</summary>
          {packets.map((p) => (
            <p key={p.id}>
              <Link
                className="text-blue-700"
                href={`/prep-orders/${p.scope}/packet`}
              >
                {p.createdAt.toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })}{" "}
                · {p.id}
              </Link>
            </p>
          ))}
        </details>
      )}
      <Card className="mb-5 overflow-x-auto p-4">
        <h2 className="mb-3 text-lg font-semibold">Today’s requests</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Item / request</th>
              <th>Venue</th>
              <th>Requested</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-3">
                  <Link href={`/prep-orders/${l.prepOrderId}`}>
                    {l.recipe.name} · #{l.id.slice(-6)}
                  </Link>
                </td>
                <td>{l.destinationVenue.name}</td>
                <td>
                  {l.requestedQty} {l.requestedUnit}
                </td>
                <td>
                  {l.actualQty == null ? "—" : `${l.actualQty} ${l.actualUnit}`}{" "}
                  {l.status === "SHORT" || l.status === "NOT_MADE"
                    ? ` · ${l.notes}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!requests.length && <p>No requests for this day.</p>}
      </Card>
      <Card className="mb-5 p-4">
        <h2 className="mb-3 text-lg font-semibold">Today’s results</h2>
        {batches.map((b) => (
          <div key={b.id} className="border-t py-3">
            <p className="font-medium">
              {b.recipe.name} · Made {b.outputQty} {b.outputUnit} · Kept{" "}
              {b.retainedQty ?? "historical"} · Production waste{" "}
              {b.productionWasteQty ?? "historical"}
            </p>
            <p className="text-sm">
              {b.transfers
                .map((t) => `${t.venue.name}: ${t.quantity} ${t.unit}`)
                .join(" · ")}{" "}
              · Cook: {b.cookName ?? "historical record"}
            </p>
          </div>
        ))}
        {transfers
          .filter((t) => !t.batchId)
          .map((t) => (
            <p key={t.id} className="py-2">
              <Link href={`/prep-orders/transfers/${t.id}`}>
                Pickup · {t.recipe?.name} → {t.venue.name} · {t.quantity}{" "}
                {t.unit}
              </Link>
            </p>
          ))}
      </Card>
      {!closed && manager && (
        <>
          <section id="results-entry">
            <Card className="mb-5 p-5">
              <details>
                <summary className="cursor-pointer text-lg font-semibold">
                  Enter results
                </summary>
                <div className="mt-4">
                  <EntryForm
                    mode="CONFIRM"
                    date={day}
                    operationKey={randomUUID()}
                    recipes={recipes}
                    venues={venues}
                    items={items}
                    requests={open.map((l) => ({
                      id: l.id,
                      recipeId: l.recipeId,
                      venueId: l.destinationVenueId,
                      venueName: l.destinationVenue.name,
                      quantity: l.requestedQty,
                      unit: l.requestedUnit,
                    }))}
                  />
                </div>
              </details>
            </Card>
          </section>
          <section id="pickup-entry">
            <Card className="mb-5 p-5">
              <details>
                <summary className="cursor-pointer text-lg font-semibold">
                  Record pickup
                </summary>
                <div className="mt-4">
                  <EntryForm
                    mode="PICKUP"
                    date={day}
                    operationKey={randomUUID()}
                    recipes={recipes}
                    venues={venues}
                    items={items}
                  />
                </div>
              </details>
            </Card>
          </section>
        </>
      )}
      <Card className="mb-5 p-5">
        <h2 className="mb-3 text-lg font-semibold">Daily wrap-up</h2>
        {requests
          .filter((l) => l.status === "SHORT" || l.status === "NOT_MADE")
          .map((l) => (
            <p key={l.id}>
              Shortage · {l.recipe.name} → {l.destinationVenue.name}: {l.notes}
            </p>
          ))}
        {batches.flatMap((b) =>
          (readCost(b.costingSnapshot)?.productionSupplies ?? []).map(
            (s, i) => (
              <p key={`${b.id}-${i}`} className="text-sm">
                Production {b.recipe.name} · supplied by{" "}
                {venues.find((v) => v.id === s.venueId)?.name}:{" "}
                {items.find((v) => v.id === s.itemId)?.name ?? s.itemId} ·{" "}
                {s.quantity} {s.unit} · {s.note} · Shared/retained supply facts
              </p>
            ),
          ),
        )}
        {transfers.map((t) => {
          const s = readCost(
            t.amendments[0]?.costingSnapshot ?? t.costingSnapshot,
          );
          return (
            <div key={t.id} className="border-t py-3">
              <Link
                className="text-blue-700"
                href={`/prep-orders/transfers/${t.id}`}
              >
                {t.recipe?.name ?? t.batch?.recipe.name} → {t.venue.name} ·{" "}
                {s?.charge.total == null && s
                  ? "Pending costs"
                  : t.accountingState === "LEGACY"
                    ? "Captured historical charge"
                    : "Costs captured"}
              </Link>
              {s?.charge.issues.map((i) => (
                <p key={i} className="text-sm text-amber-800">
                  {i}
                </p>
              ))}
              {s?.capture.supplies.map((v, i) => (
                <p key={i} className="text-sm">
                  Supplied by {venues.find((x) => x.id === v.venueId)?.name}:{" "}
                  {items.find((x) => x.id === v.itemId)?.name ?? v.itemId} ·{" "}
                  {v.quantity} {v.unit} · {v.note}
                  {v.shared ? " · Held for shared-supply review" : ""}
                </p>
              ))}
            </div>
          );
        })}
        {!closed && manager && (
          <div className="mt-4">
            <CloseDayForm date={day} operationKey={randomUUID()} />
          </div>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">
          Exceptions: returns, waste, corrections
        </h2>
        <p className="my-2 text-sm">
          Open a delivery above or in Accounting to record a linked return or
          correction.
        </p>
        {waste.map((w) => (
          <p key={w.id} className="text-sm">
            {w.quantity} {w.unit} · {w.reason} · {w.stableId}
          </p>
        ))}
      </Card>
    </div>
  );
}
