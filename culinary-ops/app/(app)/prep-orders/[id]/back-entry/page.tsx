import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { unitLabel, UNIT_OPTIONS } from "@/lib/units";
import { Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { saveBackEntry } from "../../actions";
import { BACK_ENTRY_STATUSES, prepStatusLabel } from "@/lib/prep";

// Back-entry: someone keys results off the printed packet. Every printed line is
// pre-loaded with the requested qty as the default actual — confirm or correct.
// Splits appear as sibling rows so destination qty is allocated inline.

export default async function BackEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [order, users] = await Promise.all([
    prisma.prepOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            recipe: { select: { name: true, prodCode: true } },
            destinationVenue: { select: { name: true, code: true } },
          },
          orderBy: [{ recipe: { name: "asc" } }, { destinationVenue: { name: "asc" } }],
        },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!order) notFound();

  const lines = order.lines.filter((l) => l.lot); // printed lines only
  // A split is two lines sharing one lot (one batch → two venues).
  const lotCount = new Map<string, number>();
  for (const l of lines) lotCount.set(l.lot!, (lotCount.get(l.lot!) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link href={`/prep-orders/${order.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to order
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight text-ink">Back-Entry</h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
          {order.forDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
          {" · "}entering as {user.name}
        </p>
      </div>

      {lines.length === 0 ? (
        <Card className="p-8 text-center text-sm text-zinc-400">
          Nothing to enter — generate the cook packet first to assign lots.
        </Card>
      ) : (
        <form action={saveBackEntry}>
          <input type="hidden" name="prepOrderId" value={order.id} />
          <Card>
            <CardHeader>Production results · confirm or correct</CardHeader>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Recipe · Lot</th>
                  <th className="px-3 py-2 font-medium">Dest.</th>
                  <th className="px-3 py-2 text-right font-medium">Req.</th>
                  <th className="px-3 py-2 font-medium">Actual</th>
                  <th className="px-3 py-2 font-medium">Made by</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.map((l) => {
                  const split = (lotCount.get(l.lot!) ?? 0) > 1;
                  const resolved = BACK_ENTRY_STATUSES.includes(l.status as (typeof BACK_ENTRY_STATUSES)[number]);
                  const defaultStatus = resolved ? l.status : "MADE";
                  return (
                    <tr key={l.id} className="align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium text-zinc-800">{l.recipe.name}</p>
                        <p className="font-mono text-[12px] text-zinc-500">{l.lot}</p>
                        {split && (
                          <span className="mt-1 inline-block">
                            <Badge color="blue">split</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{l.destinationVenue.code}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {num(l.requestedQty)} {unitLabel(l.requestedUnit)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Input
                            name={`actualQty_${l.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={l.actualQty != null ? num(l.actualQty) : num(l.requestedQty)}
                            className="w-20"
                          />
                          <Select name={`actualUnit_${l.id}`} defaultValue={l.actualUnit ?? l.requestedUnit} className="w-24">
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
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Select name={`madeBy_${l.id}`} defaultValue={l.madeByUserId ?? user.id} className="w-36">
                          <option value="">—</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select name={`status_${l.id}`} defaultValue={defaultStatus} className="w-28">
                          {BACK_ENTRY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {prepStatusLabel(s)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input name={`notes_${l.id}`} defaultValue={l.notes ?? ""} placeholder="—" className="w-40" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-zinc-100 p-4">
              <p className="text-xs text-zinc-400">
                Set <span className="font-medium">Short</span> when less than requested, <span className="font-medium">Not Made</span> to
                skip explicitly. Cost is frozen on save.
              </p>
              <Button type="submit">Save all</Button>
            </div>
          </Card>
        </form>
      )}

      {lines.some((l) => BACK_ENTRY_STATUSES.includes(l.status as (typeof BACK_ENTRY_STATUSES)[number])) && (
        <p className="mt-3 text-xs text-zinc-500">
          Already-entered lines show their last values · re-saving re-freezes cost at current Catalog prices.
        </p>
      )}
    </div>
  );
}
