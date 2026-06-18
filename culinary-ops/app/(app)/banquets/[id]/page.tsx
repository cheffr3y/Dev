import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { buildBanquetPlan, banquetRecipeSelect, type BanquetLine } from "@/lib/banquet";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, StatCard, Textarea } from "@/components/ui";
import { STATUS_COLOR, EVENT_STATUSES as STATUSES, statusLabel } from "@/lib/event-status";
import { AddBanquetItemForm } from "../AddBanquetItemForm";
import { updateBanquetMenuItem, removeBanquetMenuItem, updateBanquet, deleteBanquet } from "../actions";

export default async function BanquetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [banquet, recipeRows, venues] = await Promise.all([
    prisma.banquet.findUnique({
      where: { id },
      include: {
        venue: true,
        menuItems: {
          include: { recipe: { select: { id: true, name: true, yieldQty: true, yieldUnit: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // Full catalog (with the fields both engines need) so sub-recipes explode
    // to raw items — same loading pattern the prep shopping list uses.
    prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true, prodCode: true }, orderBy: { name: "asc" } }),
    getVenues(),
  ]);

  if (!banquet) notFound();

  const lines: BanquetLine[] = banquet.menuItems.map((mi) => ({
    recipeId: mi.recipeId,
    recipeName: mi.recipe.name,
    orderedQty: mi.orderedQty,
    unit: mi.unit,
  }));
  const plan = buildBanquetPlan(lines, recipeRows);

  const pickerRecipes = recipeRows.map((r) => ({ id: r.id, name: r.name, prodCode: r.prodCode, yieldUnit: r.yieldUnit }));
  const hasAccount = banquet.salesManager || banquet.contactName || banquet.contactEmail || banquet.contactPhone;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/banquets" className="text-sm text-blue-600 hover:underline">
          ← Banquets
        </Link>
        <LinkButton href={`/banquets/${banquet.id}/prep-sheet`} variant="secondary">
          Prep sheet →
        </LinkButton>
      </div>

      <PageHeader
        title={banquet.name}
        subtitle={[banquet.venue.name, banquet.location, banquet.areas].filter(Boolean).join(" · ")}
        action={<Badge color={STATUS_COLOR[banquet.status]}>{banquet.status.toLowerCase()}</Badge>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Date"
          value={banquet.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          sub={banquet.timeLabel ?? banquet.date.toLocaleDateString("en-US", { weekday: "long", year: "numeric" })}
        />
        <StatCard label="Guests" value={banquet.guestCount} />
        <StatCard label="Dishes" value={banquet.menuItems.length} />
        <StatCard
          label="Est. Food Cost"
          value={money(plan.totalCost)}
          sub={banquet.guestCount > 0 ? `${money(plan.totalCost / banquet.guestCount)} / guest` : undefined}
        />
      </div>

      {hasAccount && (
        <Card className="mt-4 p-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            {banquet.contactName && (
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Contact</p>
                <p className="text-zinc-800">{banquet.contactName}</p>
              </div>
            )}
            {banquet.contactEmail && (
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Email</p>
                <p className="break-all text-zinc-800">{banquet.contactEmail}</p>
              </div>
            )}
            {banquet.contactPhone && (
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Phone</p>
                <p className="text-zinc-800">{banquet.contactPhone}</p>
              </div>
            )}
            {banquet.salesManager && (
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Sales manager</p>
                <p className="text-zinc-800">{banquet.salesManager}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Food lines */}
        <Card>
          <CardHeader>Food — ordered counts</CardHeader>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">Dish</th>
                <th className="px-4 py-2 text-right font-medium">Ordered</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                {canEdit && <th className="no-print"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {banquet.menuItems.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="px-4 py-6 text-center text-zinc-400">
                    No food lines yet.
                  </td>
                </tr>
              )}
              {banquet.menuItems.map((mi, i) => {
                const lc = plan.lineCosts[i];
                return (
                  <tr key={mi.id}>
                    <td className="px-4 py-2 align-top">
                      <Link href={`/recipes/${mi.recipeId}`} className="font-medium text-zinc-800 hover:underline">
                        {mi.recipe.name}
                      </Link>
                      {mi.description && <p className="mt-0.5 text-xs text-zinc-500">{mi.description}</p>}
                      {lc && !lc.converted && (
                        <p className="mt-0.5 text-xs font-medium text-amber-600">
                          ⚠ {unitLabel(mi.unit)} doesn&apos;t convert to {unitLabel(mi.recipe.yieldUnit)} — scaled ×1
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right align-top text-zinc-600">
                      {canEdit ? (
                        <form action={updateBanquetMenuItem} className="inline-flex items-center justify-end gap-1">
                          <input type="hidden" name="id" value={mi.id} />
                          <input type="hidden" name="banquetId" value={banquet.id} />
                          <input type="hidden" name="description" value={mi.description ?? ""} />
                          <input
                            name="orderedQty"
                            type="number"
                            step="0.01"
                            min="0.01"
                            defaultValue={num(mi.orderedQty)}
                            className="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-right text-sm"
                          />
                          <span className="text-xs text-zinc-400">{unitLabel(mi.unit)}</span>
                          <button className="no-print rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">
                            ✓
                          </button>
                        </form>
                      ) : (
                        <>
                          {num(mi.orderedQty)} {unitLabel(mi.unit)}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right align-top text-zinc-700">{lc ? money(lc.cost) : "—"}</td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right align-top no-print">
                        <form action={removeBanquetMenuItem}>
                          <input type="hidden" name="id" value={mi.id} />
                          <input type="hidden" name="banquetId" value={banquet.id} />
                          <button className="text-xs text-red-500 hover:underline">remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                <td className="px-4 py-2 text-zinc-700" colSpan={2}>
                  Est. food cost
                </td>
                <td className="px-4 py-2 text-right text-zinc-900">{money(plan.totalCost)}</td>
                {canEdit && <td className="no-print"></td>}
              </tr>
            </tfoot>
          </table>

          {canEdit && (
            <div className="border-t border-zinc-100 p-4 no-print">
              <AddBanquetItemForm banquetId={banquet.id} recipes={pickerRecipes} />
            </div>
          )}
        </Card>

        {/* Aggregated prep / pull list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span>Aggregated Prep & Pull List</span>
              <Link href={`/banquets/${banquet.id}/prep-sheet`} className="text-xs font-normal text-blue-600 hover:underline no-print">
                Print
              </Link>
            </div>
          </CardHeader>
          {plan.shoppingList.itemCount === 0 ? (
            <p className="p-4 text-sm text-zinc-400">Add food lines to generate the prep list.</p>
          ) : (
            <div className="p-4">
              {plan.shoppingList.unscaledRecipes.length > 0 && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Couldn&apos;t scale {plan.shoppingList.unscaledRecipes.join(", ")} — ordered units don&apos;t convert to
                  the recipe yield. Those are counted as one base batch; verify by hand.
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
                down to raw items.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Special instructions & setup */}
      {(banquet.specialInstructions || banquet.setupNotes || banquet.notes) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {banquet.specialInstructions && (
            <Card className="p-4">
              <CardHeader>Special instructions</CardHeader>
              <p className="whitespace-pre-line p-4 text-sm text-zinc-700">{banquet.specialInstructions}</p>
            </Card>
          )}
          {banquet.setupNotes && (
            <Card className="p-4">
              <CardHeader>Setup</CardHeader>
              <p className="whitespace-pre-line p-4 text-sm text-zinc-700">{banquet.setupNotes}</p>
            </Card>
          )}
          {banquet.notes && (
            <Card className="bg-amber-50 p-4">
              <p className="whitespace-pre-line text-sm text-amber-900">📋 {banquet.notes}</p>
            </Card>
          )}
        </div>
      )}

      {/* Edit banquet */}
      {canEdit && (
        <Card className="no-print mt-6">
          <CardHeader>Edit banquet</CardHeader>
          <form action={updateBanquet} className="space-y-3 p-4">
            <input type="hidden" name="id" value={banquet.id} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Name">
                <Input name="name" required defaultValue={banquet.name} />
              </Field>
              <Field label="Venue">
                <Select name="venueId" defaultValue={banquet.venueId}>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <Input name="date" type="date" required defaultValue={banquet.date.toISOString().slice(0, 10)} />
              </Field>
              <Field label="Service window">
                <Input name="timeLabel" defaultValue={banquet.timeLabel ?? ""} />
              </Field>
              <Field label="Guests">
                <Input name="guestCount" type="number" min="0" defaultValue={banquet.guestCount} />
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={banquet.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location">
                <Input name="location" defaultValue={banquet.location ?? ""} />
              </Field>
              <Field label="Area(s) / room">
                <Input name="areas" defaultValue={banquet.areas ?? ""} />
              </Field>
              <Field label="Sales manager">
                <Input name="salesManager" defaultValue={banquet.salesManager ?? ""} />
              </Field>
              <Field label="Contact name">
                <Input name="contactName" defaultValue={banquet.contactName ?? ""} />
              </Field>
              <Field label="Contact email">
                <Input name="contactEmail" type="email" defaultValue={banquet.contactEmail ?? ""} />
              </Field>
              <Field label="Contact phone">
                <Input name="contactPhone" defaultValue={banquet.contactPhone ?? ""} />
              </Field>
            </div>
            <Field label="Special instructions">
              <Textarea name="specialInstructions" defaultValue={banquet.specialInstructions ?? ""} />
            </Field>
            <Field label="Setup">
              <Textarea name="setupNotes" defaultValue={banquet.setupNotes ?? ""} />
            </Field>
            <Field label="Notes">
              <Textarea name="notes" defaultValue={banquet.notes ?? ""} />
            </Field>
            <Button type="submit">Save changes</Button>
          </form>
          <div className="border-t border-zinc-100 p-4">
            <form action={deleteBanquet}>
              <input type="hidden" name="id" value={banquet.id} />
              <Button type="submit" variant="danger">
                Delete banquet
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
