import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money } from "@/lib/costing";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createItem, updateItem, deleteItem } from "./actions";

const CATEGORIES = ["Produce", "Protein", "Dairy", "Dry Goods", "Bakery", "Beverage", "Other"];

function ItemFields({
  vendors,
  item,
}: {
  vendors: { id: string; name: string }[];
  item?: {
    name: string;
    category: string;
    unit: string;
    packSize: string | null;
    unitCost: number;
    sku: string | null;
    vendorId: string | null;
  };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Field label="Name">
        <Input name="name" required defaultValue={item?.name} placeholder="Roma Tomatoes" />
      </Field>
      <Field label="Category">
        <Select name="category" defaultValue={item?.category ?? "Other"}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Vendor">
        <Select name="vendorId" defaultValue={item?.vendorId ?? ""}>
          <option value="">— none —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Unit">
        <Input name="unit" defaultValue={item?.unit ?? "each"} placeholder="lb, case, each" />
      </Field>
      <Field label="Unit Cost ($)">
        <Input name="unitCost" type="number" step="0.01" min="0" defaultValue={item?.unitCost ?? 0} />
      </Field>
      <Field label="Pack Size">
        <Input name="packSize" defaultValue={item?.packSize ?? ""} placeholder="6 x #10 can" />
      </Field>
    </div>
  );
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const { category } = await searchParams;

  const [items, vendors] = await Promise.all([
    prisma.item.findMany({
      where: category ? { category } : undefined,
      include: { vendor: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle="Master list of purchasable items, costs, and vendors."
      />

      {/* Category filter */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a
          href="/items"
          className={`rounded-full px-3 py-1 ${!category ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 border border-zinc-200"}`}
        >
          All
        </a>
        {CATEGORIES.map((c) => (
          <a
            key={c}
            href={`/items?category=${encodeURIComponent(c)}`}
            className={`rounded-full px-3 py-1 ${category === c ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 border border-zinc-200"}`}
          >
            {c}
          </a>
        ))}
      </div>

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ Add item</summary>
          <Card className="mt-2 p-4">
            <form action={createItem} className="space-y-3">
              <ItemFields vendors={vendors} />
              <Button type="submit">Add item</Button>
            </form>
          </Card>
        </details>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Unit</th>
              <th className="px-4 py-2.5 text-right font-medium">Unit Cost</th>
              {canEdit && <th className="px-4 py-2.5"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-zinc-400">
                  No items yet.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="px-4 py-2.5 font-medium text-zinc-800">
                  {item.name}
                  {item.packSize && <span className="ml-1 text-xs text-zinc-400">({item.packSize})</span>}
                  {canEdit && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-blue-600">edit</summary>
                      <form action={updateItem} className="mt-2 space-y-3 rounded-lg bg-zinc-50 p-3">
                        <input type="hidden" name="id" value={item.id} />
                        <ItemFields
                          vendors={vendors}
                          item={{
                            name: item.name,
                            category: item.category,
                            unit: item.unit,
                            packSize: item.packSize,
                            unitCost: item.unitCost,
                            sku: item.sku,
                            vendorId: item.vendorId,
                          }}
                        />
                        <div className="flex gap-2">
                          <Button type="submit" variant="secondary">Save</Button>
                        </div>
                      </form>
                    </details>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Badge>{item.category}</Badge>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{item.vendor?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{item.unit}</td>
                <td className="px-4 py-2.5 text-right text-zinc-800">{money(item.unitCost)}</td>
                {canEdit && (
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="text-xs text-red-500 hover:underline">delete</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
