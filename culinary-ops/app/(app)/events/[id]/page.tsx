import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { recipeCost, costPerServing, money, num } from "@/lib/costing";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, StatCard, Textarea } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import {
  updateEventMenuItem,
  removeEventMenuItem,
  updateEvent,
  deleteEvent,
} from "../actions";
import { AddDishForm } from "../AddDishForm";
import { STATUS_COLOR, EVENT_STATUSES as STATUSES, statusLabel } from "@/lib/event-status";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [event, recipes, venues] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        venue: true,
        menuItems: {
          include: { recipe: { include: { items: { include: { item: true } } } } },
          orderBy: { recipe: { name: "asc" } },
        },
      },
    }),
    prisma.recipe.findMany({ include: { items: { include: { item: true } } }, orderBy: { name: "asc" } }),
    getVenues(),
  ]);

  if (!event) notFound();

  // Cost rollup + aggregated prep/shopping list.
  let totalFoodCost = 0;
  const prep = new Map<string, { name: string; unit: string; qty: number; cost: number }>();

  for (const mi of event.menuItems) {
    const r = mi.recipe;
    const perServing = costPerServing(recipeCost(r.items), r.yieldQty);
    totalFoodCost += perServing * mi.plannedServings;
    const scale = r.yieldQty > 0 ? mi.plannedServings / r.yieldQty : 0;
    for (const ri of r.items) {
      const key = ri.itemId;
      const prev = prep.get(key) ?? { name: ri.item.name, unit: ri.unit, qty: 0, cost: 0 };
      prev.qty += ri.quantity * scale;
      prev.cost += ri.quantity * scale * ri.item.unitCost;
      prep.set(key, prev);
    }
  }
  const prepList = [...prep.values()].sort((a, b) => a.name.localeCompare(b.name));
  const menuRecipeIds = new Set(event.menuItems.map((m) => m.recipeId));
  const availableRecipes = recipes.filter((r) => !menuRecipeIds.has(r.id));

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/events" className="text-sm text-blue-600 hover:underline">
          ← Events
        </Link>
        <PrintButton label="Print prep sheet" />
      </div>

      <PageHeader
        title={event.name}
        subtitle={`${event.venue.name}${event.location ? ` · ${event.location}` : ""}`}
        action={<Badge color={STATUS_COLOR[event.status]}>{event.status.toLowerCase()}</Badge>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Date"
          value={event.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          sub={event.date.toLocaleDateString("en-US", { weekday: "long", year: "numeric" })}
        />
        <StatCard label="Guests" value={event.guestCount} />
        <StatCard label="Dishes" value={event.menuItems.length} />
        <StatCard
          label="Est. Food Cost"
          value={money(totalFoodCost)}
          sub={event.guestCount > 0 ? `${money(totalFoodCost / event.guestCount)} / guest` : undefined}
        />
      </div>

      {event.notes && (
        <Card className="mt-4 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">📋 {event.notes}</p>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Menu */}
        <Card>
          <CardHeader>Menu</CardHeader>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">Dish</th>
                <th className="px-4 py-2 text-right font-medium">Servings</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                {canEdit && <th className="no-print"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {event.menuItems.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="px-4 py-6 text-center text-zinc-400">
                    No dishes on the menu yet.
                  </td>
                </tr>
              )}
              {event.menuItems.map((mi) => {
                const perServing = costPerServing(recipeCost(mi.recipe.items), mi.recipe.yieldQty);
                return (
                  <tr key={mi.id}>
                    <td className="px-4 py-2">
                      <Link href={`/recipes/${mi.recipeId}`} className="font-medium text-zinc-800 hover:underline">
                        {mi.recipe.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600">
                      {canEdit ? (
                        <form action={updateEventMenuItem} className="inline-flex items-center justify-end gap-1">
                          <input type="hidden" name="id" value={mi.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <input
                            name="plannedServings"
                            type="number"
                            step="1"
                            min="0"
                            defaultValue={num(mi.plannedServings)}
                            className="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-right text-sm"
                          />
                          <button className="no-print rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">
                            ✓
                          </button>
                        </form>
                      ) : (
                        num(mi.plannedServings)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-700">{money(perServing * mi.plannedServings)}</td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right no-print">
                        <form action={removeEventMenuItem}>
                          <input type="hidden" name="id" value={mi.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <button className="text-xs text-red-500 hover:underline">remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {canEdit && (
            <div className="border-t border-zinc-100 p-4 no-print">
              <AddDishForm
                eventId={event.id}
                defaultServings={event.guestCount || 0}
                recipes={availableRecipes.map((r) => ({
                  id: r.id,
                  name: r.name,
                  prodCode: r.prodCode,
                  yieldQty: r.yieldQty,
                  yieldUnit: r.yieldUnit,
                }))}
              />
            </div>
          )}
        </Card>

        {/* Prep / shopping list */}
        <Card>
          <CardHeader>Aggregated Prep & Shopping List</CardHeader>
          {prepList.length === 0 ? (
            <p className="p-4 text-sm text-zinc-400">Add dishes to generate the prep list.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Ingredient</th>
                  <th className="px-4 py-2 text-right font-medium">Total Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {prepList.map((p) => (
                  <tr key={p.name}>
                    <td className="px-4 py-2 text-zinc-800">{p.name}</td>
                    <td className="px-4 py-2 text-right text-zinc-600">
                      {num(p.qty)} {p.unit}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600">{money(p.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                  <td className="px-4 py-2 text-zinc-700" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-900">{money(totalFoodCost)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>

      {/* Edit event */}
      {canEdit && (
        <Card className="no-print mt-6">
          <CardHeader>Edit event</CardHeader>
          <form action={updateEvent} className="space-y-3 p-4">
            <input type="hidden" name="id" value={event.id} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Name">
                <Input name="name" required defaultValue={event.name} />
              </Field>
              <Field label="Venue">
                <Select name="venueId" defaultValue={event.venueId}>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <Input name="date" type="date" required defaultValue={event.date.toISOString().slice(0, 10)} />
              </Field>
              <Field label="Guest count">
                <Input name="guestCount" type="number" min="0" defaultValue={event.guestCount} />
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={event.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location">
                <Input name="location" defaultValue={event.location ?? ""} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" defaultValue={event.notes ?? ""} />
            </Field>
            <div className="flex items-center justify-between">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
          <div className="border-t border-zinc-100 p-4">
            <form action={deleteEvent}>
              <input type="hidden" name="id" value={event.id} />
              <Button type="submit" variant="danger">
                Delete event
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
