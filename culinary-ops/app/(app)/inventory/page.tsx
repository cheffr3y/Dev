import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { money, num } from "@/lib/costing";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { updateInventory, removeInventoryItem } from "./actions";
import { AddItemForm } from "./AddItemForm";

export default async function InventoryPage() {
  const user = await requireUser();
  const { active } = await getActiveVenue(user.homeVenueId);

  if (!active) {
    return (
      <div>
        <PageHeader title="Inventory" />
        <EmptyState title="No venue selected" hint="Create a venue first." />
      </div>
    );
  }

  const [stock, allItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { venueId: active.id },
      include: { item: true },
      orderBy: [{ item: { category: "asc" } }, { item: { name: "asc" } }],
    }),
    prisma.item.findMany({ orderBy: { name: "asc" } }),
  ]);

  const stockedItemIds = new Set(stock.map((s) => s.itemId));
  const availableItems = allItems.filter((i) => !stockedItemIds.has(i.id));

  const lowCount = stock.filter((s) => s.quantity < s.par).length;
  const totalValue = stock.reduce((sum, s) => sum + s.quantity * s.item.unitCost, 0);

  return (
    <div>
      <PageHeader title="Inventory" subtitle={`Current stock at ${active.name}.`} />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Items Tracked" value={stock.length} />
        <StatCard label="Below Par" value={lowCount} sub={lowCount ? "needs ordering" : "all stocked"} />
        <StatCard label="Inventory Value" value={money(totalValue)} />
      </div>

      <details className="mb-5">
        <summary className="cursor-pointer text-sm font-medium text-blue-600">+ Add item to this venue</summary>
        <Card className="mt-2 p-4">
          <AddItemForm
            venueId={active.id}
            items={availableItems.map((it) => ({ id: it.id, name: it.name, unit: it.unit }))}
          />
        </Card>
      </details>

      {stock.length === 0 ? (
        <EmptyState title="No items tracked here yet" hint="Add items from the catalog above." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">On Hand / Par</th>
                <th className="px-4 py-2.5 text-right font-medium">Need</th>
                <th className="px-4 py-2.5 text-right font-medium">Value</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {stock.map((s) => {
                const low = s.quantity < s.par;
                const need = Math.max(0, s.par - s.quantity);
                return (
                  <tr key={s.id} className={low ? "bg-red-50/40" : undefined}>
                    <td className="px-4 py-2 font-medium text-zinc-800">
                      {s.item.name}
                      {low && (
                        <span className="ml-2">
                          <Badge color="red">low</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{s.item.category}</td>
                    <td className="px-4 py-2">
                      <form action={updateInventory} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          name="quantity"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={num(s.quantity)}
                          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <span className="text-zinc-400">/</span>
                        <input
                          name="par"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={num(s.par)}
                          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <span className="text-xs text-zinc-400">{s.unit}</span>
                        <button className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100">
                          save
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-700">
                      {need > 0 ? `${num(need)} ${s.unit}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600">{money(s.quantity * s.item.unitCost)}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={removeInventoryItem}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-red-500 hover:underline">remove</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
