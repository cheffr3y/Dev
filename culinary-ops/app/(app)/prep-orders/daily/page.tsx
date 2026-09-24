import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import {
  DEFAULT_DISHWASHER_LABOR_RATE,
  DEFAULT_PRODUCTION_LABOR_RATE,
  allocateCurrencyByWeight,
  allocateMinutesByWeight,
  availableBatchQuantity,
  batchLaborCost,
} from "@/lib/production";
import { readPrepCostDetailSnapshot } from "@/lib/prep-cost-detail";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import {
  addStockAdjustment,
  addTransferExclusion,
  capturePrepLot,
  finalizeCloseout,
  recordProduction,
  recordTransfer,
  setBatchProductionMinutes,
} from "../../production/actions";

function isoDay(value: Date = new Date()) {
  return value.toISOString().slice(0, 10);
}

function dayBounds(day: string) {
  return {
    start: new Date(`${day}T00:00:00.000Z`),
    end: new Date(`${day}T23:59:59.999Z`),
  };
}

export default async function DailyPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dishwasherMinutes?: string; dishwasherRate?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : isoDay();
  const { start, end } = dayBounds(businessDate);

  // Deliberately sequential. This screen used to open ten queries at once,
  // which exhausted smaller managed-Postgres connection limits.
  const recipes = await prisma.recipe.findMany({
    select: { id: true, name: true, yieldQty: true, yieldUnit: true, productionPersonMinutes: true },
    orderBy: { name: "asc" },
  });
  const venues = await prisma.venue.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
  const dayBatches = await prisma.productionBatch.findMany({
    where: { producedOn: { gte: start, lte: end } },
    include: { recipe: true, transfers: { select: { quantity: true, unit: true } }, adjustments: { select: { quantity: true, unit: true } } },
    orderBy: { createdAt: "asc" },
  });
  const transfers = await prisma.stockTransfer.findMany({
    where: { transferDate: { gte: start, lte: end } },
    include: { venue: true, batch: { include: { recipe: true } }, exclusions: { include: { supplyingVenue: true } } },
    orderBy: { createdAt: "asc" },
  });
  const stockBatches = await prisma.productionBatch.findMany({
    include: { recipe: true, transfers: { select: { quantity: true, unit: true } }, adjustments: { select: { quantity: true, unit: true } } },
    orderBy: [{ producedOn: "asc" }, { createdAt: "asc" }],
  });
  const prepDefaults = await prisma.prepOrderLine.findMany({
    where: {
      productionBatchId: null,
      status: { in: ["MADE", "SHORT"] },
      prepOrder: { forDate: { gte: start, lte: end } },
      lot: { not: null },
    },
    include: { recipe: true, destinationVenue: true },
    orderBy: [{ lot: "asc" }, { destinationVenue: { name: "asc" } }],
  });
  const closeout = await prisma.productionCloseout.findUnique({ where: { businessDate: start } });

  const available = stockBatches
    .map((batch) => ({
      ...batch,
      availableQty: availableBatchQuantity({
        outputQty: batch.outputQty,
        outputUnit: batch.outputUnit,
        transfers: batch.transfers,
        adjustments: batch.adjustments,
      }),
    }))
    .filter((batch) => batch.availableQty > 1e-9);

  const prepLots = Array.from(
    new Map(prepDefaults.map((line) => [line.lot!, prepDefaults.filter((row) => row.lot === line.lot)])).entries(),
  );
  const previewMinutes = sp.dishwasherMinutes === undefined ? null : Number(sp.dishwasherMinutes);
  const previewRate = Number(sp.dishwasherRate || DEFAULT_DISHWASHER_LABOR_RATE);
  const weights = dayBatches.map((batch) => batch.actualProductionMinutes ?? 0);
  const basis = weights.reduce((sum, value) => sum + value, 0);
  const dishPreview = previewMinutes != null && previewMinutes >= 0 && (basis > 0 || previewMinutes === 0)
    ? {
        minutes: previewMinutes === 0 ? dayBatches.map(() => 0) : allocateMinutesByWeight(previewMinutes, weights),
        costs: previewMinutes === 0
          ? dayBatches.map(() => 0)
          : allocateCurrencyByWeight(batchLaborCost(previewMinutes, previewRate), weights),
      }
    : null;

  return <div className="mx-auto max-w-6xl">
    <div className="mb-4 flex items-center justify-between">
      <Link href="/prep-orders" className="text-sm text-blue-600 hover:underline">← Prep orders</Link>
      <LinkButton href="/prep-orders/report" variant="secondary">Cost-transfer report</LinkButton>
    </div>
    <PageHeader title="Daily Prep" subtitle="Confirm prep, add stocked items, and record venue pickups." />

    <Card className="mb-5 p-3">
      <form className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Field label="Day"><Input name="date" type="date" defaultValue={businessDate} /></Field></div>
        <Button type="submit" variant="secondary">Go</Button>
        <p className="pb-2 text-xs text-zinc-500">Production and pickup dates stay separate for accurate transfers.</p>
      </form>
    </Card>

    {prepLots.length > 0 && <Card className="mb-5 border-blue-200">
      <CardHeader>Completed prep ready to confirm</CardHeader>
      <div className="divide-y divide-zinc-100">
        {prepLots.map(([lot, lines]) => <form key={lot} action={capturePrepLot} className="flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="lot" value={lot} />
          <div className="min-w-[220px] flex-1">
            <p className="font-medium text-ink">{lines[0].recipe.name}</p>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">{lot}</p>
            <p className="mt-1 text-xs text-zinc-500">{lines.map((line) => `${line.destinationVenue.code} ${num(line.actualQty)} ${unitLabel(line.actualUnit ?? line.requestedUnit)}`).join(" · ")}</p>
          </div>
          <div className="w-36"><Field label="Person-min" hint={lines[0].recipe.productionPersonMinutes == null ? "Required—no recipe default" : "Blank = standard"}><Input name="actualProductionMinutes" type="number" min="0" step="0.1" required={lines[0].recipe.productionPersonMinutes == null} /></Field></div>
          <div className="w-40"><Field label="Delivery date"><Input name="transferDate" type="date" defaultValue={businessDate} required /></Field></div>
          <Button type="submit">Confirm</Button>
        </form>)}
      </div>
    </Card>}

    <Card className="mb-5">
      <CardHeader>Stock activity</CardHeader>
      <div className="grid divide-y divide-zinc-100 md:grid-cols-2 md:divide-x md:divide-y-0">
        <details className="p-4" open={dayBatches.length === 0 && prepLots.length === 0}>
          <summary className="cursor-pointer font-medium text-ink">+ Add something made for stock</summary>
          <p className="mt-1 text-xs text-zinc-500">Use this when you made an item to keep at the commissary, not for an immediate venue delivery.</p>
          <form action={recordProduction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="producedOn" value={businessDate} />
            <input type="hidden" name="productionLaborRate" value={DEFAULT_PRODUCTION_LABOR_RATE} />
            <Field label="Item"><Select name="recipeId" required><option value="">Choose…</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</Select></Field>
            <Field label="Quantity made"><Input name="outputQty" type="number" min="0.01" step="0.01" required /></Field>
            <Field label="Unit"><Input name="outputUnit" placeholder="lb, gallon, each…" required /></Field>
            <Field label="Person-min" hint="Blank = recipe standard"><Input name="actualProductionMinutes" type="number" min="0" step="0.1" /></Field>
            <Field label="Notes"><Input name="notes" placeholder="Optional" /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-xs text-zinc-600"><input name="openingStock" type="checkbox" /> Opening stock already on hand</label>
            <div className="sm:col-span-2"><Button type="submit">Add to stock</Button></div>
          </form>
        </details>

        <details className="p-4" open={available.length > 0}>
          <summary className="cursor-pointer font-medium text-ink">+ Record a stock pickup</summary>
          <p className="mt-1 text-xs text-zinc-500">Oldest available batch is listed first. No prep request is required.</p>
          <form action={recordTransfer} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="transferDate" value={businessDate} />
            <input type="hidden" name="sourceType" value="STOCK_PICKUP" />
            <Field label="Stocked item / batch"><Select name="batchId" required><option value="">Choose…</option>{available.map((batch) => <option key={batch.id} value={batch.id}>{batch.recipe.name} · {num(batch.availableQty)} {unitLabel(batch.outputUnit)} left · {batch.lot}</option>)}</Select></Field>
            <Field label="Receiving venue"><Select name="venueId" required><option value="">Choose…</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.code} · {venue.name}</option>)}</Select></Field>
            <Field label="Quantity"><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field>
            <Field label="Unit"><Input name="unit" placeholder="Use the batch unit" required /></Field>
            <Field label="Notes"><Input name="notes" placeholder="Optional" /></Field>
            <div className="self-end"><Button type="submit">Record pickup</Button></div>
          </form>
        </details>
      </div>
    </Card>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>Made / added today</CardHeader>
        {dayBatches.length === 0 ? <p className="p-5 text-sm text-zinc-400">Nothing recorded yet.</p> : <div className="divide-y divide-zinc-100">{dayBatches.map((batch) => {
          const left = availableBatchQuantity({ outputQty: batch.outputQty, outputUnit: batch.outputUnit, transfers: batch.transfers, adjustments: batch.adjustments });
          return <div key={batch.id} className="flex items-center justify-between gap-3 p-4 text-sm"><div><p className="font-medium">{batch.recipe.name}</p><p className="font-mono text-xs text-zinc-500">{batch.lot}</p></div><div className="text-right"><p>{num(batch.outputQty)} {unitLabel(batch.outputUnit)} made</p><p className="text-xs text-zinc-500">{num(left)} left in stock</p></div></div>;
        })}</div>}
      </Card>
      <Card>
        <CardHeader>Picked up / delivered today</CardHeader>
        {transfers.length === 0 ? <p className="p-5 text-sm text-zinc-400">No pickups recorded.</p> : <div className="divide-y divide-zinc-100">{transfers.map((transfer) => <div key={transfer.id} className="p-4 text-sm"><div className="flex justify-between gap-3"><div><p className="font-medium">{transfer.venue.code} · {transfer.batch.recipe.name}</p><p className="font-mono text-xs text-zinc-500">{transfer.batch.lot}</p></div><div className="text-right"><p>{num(transfer.quantity)} {unitLabel(transfer.unit)}</p><p className="text-xs text-zinc-500">{money(transfer.totalTransferCost)} transfer</p></div></div><TransferException transfer={transfer} venues={venues} canManage={hasRole(user, "MANAGER")} /></div>)}</div>}
      </Card>
    </div>

    <details className="mt-5 rounded-lg border border-hairline bg-canvas">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-zinc-700">Daily labor closeout & exceptions</summary>
      <div className="grid gap-5 border-t border-hairline p-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Dishwasher labor</h3>
          {dayBatches.some((batch) => batch.actualProductionMinutes == null) && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-800">Enter production person-minutes before closing the day:</p><div className="mt-2 space-y-2">{dayBatches.filter((batch) => batch.actualProductionMinutes == null).map((batch) => <form key={batch.id} action={setBatchProductionMinutes} className="flex items-end gap-2"><input type="hidden" name="batchId" value={batch.id} /><div className="flex-1 text-sm">{batch.recipe.name}<p className="font-mono text-[11px] text-zinc-500">{batch.lot}</p></div><div className="w-28"><Field label="Person-min"><Input name="minutes" type="number" min="0" step="0.1" required /></Field></div><Button type="submit" variant="secondary">Save</Button></form>)}</div></div>}
          {closeout?.finalizedAt ? <p className="mt-3 text-sm"><Badge color="green">Finalized</Badge> <span className="ml-2">{num(closeout.dishwasherMinutes)} min · {money(closeout.dishwasherCost)}</span></p> : <>
            <form className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="date" value={businessDate} /><div className="w-36"><Field label="Person-min"><Input name="dishwasherMinutes" type="number" min="0" step="0.1" defaultValue={sp.dishwasherMinutes ?? ""} /></Field></div><div className="w-32"><Field label="Rate / hr"><Input name="dishwasherRate" type="number" min="0" step="0.01" defaultValue={previewRate} /></Field></div><Button type="submit" variant="secondary">Preview</Button></form>
            {previewMinutes != null && basis <= 0 && previewMinutes > 0 && <p className="mt-3 text-xs text-amber-700">Add production person-minutes before allocating dishwasher time.</p>}
            {dishPreview && <><div className="mt-3 space-y-1 text-xs">{dayBatches.map((batch, index) => <div key={batch.id} className="flex justify-between"><span>{batch.recipe.name}</span><span>{num(dishPreview.minutes[index])} min · {money(dishPreview.costs[index])}</span></div>)}</div><form action={finalizeCloseout} className="mt-3"><input type="hidden" name="businessDate" value={businessDate} /><input type="hidden" name="dishwasherMinutes" value={previewMinutes ?? 0} /><input type="hidden" name="dishwasherRate" value={previewRate} /><Button type="submit" variant="gold">Finalize day</Button></form></>}
          </>}
        </div>
        <form action={addStockAdjustment} className="grid gap-2 sm:grid-cols-2">
          <h3 className="text-sm font-medium sm:col-span-2">Waste, return, or correction</h3>
          <input type="hidden" name="date" value={businessDate} />
          <Field label="Batch"><Select name="batchId" required><option value="">Choose…</option>{stockBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.recipe.name} · {batch.lot}</option>)}</Select></Field>
          <Field label="Type"><Select name="type"><option value="WASTE">Waste</option><option value="RETURN">Return</option><option value="CORRECTION">Correction</option></Select></Field>
          <Field label="Quantity"><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Unit"><Input name="unit" required /></Field>
          <Field label="Reason"><Input name="reason" required /></Field>
          <Field label="Correction effect"><Select name="effect"><option value="ADD">Add stock</option><option value="REMOVE">Remove stock</option></Select></Field>
          <div><Button type="submit" variant="secondary">Save adjustment</Button></div>
        </form>
      </div>
    </details>
  </div>;
}

type TransferRow = Awaited<ReturnType<typeof prisma.stockTransfer.findMany>>[number] & {
  venue: { code: string };
  batch: { foodCostDetailSnapshot: unknown; recipe: { name: string }; lot: string };
  exclusions: Array<{ id: string; itemName: string; excludedFoodCost: number; reason: string; supplyingVenue: { code: string } }>;
};

function TransferException({ transfer, venues, canManage }: { transfer: TransferRow; venues: Array<{ id: string; code: string; name: string }>; canManage: boolean }) {
  const detail = readPrepCostDetailSnapshot(transfer.batch.foodCostDetailSnapshot);
  if (!canManage || transfer.finalizedAt || !detail) return null;
  return <details className="mt-2"><summary className="cursor-pointer text-xs text-blue-600">Ingredient supplied by venue / borrowed</summary><form action={addTransferExclusion} className="mt-2 grid gap-2 rounded bg-zinc-50 p-3 sm:grid-cols-3"><input type="hidden" name="transferId" value={transfer.id} /><Field label="Ingredient"><Select name="itemId">{detail.rows.map((row) => <option key={row.itemId} value={row.itemId}>{row.itemName}</option>)}</Select></Field><Field label="Qty"><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label="Unit"><Input name="unit" required /></Field><Field label="Supplying venue"><Select name="supplyingVenueId">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.code}</option>)}</Select></Field><Field label="Treatment"><Select name="treatment"><option value="VENUE_SUPPLIED">Supplied for own order</option><option value="BORROWED_OWED">Borrowed / owed back</option></Select></Field><Field label="Reason"><Input name="reason" required /></Field><label className="flex items-center gap-2 text-xs"><input name="excludeFood" type="checkbox" defaultChecked /> Exclude food cost</label><div><Button type="submit" variant="secondary">Add exception</Button></div></form></details>;
}
