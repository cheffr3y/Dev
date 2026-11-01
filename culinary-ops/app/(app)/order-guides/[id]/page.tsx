import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { OrderGuideGrid } from "@/components/OrderGuideGrid";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { deleteOrderGuide } from "../actions";
import { AddItemForm } from "../AddItemForm";

export default async function OrderGuideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const guide = await prisma.orderGuide.findUnique({
    where: { id },
    include: {
      venue: true,
      vendor: true,
      lines: { include: { item: true }, orderBy: [{ sortOrder: "asc" }, { item: { name: "asc" } }] },
    },
  });
  if (!guide) notFound();

  const [allItems, vendors] = await Promise.all([prisma.item.findMany({ orderBy: { name: "asc" } }), prisma.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const lineItemIds = new Set(guide.lines.map((l) => l.itemId));
  const availableItems = allItems.filter((i) => !lineItemIds.has(i.id));

  // Current on-hand for this venue, to compute what to order.
  const onHand = await prisma.inventoryItem.findMany({
    where: { venueId: guide.venueId, itemId: { in: guide.lines.map((l) => l.itemId) } },
  });
  const onHandMap = new Map(onHand.map(stock => [stock.itemId, { quantity: stock.quantity, unit: stock.unit }]));
  const rows = guide.lines.map(line => ({ id: line.id, par: line.par, unit: line.unit, item: line.item, stock: onHandMap.get(line.itemId) ?? null }));

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/order-guides" className="text-sm text-blue-600 hover:underline">
          ← Order Guides
        </Link>
        <PrintButton label="Print order sheet" />
      </div>

      <PageHeader
        title={guide.name}
        subtitle={`${guide.venue.name}${guide.vendor ? ` · ${guide.vendor.name}` : ""}`}
      />

      <Card className="overflow-hidden">
        <CardHeader>
          Order sheet — generated {new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}
        </CardHeader>
        <OrderGuideGrid key={JSON.stringify(rows)} rows={rows} vendors={vendors} guideId={id} canEdit={canEdit} />
      </Card>

      {canEdit && (
        <>
          <Card className="no-print mt-4 p-4">
            <AddItemForm
              orderGuideId={guide.id}
              items={availableItems.map((it) => ({ id: it.id, name: it.name, unit: it.unit }))}
            />
          </Card>
          <form action={deleteOrderGuide} className="no-print mt-3">
            <input type="hidden" name="id" value={guide.id} />
            <Button type="submit" variant="danger">
              Delete order guide
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
