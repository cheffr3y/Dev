import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { money } from "@/lib/costing";
import { buildForecast } from "@/lib/festival";
import { buildBanquetPlan, banquetRecipeSelect, type BanquetLine } from "@/lib/banquet";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, StatCard, Textarea } from "@/components/ui";
import { STATUS_COLOR, EVENT_STATUSES as STATUSES, statusLabel } from "@/lib/event-status";
import { updateFestival, deleteFestival, addTent, updateTent, removeTent } from "../actions";
import { FestivalTabs } from "./FestivalTabs";

const CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
const CONFIDENCE_COLOR = { LOW: "red", MEDIUM: "amber", HIGH: "green" } as const;

export default async function FestivalOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const [festival, venues] = await Promise.all([
    prisma.festival.findUnique({
      where: { id },
      include: {
        venue: true,
        tents: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { menuItems: true } } } },
        menuItems: {
          include: { recipe: { select: { id: true, name: true, yieldUnit: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    getVenues(),
  ]);
  if (!festival) notFound();

  // Forecast + est. food cost — same live math the menu/builds pages use.
  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    festival.menuItems.map((mi) => ({
      id: mi.id,
      mixPct: mi.mixPct,
      price: mi.price,
      chefOverride: mi.chefOverride,
      bufferPctOverride: mi.bufferPctOverride,
    })),
  );
  const rowById = new Map(forecast.rows.map((r) => [r.id, r]));

  // Full catalog with the fields the rollup engine needs, so sub-recipes
  // explode down to raw purchasable items — the events-page loading pattern.
  const linked = festival.menuItems.filter((mi) => mi.recipe);
  const catalog = linked.length
    ? await prisma.recipe.findMany({ select: { ...banquetRecipeSelect, name: true } })
    : [];

  const lines: BanquetLine[] = linked.map((mi) => ({
    recipeId: mi.recipeId!,
    recipeName: mi.recipe!.name,
    orderedQty: rowById.get(mi.id)?.finalPrepPortions ?? 0,
    unit: mi.recipe!.yieldUnit,
  }));
  const plan = buildBanquetPlan(lines, catalog);

  const projectedCovers = Math.round(festival.expectedAttendance * festival.captureRate);
  const mixOk = Math.abs(forecast.totals.mixPctSum - 1) < 0.005;
  const base = `/festivals/${festival.id}`;

  const steps = [
    {
      n: 1,
      label: "Assumptions",
      href: base,
      hint: `${festival.expectedAttendance.toLocaleString()} attendance · ${Math.round(festival.captureRate * 100)}% capture · ${Math.round(festival.bufferPct * 100)}% buffer`,
    },
    {
      n: 2,
      label: "Menu & Forecast",
      href: `${base}/menu`,
      hint:
        festival.menuItems.length > 0
          ? `${festival.tents.length} tent${festival.tents.length === 1 ? "" : "s"} · ${festival.menuItems.length} item${festival.menuItems.length === 1 ? "" : "s"}${mixOk ? "" : " · mix ≠ 100%"}`
          : festival.tents.length > 0
            ? `${festival.tents.length} tent${festival.tents.length === 1 ? "" : "s"} · add items`
            : "add tents & items",
    },
    {
      n: 3,
      label: "Builds",
      href: `${base}/builds`,
      hint: linked.length > 0 ? `${linked.length} recipe${linked.length === 1 ? "" : "s"} scale` : "link recipes first",
    },
    {
      n: 4,
      label: "Accounting",
      href: `${base}/accounting`,
      hint: linked.length > 0 ? `${money(plan.totalCost)} recipe food cost · add labor & fees` : "link recipes first",
    },
    {
      n: 5,
      label: "Order Guide",
      href: `${base}/order-guide`,
      hint: linked.length > 0 ? `est. ${money(plan.totalCost)} food cost` : "link recipes first",
    },
  ];

  return (
    <div>
      <div className="no-print mb-4">
        <Link href="/festivals" className="text-sm text-blue-600 hover:underline">
          ← Festivals
        </Link>
      </div>

      <PageHeader
        title={festival.name}
        subtitle={`${festival.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${festival.venue ? ` · inventory hint: ${festival.venue.name}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Badge color={CONFIDENCE_COLOR[festival.forecastConfidence]}>
              {festival.forecastConfidence.toLowerCase()} confidence
            </Badge>
            <Badge color={STATUS_COLOR[festival.status]}>{festival.status.toLowerCase()}</Badge>
          </div>
        }
      />

      <FestivalTabs festivalId={festival.id} />

      {/* Start Here — the plan-to-order flow */}
      <Card className="mb-6">
        <CardHeader>Start here — plan to order</CardHeader>
        <ol className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {steps.map((s) => (
            <li key={s.n}>
              <Link href={s.href} className="block px-5 py-4 transition-colors hover:bg-zinc-50">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink font-mono text-xs text-white">
                    {s.n}
                  </span>
                  <span className="font-medium text-zinc-900">{s.label}</span>
                </span>
                <span className="mt-1.5 block text-xs text-zinc-500">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Attendance" value={festival.expectedAttendance.toLocaleString()} sub="expected" />
        <StatCard
          label="Projected covers"
          value={projectedCovers.toLocaleString()}
          sub={`${Math.round(festival.captureRate * 100)}% capture rate`}
        />
        <StatCard label="Projected revenue" value={money(forecast.totals.revenue)} sub={`${forecast.totals.portions.toLocaleString()} portions`} />
        <StatCard
          label="Est. food cost"
          value={money(plan.totalCost)}
          sub={forecast.totals.revenue > 0 ? `${((plan.totalCost / forecast.totals.revenue) * 100).toFixed(1)}% of revenue` : undefined}
        />
      </div>

      {festival.weatherNotes && (
        <Card className="mt-4 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">⛅ {festival.weatherNotes}</p>
        </Card>
      )}
      {festival.notes && (
        <Card className="mt-4 bg-amber-50 p-4">
          <p className="whitespace-pre-line text-sm text-amber-900">📋 {festival.notes}</p>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tents */}
        <Card>
          <CardHeader>Tents</CardHeader>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100">
              {festival.tents.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-400">
                    No tents yet — add BBQ Tent, Taco Tent, Desserts…
                  </td>
                </tr>
              )}
              {festival.tents.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">
                    {canEdit ? (
                      <form action={updateTent} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="festivalId" value={festival.id} />
                        <input
                          name="name"
                          defaultValue={t.name}
                          className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm"
                        />
                        <button className="no-print rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100">
                          ✓
                        </button>
                      </form>
                    ) : (
                      <span className="font-medium text-zinc-800">{t.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-500">
                    {t._count.menuItems} item{t._count.menuItems === 1 ? "" : "s"}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right no-print">
                      <form action={removeTent}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="festivalId" value={festival.id} />
                        <button
                          className="text-xs text-red-500 hover:underline"
                          title="Removes the tent AND its menu items"
                        >
                          remove tent &amp; its items
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <div className="border-t border-zinc-100 p-4 no-print">
              <form action={addTent} className="flex items-end gap-2">
                <input type="hidden" name="festivalId" value={festival.id} />
                <div className="flex-1">
                  <Field label="Add tent">
                    <Input name="name" required placeholder="BBQ Tent" />
                  </Field>
                </div>
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </form>
            </div>
          )}
        </Card>

        {/* Assumptions */}
        {canEdit ? (
          <Card>
            <CardHeader>Assumptions</CardHeader>
            <form action={updateFestival} className="space-y-3 p-4">
              <input type="hidden" name="id" value={festival.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input name="name" required defaultValue={festival.name} />
                </Field>
                <Field label="Date">
                  <Input name="date" type="date" required defaultValue={festival.date.toISOString().slice(0, 10)} />
                </Field>
                <Field label="Expected attendance">
                  <Input name="expectedAttendance" type="number" min="0" defaultValue={festival.expectedAttendance} />
                </Field>
                <Field label="Capture rate (%)">
                  <Input
                    name="captureRate"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={Math.round(festival.captureRate * 100)}
                  />
                </Field>
                <Field label="Buffer (%)">
                  <Input
                    name="bufferPct"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={Math.round(festival.bufferPct * 100)}
                  />
                </Field>
                <Field label="Confidence">
                  <Select name="forecastConfidence" defaultValue={festival.forecastConfidence}>
                    {CONFIDENCES.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0) + c.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select name="status" defaultValue={festival.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Venue (inventory hint)">
                  <Select name="venueId" defaultValue={festival.venueId ?? ""}>
                    <option value="">— none —</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Weather notes">
                <Input name="weatherNotes" defaultValue={festival.weatherNotes ?? ""} />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" defaultValue={festival.notes ?? ""} />
              </Field>
              <Button type="submit">Save assumptions</Button>
            </form>
          </Card>
        ) : (
          <Card>
            <CardHeader>Assumptions</CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm">
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Capture rate</dt>
                <dd className="text-zinc-800">{Math.round(festival.captureRate * 100)}%</dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">Buffer</dt>
                <dd className="text-zinc-800">{Math.round(festival.bufferPct * 100)}%</dd>
              </div>
            </dl>
          </Card>
        )}
      </div>

      {canEdit && (
        <Card className="no-print mt-6">
          <div className="flex items-center justify-between p-4">
            <p className="text-sm text-zinc-500">Deletes the festival, its tents, menu lines, and on-hand counts.</p>
            <form action={deleteFestival}>
              <input type="hidden" name="id" value={festival.id} />
              <Button type="submit" variant="danger">
                Delete festival
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
