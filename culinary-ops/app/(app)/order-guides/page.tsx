import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { createOrderGuide } from "./actions";

export default async function OrderGuidesPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const { active } = await getActiveVenue(user.homeVenueId);

  if (!active) {
    return (
      <div>
        <PageHeader title="Order Guides" />
        <EmptyState title="No venue selected" hint="Create a venue first." />
      </div>
    );
  }

  const [guides, vendors] = await Promise.all([
    prisma.orderGuide.findMany({
      where: { venueId: active.id },
      include: { vendor: true, _count: { select: { lines: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Order Guides" subtitle={`Vendor order sheets for ${active.name}.`} />

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ New order guide</summary>
          <Card className="mt-2 p-4">
            <form action={createOrderGuide} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="venueId" value={active.id} />
              <div className="min-w-[200px] flex-1">
                <Field label="Name">
                  <Input name="name" required placeholder="Weekly Produce Order" />
                </Field>
              </div>
              <div className="min-w-[160px]">
                <Field label="Vendor">
                  <Select name="vendorId" defaultValue="">
                    <option value="">— none —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit">Create →</Button>
            </form>
          </Card>
        </details>
      )}

      {guides.length === 0 ? (
        <EmptyState title="No order guides for this venue" hint="Create one to start building order sheets." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => (
            <Link key={g.id} href={`/order-guides/${g.id}`}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-zinc-900">{g.name}</h3>
                  <Badge color="blue">{g._count.lines} items</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-500">{g.vendor?.name ?? "No vendor"}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
