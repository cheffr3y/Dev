import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { createVendor, updateVendor, deleteVendor } from "./actions";

function VendorFields({
  vendor,
}: {
  vendor?: { name: string; contact: string | null; phone: string | null; email: string | null; notes: string | null };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="Name">
        <Input name="name" required defaultValue={vendor?.name} placeholder="Sysco" />
      </Field>
      <Field label="Contact">
        <Input name="contact" defaultValue={vendor?.contact ?? ""} placeholder="Sales rep" />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={vendor?.phone ?? ""} placeholder="555-0100" />
      </Field>
      <Field label="Email">
        <Input name="email" defaultValue={vendor?.email ?? ""} placeholder="orders@vendor.com" />
      </Field>
      <div className="col-span-2 md:col-span-4">
        <Field label="Notes">
          <Textarea name="notes" defaultValue={vendor?.notes ?? ""} placeholder="Delivery days, minimums…" />
        </Field>
      </div>
    </div>
  );
}

export default async function VendorsPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { items: true, orderGuides: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Suppliers and their contact details." />

      {canEdit && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">+ Add vendor</summary>
          <Card className="mt-2 p-4">
            <form action={createVendor} className="space-y-3">
              <VendorFields />
              <Button type="submit">Add vendor</Button>
            </form>
          </Card>
        </details>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {vendors.length === 0 && <p className="text-sm text-zinc-400">No vendors yet.</p>}
        {vendors.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-zinc-900">{v.name}</h3>
                <p className="text-sm text-zinc-500">{v.contact ?? "—"}</p>
              </div>
              <div className="text-right text-xs text-zinc-400">
                {v._count.items} items · {v._count.orderGuides} guides
              </div>
            </div>
            <dl className="mt-3 space-y-1 text-sm text-zinc-600">
              {v.phone && <div>📞 {v.phone}</div>}
              {v.email && <div>✉️ {v.email}</div>}
              {v.notes && <div className="text-zinc-500">{v.notes}</div>}
            </dl>
            {canEdit && (
              <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3">
                <details className="flex-1">
                  <summary className="cursor-pointer text-xs text-blue-600">edit</summary>
                  <form action={updateVendor} className="mt-2 space-y-3">
                    <input type="hidden" name="id" value={v.id} />
                    <VendorFields
                      vendor={{ name: v.name, contact: v.contact, phone: v.phone, email: v.email, notes: v.notes }}
                    />
                    <Button type="submit" variant="secondary">Save</Button>
                  </form>
                </details>
                <form action={deleteVendor}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className="text-xs text-red-500 hover:underline">delete</button>
                </form>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
