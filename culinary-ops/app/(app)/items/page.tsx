import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, priceFreshness, PRICE_STALE_DAYS } from "@/lib/costing";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createItem, updateItem, deleteItem } from "./actions";

// Purchasing categories, ordered roughly walk-in → dry storage → non-food.
// Free-form in the DB, so this is just the picker/filter list; existing values
// are preserved. Categories also group the pull list & order guide.
const CATEGORIES = [
  "Produce",
  "Protein",
  "Poultry",
  "Seafood",
  "Dairy",
  "Frozen",
  "Bakery",
  "Dry Goods",
  "Grains & Pasta",
  "Canned & Jarred",
  "Oils & Vinegars",
  "Spices & Seasonings",
  "Condiments & Sauces",
  "Baking",
  "Beverage",
  "Paper & Disposables",
  "Cleaning & Chemicals",
  "Other",
];

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
    gcode: string | null;
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
      <Field label="Item #">
        <Input name="sku" defaultValue={item?.sku ?? ""} placeholder="Vendor item / SKU #" />
      </Field>
      <Field label="Acumatica GCODE">
        <Input name="gcode" defaultValue={item?.gcode ?? ""} placeholder="GCODE" />
      </Field>
    </div>
  );
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; flag?: string }>;
}) {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const { category, flag } = await searchParams;

  const [items, vendors] = await Promise.all([
    // Load the whole catalog so price-coverage counts are global, then filter
    // in memory — the master list is small and this keeps the counts honest.
    prisma.item.findMany({ include: { vendor: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);

  const now = new Date();
  const withFreshness = items.map((item) => ({ item, freshness: priceFreshness(item.priceUpdatedAt, item.unitCost, now) }));
  const missingCount = withFreshness.filter((x) => x.freshness.unpriced).length;
  const staleCount = withFreshness.filter((x) => x.freshness.stale).length;

  const visible = withFreshness.filter(({ item, freshness }) => {
    if (category && item.category !== category) return false;
    if (flag === "missing" && !freshness.unpriced) return false;
    if (flag === "stale" && !freshness.stale) return false;
    return true;
  });

  // Build a catalog href preserving the other active filter.
  const hrefWith = (next: { category?: string | null; flag?: string | null }) => {
    const params = new URLSearchParams();
    const cat = next.category === undefined ? category : next.category;
    const fl = next.flag === undefined ? flag : next.flag;
    if (cat) params.set("category", cat);
    if (fl) params.set("flag", fl);
    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  };

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle="Master list of purchasable items, costs, and vendors."
      />

      {/* Price coverage — theo food cost is only as honest as these prices. */}
      {(missingCount > 0 || staleCount > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="font-medium">Price coverage</span>
          {missingCount > 0 && (
            <a href={hrefWith({ flag: flag === "missing" ? null : "missing" })} className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-white">
              {missingCount} missing a price →
            </a>
          )}
          {staleCount > 0 && (
            <a href={hrefWith({ flag: flag === "stale" ? null : "stale" })} className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-white">
              {staleCount} stale (&gt;{PRICE_STALE_DAYS}d) →
            </a>
          )}
          {flag && (
            <a href={hrefWith({ flag: null })} className="text-xs text-amber-700 underline">
              clear filter
            </a>
          )}
        </div>
      )}

      {/* Category filter */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a
          href={hrefWith({ category: null })}
          className={`rounded-full px-3 py-1 ${!category ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 border border-zinc-200"}`}
        >
          All
        </a>
        {CATEGORIES.map((c) => (
          <a
            key={c}
            href={hrefWith({ category: c })}
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
          <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Item #</th>
              <th className="px-4 py-2.5 font-medium">GCODE</th>
              <th className="px-4 py-2.5 font-medium">Unit</th>
              <th className="px-4 py-2.5 text-right font-medium">Unit Cost</th>
              <th className="px-4 py-2.5 font-medium">Price age</th>
              {canEdit && <th className="px-4 py-2.5"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="px-4 py-8 text-center text-zinc-400">
                  {items.length === 0 ? "No items yet." : "No items match your filters."}
                </td>
              </tr>
            )}
            {visible.map(({ item, freshness }) => (
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
                            gcode: item.gcode,
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
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{item.sku ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-700">{item.gcode ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{item.unit}</td>
                <td className={`px-4 py-2.5 text-right ${freshness.unpriced ? "text-red-600" : "text-zinc-800"}`}>
                  {freshness.unpriced ? "—" : money(item.unitCost)}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {freshness.unpriced ? (
                    <Badge color="red">no price</Badge>
                  ) : freshness.stale ? (
                    <Badge color="amber">{freshness.label}</Badge>
                  ) : (
                    <span className="text-zinc-500">{freshness.label}</span>
                  )}
                </td>
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
