import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues, getActiveVenue } from "@/lib/venue";
import { money } from "@/lib/costing";
import { unitLabel, UNIT_OPTIONS } from "@/lib/units";
import { Button, Card, CardHeader, EmptyState, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { addPrepLine, updatePrepOrder, deletePrepOrder, generatePacket } from "../actions";
import { isOpenStatus } from "@/lib/prep";
import { PrepLineCard } from "../PrepLineCard";
import { RecipePicker } from "@/components/RecipePicker";

export default async function PrepOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canManage = hasRole(user, "MANAGER");

  const [order, recipes, venues, { active }] = await Promise.all([
    prisma.prepOrder.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { name: true } },
        lines: {
          include: {
            recipe: { select: { name: true, prodCode: true, yieldUnit: true } },
            destinationVenue: { select: { name: true, code: true } },
            madeBy: { select: { name: true } },
            enteredBy: { select: { name: true } },
          },
          orderBy: [{ recipe: { name: "asc" } }, { destinationVenue: { name: "asc" } }],
        },
      },
    }),
    prisma.recipe.findMany({ select: { id: true, name: true, prodCode: true, yieldUnit: true }, orderBy: { name: "asc" } }),
    getVenues(),
    getActiveVenue(user.homeVenueId),
  ]);

  if (!order) notFound();

  const lines = order.lines;
  const hasRequested = lines.some((l) => l.status === "REQUESTED");
  const hasPrinted = lines.some((l) => l.status !== "REQUESTED");
  const open = lines.filter((l) => isOpenStatus(l.status)).length;
  const totalAllocated = lines.reduce((s, l) => s + (l.allocatedCost ?? 0), 0);

  // Count destinations per recipe so split batches can be flagged in the list.
  const recipeCount = new Map<string, number>();
  for (const l of lines) recipeCount.set(l.recipeId, (recipeCount.get(l.recipeId) ?? 0) + 1);

  const dateValue = order.forDate.toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/prep-orders" className="text-sm text-blue-600 hover:underline">
          ← Prep orders
        </Link>
        <div className="flex items-center gap-2">
          {hasPrinted && (
            <LinkButton href={`/prep-orders/${order.id}/packet`} variant="secondary">
              View cook packet
            </LinkButton>
          )}
          {hasPrinted && (
            <LinkButton href={`/prep-orders/${order.id}/back-entry`} variant="gold">
              Back-entry →
            </LinkButton>
          )}
        </div>
      </div>

      <PageHeader
        title={order.forDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
        subtitle={`Prep order · submitted by ${order.submittedBy.name}`}
        action={
          canManage && hasRequested ? (
            <form action={generatePacket}>
              <input type="hidden" name="id" value={order.id} />
              <Button type="submit" variant="primary">
                Generate cook packet & assign lots
              </Button>
            </form>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Lines" value={String(lines.length)} />
        <Stat label="Open" value={String(open)} sub={open === 0 && lines.length > 0 ? "all resolved" : undefined} />
        <Stat
          label="Recipes"
          value={String(recipeCount.size)}
          sub={[...recipeCount.values()].some((c) => c > 1) ? "incl. split batches" : undefined}
        />
        <Stat label="Est. Mise cost" value={money(totalAllocated)} sub="frozen at production" />
      </div>

      {order.notes && (
        <Card className="mt-4 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">📋 {order.notes}</p>
        </Card>
      )}

      {/* Requested recipes */}
      <div className="mt-8">
        <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">Requested Recipes</h2>
        {lines.length === 0 ? (
          <EmptyState title="No recipes yet" hint="Add one below." />
        ) : (
          <div className="space-y-3">
            {lines.map((l) => (
              <PrepLineCard
                key={l.id}
                orderId={order.id}
                canManage={canManage}
                venues={venues.map((v) => ({ id: v.id, name: v.name }))}
                line={{
                  id: l.id,
                  recipeId: l.recipeId,
                  recipeName: l.recipe.name,
                  prodCode: l.recipe.prodCode,
                  requestedQty: l.requestedQty,
                  requestedUnit: l.requestedUnit,
                  destinationVenueId: l.destinationVenueId,
                  destinationVenueName: l.destinationVenue.name,
                  status: l.status,
                  lot: l.lot,
                  actualQty: l.actualQty,
                  actualUnit: l.actualUnit,
                  split: (recipeCount.get(l.recipeId) ?? 0) > 1,
                }}
              />
            ))}
          </div>
        )}

        {totalAllocated > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-hairline bg-zinc-50 px-4 py-3 text-sm">
            <span className="font-medium text-zinc-700">Estimated Mise cost (frozen)</span>
            <span className="font-semibold text-zinc-900">{money(totalAllocated)}</span>
          </div>
        )}
      </div>

      {/* Add new item */}
      {canManage && (
        <div className="no-print mt-6 rounded-xl border border-[#dcd3c0] bg-[#e9e3d4] p-5">
          <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">Add New Item</h3>
          <form action={addPrepLine} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="prepOrderId" value={order.id} />
            <div className="min-w-[220px] flex-1">
              <Field label="Recipe search">
                <RecipePicker recipes={recipes} />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Destination venue">
                <Select name="destinationVenueId" required defaultValue={active?.id ?? venues[0]?.id}>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-24">
              <Field label="Qty">
                <Input name="requestedQty" type="number" step="0.01" min="0.01" defaultValue={1} required />
              </Field>
            </div>
            <div className="w-28">
              <Field label="Unit">
                <Select name="requestedUnit" defaultValue="quart">
                  {UNIT_OPTIONS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.units.map((u) => (
                        <option key={u} value={u}>
                          {unitLabel(u)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit">Add</Button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            To split a batch across venues, add the same recipe again with a different destination — combined on the
            packet, costed separately.
          </p>
        </div>
      )}


      {/* Edit / delete order */}
      {canManage && (
        <Card className="no-print mt-6">
          <CardHeader>Order details</CardHeader>
          <form action={updatePrepOrder} className="space-y-3 p-4">
            <input type="hidden" name="id" value={order.id} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Production date">
                <Input name="forDate" type="date" required defaultValue={dateValue} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" defaultValue={order.notes ?? ""} />
            </Field>
            <Button type="submit">Save changes</Button>
          </form>
          <div className="border-t border-zinc-100 p-4">
            <form action={deletePrepOrder}>
              <input type="hidden" name="id" value={order.id} />
              <Button type="submit" variant="danger">
                Delete prep order
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-canvas px-5 py-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-zinc-500">{label}</p>
      <p className="mt-3 font-display text-4xl leading-none tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-2 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}
