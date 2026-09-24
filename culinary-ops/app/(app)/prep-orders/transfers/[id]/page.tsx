import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { readCost } from "@/lib/prep-costing";
import { chicagoToday } from "@/lib/prep-dates";
import { PageHeader, Card } from "@/components/ui";
import { CompletionForm, ReturnForm, EntryForm } from "../../EntryForms";
export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("MANAGER");
  const { id } = await params;
  const [t, recipes, venues, items] = await Promise.all([
    prisma.stockTransfer.findFirstOrThrow({
      where: { OR: [{ id }, { stableId: id }] },
      include: {
        venue: true,
        recipe: true,
        batch: { include: { recipe: true } },
        amendments: { orderBy: { revision: "asc" } },
      },
    }),
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
  ]);
  const s = readCost(
      t.amendments.filter((a) => a.kind === "COST_COMPLETION").at(-1)
        ?.costingSnapshot ?? t.costingSnapshot,
    ),
    date = chicagoToday();
  return (
    <div>
      <PageHeader
        title={`${t.recipe?.name ?? t.batch?.recipe.name} → ${t.venue.name}`}
        subtitle={`${t.quantity} ${t.unit} · ${t.transferDate.toISOString().slice(0, 10)} · ${t.stableId}`}
      />
      <Card className="mb-5 p-5">
        <p>
          Original record preserved. Amendments use their own dates and authors.
        </p>
        <p>
          {s?.charge.total == null && s
            ? "Pending: " + s.charge.issues.join("; ")
            : `Captured charge: $${((s?.charge.total ?? Math.round((t.totalTransferCost ?? 0) * 100)) / 100).toFixed(2)}`}
        </p>
      </Card>
      {s && s.charge.issues.length > 0 && (
        <Card className="mb-5 p-5">
          <h2 className="mb-4 font-semibold">Complete missing costs</h2>
          <CompletionForm
            id={t.id}
            date={date}
            operationKey={randomUUID()}
            issues={s.charge.issues}
          />
        </Card>
      )}
      <Card className="mb-5 p-5">
        <details>
          <summary className="font-semibold">Record return</summary>
          <div className="mt-4">
            <ReturnForm
              id={t.id}
              date={date}
              operationKey={randomUUID()}
              unit={t.unit}
            />
          </div>
        </details>
      </Card>
      <Card className="mb-5 p-5">
        <details>
          <summary className="font-semibold">
            Correct quantity, venue or costs
          </summary>
          <p className="my-3 text-sm">
            Reverses the original charge and creates a replacement delivery on
            the adjustment date. Enter the complete corrected, unreturned
            delivery; use zero to cancel it. Prior return credits and waste are
            preserved. Replacement costing is a newly captured recipe estimate.
          </p>
          <EntryForm
            mode="PICKUP"
            correction={{ transferId: t.id }}
            date={date}
            operationKey={randomUUID()}
            recipes={recipes}
            venues={venues}
            items={items}
          />
        </details>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Amendment history</h2>
        {t.amendments.map((a) => (
          <p key={a.id} className="my-2 text-sm">
            {a.adjustmentDate.toISOString().slice(0, 10)} · {a.kind} ·{" "}
            {a.reason} · Author {a.authorId} · {a.id}
          </p>
        ))}
      </Card>
    </div>
  );
}
