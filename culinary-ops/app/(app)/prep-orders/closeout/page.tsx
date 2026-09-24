import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePrepUser } from "@/lib/prep-session";
import { loadCostRecipes } from "@/lib/prep-workflow";
import { groupPrepRequests } from "@/lib/prep-worksheet";
import { DailyWorksheet } from "./DailyWorksheet";
import { businessDate, chicagoToday } from "@/lib/prep-dates";
import { readCost } from "@/lib/prep-costing";
import { Card, PageHeader, Input, Button, LinkButton } from "@/components/ui";
import { EntryForm, CloseDayForm } from "../EntryForms";
export default async function CloseoutPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePrepUser("ADMIN"),
    p = await searchParams,
    date = businessDate(p.date ?? chicagoToday()),
    day = date.toISOString().slice(0, 10),
    manager = user.role === "ADMIN";
  const [
    requests,
    batches,
    transfers,
    closeout,
    recipes,
    venues,
    items,
    waste,
  ] = await Promise.all([
    prisma.prepOrderLine.findMany({
      where: { prepOrder: { forDate: date } },
      include: { recipe: true, destinationVenue: true, prepOrder: true },
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
  ]);
  const open = requests.filter((l) =>
    ["REQUESTED", "PRINTED", "IN_PROGRESS"].includes(l.status),
  );
  const closed = !!closeout?.finalizedAt;
  const groups = groupPrepRequests(
    open.map((l) => ({
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
  const ingredientLists = await Promise.all(
    groups.map(async (g) => {
      const graph = await loadCostRecipes(prisma, g.recipeId);
      const ingredients = new Map(
        graph.flatMap((r) =>
          r.items.map(
            (i) =>
              [
                i.itemId,
                { id: i.itemId, name: i.item.name, unit: i.item.unit },
              ] as const,
          ),
        ),
      );
      return [
        g.recipeId,
        [...ingredients.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ] as const;
    }),
  );
  return (
    <div>
      <PageHeader
        title="Daily closeout"
        subtitle={date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })}
        action={
          <LinkButton href={`/prep-orders?date=${day}`} variant="secondary">
            View prep list
          </LinkButton>
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
      <p className="mb-5 text-zinc-600">
        Fill in what was made and sent. Add ingredient deductions where needed,
        then finish the day.
      </p>
      {closed ? (
        <Card className="mb-5 p-5">
          <strong>Day finished</strong>
          <p>Results are preserved. Use a linked correction to make changes.</p>
        </Card>
      ) : (
        <DailyWorksheet
          key={day}
          date={day}
          groups={groups}
          ingredients={Object.fromEntries(ingredientLists)}
        />
      )}
      <Card className="mb-5 p-4">
        <h2 className="mb-3 text-lg font-semibold">Saved results</h2>
        {batches.map((b) => (
          <div key={b.id} className="border-t py-3">
            <p className="font-medium">
              {b.recipe.name} · Made {b.outputQty} {b.outputUnit} · Kept{" "}
              {b.retainedQty ?? "historical"} · Production waste{" "}
              {b.productionWasteQty ?? "historical"}
            </p>
            {b.notes && (
              <p className="my-2 whitespace-pre-wrap text-sm">{b.notes}</p>
            )}
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
          <section id="pickup-entry">
            <Card className="mb-5 p-5">
              <details>
                <summary className="cursor-pointer text-lg font-semibold">
                  Extra pickup without an order
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
        <h2 className="mb-3 text-lg font-semibold">Finish & export</h2>
        <details className="mb-4">
          <summary>Saved deliveries, deductions & cost review</summary>
          {requests
            .filter((l) => l.status === "SHORT" || l.status === "NOT_MADE")
            .map((l) => (
              <p key={l.id}>
                Shortage · {l.recipe.name} → {l.destinationVenue.name}:{" "}
                {l.notes}
              </p>
            ))}
          {batches.flatMap((b) =>
            (readCost(b.costingSnapshot)?.productionSupplies ?? []).map(
              (s, i) => (
                <p key={`${b.id}-${i}`} className="text-sm">
                  Production {b.recipe.name} · supplied by{" "}
                  {venues.find((v) => v.id === s.venueId)?.name}:{" "}
                  {items.find((v) => v.id === s.itemId)?.name ?? s.itemId} ·{" "}
                  {s.quantity} {s.unit} · {s.note} · Shared/retained supply
                  facts
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
        </details>
        {!closed && manager && (
          <div className="mt-4">
            <CloseDayForm date={day} operationKey={randomUUID()} />
          </div>
        )}
      </Card>
      <Card className="mb-5 p-5">
        <h2 className="mb-3 text-lg font-semibold">Accounting export</h2>
        <p className="mb-3 text-sm">
          Review venue totals and any missing costs before exporting.
        </p>
        <LinkButton href={`/prep-orders/report?from=${day}&to=${day}`}>
          Review & export accounting
        </LinkButton>
      </Card>
      <details className="rounded border p-5">
        <summary>Returns, waste & corrections</summary>
        <h2 className="sr-only">Exceptions: returns, waste, corrections</h2>
        <p className="my-2 text-sm">
          Open a delivery above or in Accounting to record a linked return or
          correction.
        </p>
        {waste.map((w) => (
          <p key={w.id} className="text-sm">
            {w.quantity} {w.unit} · {w.reason} · {w.stableId}
          </p>
        ))}
      </details>
    </div>
  );
}
