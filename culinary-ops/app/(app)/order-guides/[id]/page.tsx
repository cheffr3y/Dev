import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { updateOrderGuideLine, removeOrderGuideLine, deleteOrderGuide } from "../actions";
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

  const allItems = await prisma.item.findMany({ orderBy: { name: "asc" } });
  const lineItemIds = new Set(guide.lines.map((l) => l.itemId));
  const availableItems = allItems.filter((i) => !lineItemIds.has(i.id));

  // Current on-hand for this venue, to compute what to order.
  const onHand = await prisma.inventoryItem.findMany({
    where: { venueId: guide.venueId, itemId: { in: guide.lines.map((l) => l.itemId) } },
  });
  const onHandMap = new Map(onHand.map((s) => [s.itemId, s.quantity]));

  const rows = guide.lines.map((l) => {
    const have = onHandMap.get(l.itemId) ?? 0;
    const need = Math.max(0, l.par - have);
    return { line: l, have, need, estCost: need * l.item.unitCost };
  });
  const estTotal = rows.reduce((sum, r) => sum + r.estCost, 0);

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
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 text-right font-medium">Par</th>
              <th className="px-4 py-2.5 text-right font-medium">On Hand</th>
              <th className="px-4 py-2.5 text-right font-medium">Order</th>
              <th className="px-4 py-2.5 text-right font-medium">Est. Cost</th>
              {canEdit && <th className="px-4 py-2.5 no-print"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-zinc-400">
                  No items on this guide yet.
                </td>
              </tr>
            )}
            {rows.map(({ line, have, need, estCost }) => (
              <tr key={line.id} className={need > 0 ? "bg-amber-50/40" : undefined}>
                <td className="px-4 py-2 font-medium text-zinc-800">
                  {line.item.name}
                  {line.item.packSize && <span className="ml-1 text-xs text-zinc-400">({line.item.packSize})</span>}
                </td>
                <td className="px-4 py-2 text-right text-zinc-600">
                  {canEdit ? (
                    <form action={updateOrderGuideLine} className="inline-flex items-center justify-end gap-1">
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="orderGuideId" value={guide.id} />
                      <input
                        name="par"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={num(line.par)}
                        className="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-right text-sm"
                      />
                      <button className="no-print rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">
                        ✓
                      </button>
                    </form>
                  ) : (
                    num(line.par)
                  )}{" "}
                  <span className="text-xs text-zinc-400">{line.unit}</span>
                </td>
                <td className="px-4 py-2 text-right text-zinc-600">{num(have)}</td>
                <td className="px-4 py-2 text-right font-semibold text-zinc-900">
                  {need > 0 ? `${num(need)} ${line.unit}` : "—"}
                </td>
                <td className="px-4 py-2 text-right text-zinc-600">{need > 0 ? money(estCost) : "—"}</td>
                {canEdit && (
                  <td className="px-4 py-2 text-right no-print">
                    <form action={removeOrderGuideLine}>
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="orderGuideId" value={guide.id} />
                      <button className="text-xs text-red-500 hover:underline">remove</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
              <td className="px-4 py-2 text-zinc-700" colSpan={4}>
                Estimated order total
              </td>
              <td className="px-4 py-2 text-right text-zinc-900">{money(estTotal)}</td>
              {canEdit && <td className="no-print"></td>}
            </tr>
          </tfoot>
        </table>
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
