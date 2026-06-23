import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { money, num } from "@/lib/costing";
import { buildBanquetPlan, banquetRecipeSelect, type BanquetLine } from "@/lib/banquet";
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

  const [event, recipeRows, venues] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        venue: true,
        menuItems: {
          include: { recipe: { select: { id: true, name: true, yieldQty: true, yieldUnit: true } } },
          orderBy: { recipe: { name: "asc" } },
        },
      },
    }),
    // Full catalog with the fields the rollup engine needs, so sub-recipes
    // explode down to raw purchasable items — same loading pattern the banquet
    // and prep shopping lists use.
    prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true, prodCode: true }, orderBy: { name: "asc" } }),
    getVenues(),
  ]);

  if (!event) notFound();

  // Cost rollup + aggregated prep/shopping list. Each menu line is scaled by its
  // planned servings (interpreted in the recipe's own yield unit, so the factor
  // is servings ÷ yield), and the shared engine explodes any sub-recipes into
  // raw items — exactly what the banquet kitchen view does. The old rollup only
  // summed each recipe's direct ingredients, so dishes built from sub-recipes
  // showed $0 and contributed nothing to the prep list.
  const lines: BanquetLine[] = event.menuItems.map((mi) => ({
    recipeId: mi.recipeId,
    recipeName: mi.recipe.name,
    orderedQty: mi.plannedServings,
    unit: mi.recipe.yieldUnit,
  }));
  const plan = buildBanquetPlan(lines, recipeRows);

  const menuRecipeIds = new Set(event.menuItems.map((m) => m.recipeId));
  const availableRecipes = recipeRows.filter((r) => !menuRecipeIds.has(r.id));

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
          value={money(plan.totalCost)}
          sub={event.guestCount > 0 ? `${money(plan.totalCost / event.guestCount)} / guest` : undefined}
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
              {event.menuItems.map((mi, i) => {
                const lc = plan.lineCosts[i];
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
                    <td className="px-4 py-2 text-right text-zinc-700">{lc ? money(lc.cost) : "—"}</td>
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
          {plan.shoppingList.itemCount === 0 ? (
            <p className="p-4 text-sm text-zinc-400">Add dishes to generate the prep list.</p>
          ) : (
            <div className="p-4">
              {plan.shoppingList.unscaledRecipes.length > 0 && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Couldn&apos;t scale {plan.shoppingList.unscaledRecipes.join(", ")} — the recipe has no usable yield, so
                  it&apos;s counted as one base batch; verify by hand.
                </div>
              )}
              <div className="space-y-5">
                {plan.shoppingList.categories.map((cat) => (
                  <section key={cat.category}>
                    <h3 className="border-b border-zinc-200 pb-1 font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                      {cat.category}
                    </h3>
                    <table className="mt-1 w-full text-sm">
                      <tbody className="divide-y divide-zinc-100">
                        {cat.items.map((it) => (
                          <tr key={it.itemId}>
                            <td className="py-1.5 pr-4 text-zinc-800">{it.name}</td>
                            <td className="py-1.5 text-right tabular-nums text-zinc-600">
                              {it.amounts.map((a, j) => (
                                <div key={j}>
                                  {num(a.qty)} <span className="text-zinc-400">{a.unit}</span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-400">
                {plan.shoppingList.itemCount} ingredient{plan.shoppingList.itemCount === 1 ? "" : "s"} · sub-recipes broken
                down to raw items · est. food cost {money(plan.totalCost)}.
              </p>
            </div>
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
