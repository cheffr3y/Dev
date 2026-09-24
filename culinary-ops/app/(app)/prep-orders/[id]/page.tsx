import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/session";
import { requirePrepUser } from "@/lib/prep-session";
import { canOrderForVenue } from "@/lib/prep-access";
import { getVenues, getActiveVenue } from "@/lib/venue";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { updatePrepOrder, deletePrepOrder, generatePacket } from "../actions";
import { isOpenStatus } from "@/lib/prep";
import { PrepLineCard } from "../PrepLineCard";
import { AddLineForm } from "../AddLineForm";

export default async function PrepOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePrepUser();

  const [order, recipes, venues, { active }] = await Promise.all([
    prisma.prepOrder.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { name: true } },
        destinationVenue: { select: { name: true, code: true } },
        lines: {
          include: {
            recipe: { select: { name: true, prodCode: true, yieldUnit: true } },
            destinationVenue: { select: { name: true, code: true } },
            madeBy: { select: { name: true } },
            enteredBy: { select: { name: true } },
          },
          orderBy: [
            { recipe: { name: "asc" } },
            { destinationVenue: { name: "asc" } },
          ],
        },
      },
    }),
    prisma.recipe.findMany({
      select: {
        id: true,
        name: true,
        prodCode: true,
        yieldQty: true,
        yieldUnit: true,
      },
      orderBy: { name: "asc" },
    }),
    getVenues(),
    getActiveVenue(user.homeVenueId),
  ]);

  if (!order) notFound();
  const canManage =
    canOrderForVenue(user, order.destinationVenueId) &&
    order.lines.every((l) => l.status === "REQUESTED") &&
    !(
      await prisma.productionCloseout.findUnique({
        where: { businessDate: order.forDate },
      })
    )?.finalizedAt;

  const lines = order.lines;
  const hasRequested = lines.some((l) => l.status === "REQUESTED");
  const hasPrinted = lines.some((l) => l.status !== "REQUESTED");
  const open = lines.filter((l) => isOpenStatus(l.status)).length;

  // Count destinations per recipe so split batches can be flagged in the list.
  const recipeCount = new Map<string, number>();
  for (const l of lines)
    recipeCount.set(l.recipeId, (recipeCount.get(l.recipeId) ?? 0) + 1);

  const dateValue = order.forDate.toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/prep-orders"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Prep orders
        </Link>
        <div className="flex items-center gap-2">
          {hasPrinted && (
            <LinkButton
              href={`/prep-orders/${order.id}/packet`}
              variant="secondary"
            >
              View cook packet
            </LinkButton>
          )}
          {hasPrinted && (
            <LinkButton
              href={`/prep-orders/${order.id}/shopping-list`}
              variant="secondary"
            >
              Shopping list
            </LinkButton>
          )}
          {user.role === "ADMIN" && (
            <LinkButton
              href={`/prep-orders/closeout?date=${order.forDate.toISOString().slice(0, 10)}`}
              variant="gold"
            >
              Open daily worksheet →
            </LinkButton>
          )}
        </div>
      </div>

      <PageHeader
        title={order.forDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })}
        subtitle={`Prep order · submitted by ${order.submittedBy.name}${
          order.destinationVenue ? ` · → ${order.destinationVenue.name}` : ""
        }`}
        action={
          hasRole(user, "MANAGER") && hasRequested ? (
            <form action={generatePacket}>
              <input type="hidden" name="id" value={order.id} />
              <Button type="submit" variant="primary">
                Print prep sheet
              </Button>
            </form>
          ) : undefined
        }
      />

      {order.notes && (
        <Card className="mb-6 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">📋 {order.notes}</p>
        </Card>
      )}

      {/* Two-column workspace: entry + order settings on the left, live summary
          and the growing recipe list on the right. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column — entry + order settings */}
        {canManage && (
          <div className="no-print space-y-6">
            <div className="rounded-xl border border-[#dcd3c0] bg-[#e9e3d4] p-5">
              <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">
                Add New Item
              </h3>
              {order.destinationVenueId ? (
                <AddLineForm orderId={order.id} recipes={recipes} />
              ) : (
                <EmptyState
                  title="Choose a destination venue first"
                  hint="Set the venue in Order Details — every recipe in this order ships there."
                />
              )}
            </div>

            <Card>
              <CardHeader>Order details</CardHeader>
              <form action={updatePrepOrder} className="space-y-3 p-4">
                <input type="hidden" name="id" value={order.id} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Production date">
                    <Input
                      name="forDate"
                      type="date"
                      required
                      defaultValue={dateValue}
                    />
                  </Field>
                  <Field
                    label="Destination venue"
                    hint="Applies to every line in this order."
                  >
                    <Select
                      name="destinationVenueId"
                      required
                      defaultValue={
                        order.destinationVenueId ?? active?.id ?? venues[0]?.id
                      }
                    >
                      {venues
                        .filter(
                          (v) =>
                            user.role === "ADMIN" || v.id === user.homeVenueId,
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </Select>
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
          </div>
        )}

        {/* Right column — live summary + requested recipes */}
        <div className={canManage ? undefined : "lg:col-span-2"}>
          <Card className="p-5">
            <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">
              Order Summary
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Lines"
                value={String(lines.length)}
                sub={lines.length > 0 ? `${open} open` : undefined}
              />
              <Stat
                label="Recipes"
                value={String(recipeCount.size)}
                sub={
                  [...recipeCount.values()].some((c) => c > 1)
                    ? "incl. repeats"
                    : undefined
                }
              />
            </div>
          </Card>

          <div className="mt-6">
            <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">
              Requested Recipes
            </h2>
            {lines.length === 0 ? (
              <EmptyState
                title="No recipes yet"
                hint={
                  canManage
                    ? "Add one with the form on the left."
                    : "Nothing requested."
                }
              />
            ) : (
              <div className="space-y-3">
                {lines.map((l) => (
                  <PrepLineCard
                    key={l.id}
                    orderId={order.id}
                    canManage={canManage}
                    line={{
                      id: l.id,
                      recipeId: l.recipeId,
                      recipeName: l.recipe.name,
                      prodCode: l.recipe.prodCode,
                      recipeYieldUnit: l.recipe.yieldUnit,
                      requestedQty: l.requestedQty,
                      requestedUnit: l.requestedUnit,
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
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-stone px-4 py-5 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl leading-none tracking-tight text-ink">
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}
