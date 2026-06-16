import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues, getActiveVenue } from "@/lib/venue";
import { money, num } from "@/lib/costing";
import { unitLabel, UNIT_OPTIONS } from "@/lib/units";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import {
  addPrepLine,
  updatePrepLine,
  removePrepLine,
  updatePrepOrder,
  deletePrepOrder,
  generatePacket,
} from "../actions";
import { isOpenStatus, prepStatusLabel, PREP_STATUS_COLOR, type PrepStatus } from "@/lib/prep";

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

      {/* Lines */}
      <Card className="mt-6">
        <CardHeader>Requested Recipes</CardHeader>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
            <tr>
              <th className="px-4 py-2 font-medium">Recipe</th>
              <th className="px-4 py-2 font-medium">Destination</th>
              <th className="px-4 py-2 text-right font-medium">Requested</th>
              <th className="px-4 py-2 text-right font-medium">Actual</th>
              <th className="px-4 py-2 font-medium">Lot</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {canManage && <th className="px-4 py-2 no-print"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-6 text-center text-zinc-400">
                  No recipes yet. Add one below.
                </td>
              </tr>
            )}
            {lines.map((l) => {
              const split = (recipeCount.get(l.recipeId) ?? 0) > 1;
              const editable = canManage && l.status === "REQUESTED";
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-zinc-800">
                    <Link href={`/recipes/${l.recipeId}`} className="font-medium hover:underline">
                      {l.recipe.name}
                    </Link>{" "}
                    <span className="font-mono text-[11px] text-zinc-400">{l.recipe.prodCode}</span>
                    {split && (
                      <span className="ml-2 align-middle">
                        <Badge color="blue">split</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">{l.destinationVenue.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-700">
                    {num(l.requestedQty)} {unitLabel(l.requestedUnit)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-700">
                    {l.actualQty != null ? `${num(l.actualQty)} ${unitLabel(l.actualUnit ?? "")}` : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-[13px] text-zinc-800">{l.lot ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge color={PREP_STATUS_COLOR[l.status as PrepStatus]}>{prepStatusLabel(l.status)}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right no-print">
                      {editable ? (
                        <form action={removePrepLine}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="prepOrderId" value={order.id} />
                          <button className="text-xs text-red-500 hover:underline">remove</button>
                        </form>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {totalAllocated > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                <td className="px-4 py-2 text-zinc-700" colSpan={canManage ? 6 : 5}>
                  Estimated Mise cost (frozen)
                </td>
                <td className="px-4 py-2 text-right text-zinc-900">{money(totalAllocated)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Inline edit for un-printed lines */}
        {canManage && lines.some((l) => l.status === "REQUESTED") && (
          <div className="border-t border-zinc-100 px-4 py-3 no-print">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Adjust requested lines</p>
            <div className="space-y-2">
              {lines
                .filter((l) => l.status === "REQUESTED")
                .map((l) => (
                  <form key={l.id} action={updatePrepLine} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="prepOrderId" value={order.id} />
                    <span className="min-w-[140px] flex-1 truncate text-sm text-zinc-700">{l.recipe.name}</span>
                    <Select name="destinationVenueId" defaultValue={l.destinationVenueId} className="w-40">
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                    <Input name="requestedQty" type="number" step="0.01" min="0.01" defaultValue={num(l.requestedQty)} className="w-24" />
                    <Select name="requestedUnit" defaultValue={l.requestedUnit} className="w-28">
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
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                  </form>
                ))}
            </div>
          </div>
        )}

        {/* Add line */}
        {canManage && (
          <div className="border-t border-zinc-100 p-4 no-print">
            <form action={addPrepLine} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="prepOrderId" value={order.id} />
              <div className="min-w-[200px] flex-1">
                <Field label="Add recipe">
                  <Select name="recipeId" required defaultValue="">
                    <option value="" disabled>
                      Select recipe…
                    </option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.prodCode})
                      </option>
                    ))}
                  </Select>
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
            <p className="mt-2 text-xs text-zinc-400">
              To split a batch across venues, add the same recipe again with a different destination — combined on the
              packet, costed separately.
            </p>
          </div>
        )}
      </Card>

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
    <div className="rounded-lg bg-stone p-5">
      <p className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">{label}</p>
      <p className="mt-3 font-display text-3xl leading-none tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-2 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
