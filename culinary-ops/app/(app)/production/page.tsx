import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { money, num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { DEFAULT_DISHWASHER_LABOR_RATE, DEFAULT_PRODUCTION_LABOR_RATE, allocateCurrencyByWeight, allocateMinutesByWeight, availableBatchQuantity, batchLaborCost } from "@/lib/production";
import { readPrepCostDetailSnapshot } from "@/lib/prep-cost-detail";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { addStockAdjustment, addTransferExclusion, capturePrepLot, finalizeCloseout, recordProduction, recordTransfer, resolveBorrow } from "./actions";

function isoDay(value: Date = new Date()) {
  return value.toISOString().slice(0, 10);
}

function dayBounds(day: string) {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(`${day}T23:59:59.999Z`);
  return { start, end };
}

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ date?: string; dishwasherMinutes?: string; dishwasherRate?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : isoDay();
  const { start, end } = dayBounds(businessDate);
  const previewMinutes = sp.dishwasherMinutes === undefined ? null : Number(sp.dishwasherMinutes);
  const previewRate = Number(sp.dishwasherRate || DEFAULT_DISHWASHER_LABOR_RATE);

  const [recipes, venues, dayBatches, transferToday, stockBatches, closeout, openBorrows, prepDefaults, recentTransfers, adjustmentsToday] = await Promise.all([
    prisma.recipe.findMany({ select: { id: true, name: true, prodCode: true, yieldQty: true, yieldUnit: true, productionPersonMinutes: true }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.productionBatch.findMany({ where: { producedOn: { gte: start, lte: end } }, include: { recipe: true, transfers: { include: { venue: true, exclusions: { include: { supplyingVenue: true } } } }, adjustments: true }, orderBy: { createdAt: "asc" } }),
    prisma.stockTransfer.findMany({ where: { transferDate: { gte: start, lte: end } }, include: { venue: true, batch: { include: { recipe: true } }, exclusions: { include: { supplyingVenue: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.productionBatch.findMany({ include: { recipe: true, transfers: { select: { quantity: true, unit: true } }, adjustments: { select: { quantity: true, unit: true } } }, orderBy: [{ producedOn: "asc" }, { createdAt: "asc" }] }),
    prisma.productionCloseout.findUnique({ where: { businessDate: start } }),
    prisma.transferExclusion.findMany({ where: { treatment: "BORROWED_OWED", resolvedAt: null }, include: { supplyingVenue: true, transfer: { include: { venue: true, batch: { include: { recipe: true } } } } }, orderBy: { createdAt: "asc" } }),
    prisma.prepOrderLine.findMany({ where: { productionBatchId: null, status: { in: ["MADE", "SHORT"] }, prepOrder: { forDate: { gte: start, lte: end } }, lot: { not: null } }, include: { recipe: true, destinationVenue: true }, orderBy: [{ lot: "asc" }, { destinationVenue: { name: "asc" } }] }),
    prisma.stockTransfer.findMany({ select: { batch: { select: { recipeId: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.finishedStockAdjustment.findMany({ where: { date: { gte: start, lte: end } }, include: { batch: { include: { recipe: true } }, correctionOf: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const recentRecipeIds = [...new Set(recentTransfers.map((row) => row.batch.recipeId))].slice(0, 6);
  const recentRank = new Map(recentRecipeIds.map((id, index) => [id, index]));
  const orderedRecipes = [...recipes].sort((a, b) => (recentRank.get(a.id) ?? 99) - (recentRank.get(b.id) ?? 99) || a.name.localeCompare(b.name));

  const available = stockBatches.map((batch) => ({
    ...batch,
    availableQty: availableBatchQuantity({ outputQty: batch.outputQty, outputUnit: batch.outputUnit, transfers: batch.transfers, adjustments: batch.adjustments }),
  })).filter((batch) => batch.availableQty > 1e-9);
  const missing = dayBatches.flatMap((batch) => {
    const issues: string[] = [];
    if (batch.foodCostSnapshot == null) issues.push(`${batch.recipe.name} ${batch.lot}: opening food cost incomplete`);
    if (batch.actualProductionMinutes == null) issues.push(`${batch.recipe.name} ${batch.lot}: production minutes missing`);
    const detail = readPrepCostDetailSnapshot(batch.foodCostDetailSnapshot);
    if (detail?.rows.some((row) => !row.gcode)) issues.push(`${batch.recipe.name} ${batch.lot}: ingredient GCODE review needed`);
    if (detail?.rows.some((row) => row.unitCost <= 0 || !row.converted)) issues.push(`${batch.recipe.name} ${batch.lot}: ingredient price/unit costing incomplete`);
    return issues;
  });
  const weights = dayBatches.map((batch) => batch.actualProductionMinutes ?? 0);
  const weightTotal = weights.reduce((sum, n) => sum + n, 0);
  const dishPreview = previewMinutes != null && previewMinutes >= 0 && (weightTotal > 0 || previewMinutes === 0) ? {
    minutes: previewMinutes === 0 ? dayBatches.map(() => 0) : allocateMinutesByWeight(previewMinutes, weights),
    costs: previewMinutes === 0 ? dayBatches.map(() => 0) : allocateCurrencyByWeight(batchLaborCost(previewMinutes, previewRate), weights),
  } : null;

  return <div>
    <PageHeader title="Daily Production Closeout" subtitle={`${businessDate} · produced and transferred are tracked separately`} />
    <Card className="no-print mb-6 p-4">
      <form className="flex items-end gap-3"><Field label="Business date"><Input name="date" type="date" defaultValue={businessDate} /></Field><Button type="submit" variant="secondary">Review day</Button></form>
    </Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>Record production or opening stock</CardHeader>
        <form action={recordProduction} className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Recipe / finished item" hint="Recent selections appear first."><Select name="recipeId" required><option value="">Choose…</option>{orderedRecipes.map((r) => <option key={r.id} value={r.id}>{recentRank.has(r.id) ? "★ " : ""}{r.name} · yields {num(r.yieldQty)} {unitLabel(r.yieldUnit)}</option>)}</Select></Field>
          <Field label="Production date"><Input name="producedOn" type="date" defaultValue={businessDate} required /></Field>
          <Field label="Actual output"><Input name="outputQty" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Output unit"><UnitSelect name="outputUnit" /></Field>
          <Field label="Lot (optional)" hint="Auto-generated when blank."><Input name="lot" placeholder="BATCH-…" /></Field>
          <Field label="Actual production person-min" hint="Blank uses the scaled standard estimate."><Input name="actualProductionMinutes" type="number" min="0" step="0.1" /></Field>
          <Field label="Production rate / hr" hint={`Default ${money(DEFAULT_PRODUCTION_LABOR_RATE)}; wage only.`}><Input name="productionLaborRate" type="number" min="0" step="0.000001" defaultValue={DEFAULT_PRODUCTION_LABOR_RATE} /></Field>
          <Field label="Opening total food cost" hint="Optional estimated captured cost; required to transfer opening stock when recipe costing is incomplete."><Input name="openingFoodCost" type="number" min="0" step="0.01" /></Field>
          <Field label="Notes"><Input name="notes" /></Field>
          <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2"><input name="openingStock" type="checkbox" /> Opening finished stock (cost may be estimated; never silently priced at zero)</label>
          <div className="sm:col-span-2"><Button type="submit">Record batch</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader>Stock pickup / planned delivery</CardHeader>
        <form action={recordTransfer} className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Oldest available batch suggested"><Select name="batchId" required><option value="">Choose…</option>{available.map((b) => <option key={b.id} value={b.id}>{b.recipe.name} · {b.lot} · {num(b.availableQty)} {unitLabel(b.outputUnit)} left</option>)}</Select></Field>
          <Field label="Receiving venue"><Select name="venueId" required><option value="">Choose…</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}</Select></Field>
          <Field label="Quantity"><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Unit"><UnitSelect name="unit" /></Field>
          <Field label="Pickup / transfer date"><Input name="transferDate" type="date" defaultValue={businessDate} required /></Field>
          <Field label="Source"><Select name="sourceType" defaultValue="STOCK_PICKUP"><option value="STOCK_PICKUP">Unplanned stock pickup</option><option value="PLANNED">Planned delivery</option><option value="CORRECTION">Correction</option></Select></Field>
          <Field label="Corrects transfer ID" hint="Required context for a correction; leave blank otherwise."><Input name="correctionOfStableId" /></Field>
          <Field label="Notes"><Input name="notes" /></Field>
          <div className="self-end"><Button type="submit">Record transfer</Button></div>
        </form>
      </Card>
    </div>

    {prepDefaults.length > 0 && <Card className="mt-6 border-blue-200"><CardHeader>Planned deliveries ready to confirm</CardHeader><div className="divide-y divide-zinc-100">{Array.from(new Map(prepDefaults.map((line) => [line.lot!, prepDefaults.filter((row) => row.lot === line.lot)])).entries()).map(([lot, lines]) => <div key={lot} className="flex flex-wrap items-end justify-between gap-3 p-4"><div><p className="font-medium">{lines[0].recipe.name} · {lot}</p><p className="text-sm text-zinc-500">{lines.map((line) => `${line.destinationVenue.code} ${num(line.actualQty)} ${unitLabel(line.actualUnit ?? line.requestedUnit)}`).join(" · ")}</p></div><form action={capturePrepLot} className="flex flex-wrap items-end gap-2"><input type="hidden" name="lot" value={lot}/><Field label="Actual person-min" hint={`Blank = scaled standard${lines[0].recipe.productionPersonMinutes == null ? " (not configured)" : ""}`}><Input name="actualProductionMinutes" type="number" min="0" step="0.1" className="w-32"/></Field><Field label="Planned transfer date"><Input name="transferDate" type="date" defaultValue={businessDate} required className="w-40"/></Field><Button type="submit">Confirm production + planned transfers</Button></form></div>)}</div></Card>}

    <div className="mt-6 grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>Produced today</CardHeader>
        {dayBatches.length === 0 ? <p className="p-6 text-sm text-zinc-400">No production recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-50 text-left font-mono text-[11px] uppercase text-zinc-600"><tr><th className="px-3 py-2">Batch</th><th className="px-3 py-2 text-right">Output</th><th className="px-3 py-2 text-right">Stock left</th><th className="px-3 py-2 text-right">Food</th><th className="px-3 py-2 text-right">Prod labor</th><th className="px-3 py-2 text-right">Dish</th></tr></thead><tbody className="divide-y divide-zinc-100">{dayBatches.map((b) => {
          const left = availableBatchQuantity({ outputQty: b.outputQty, outputUnit: b.outputUnit, transfers: b.transfers, adjustments: b.adjustments });
          return <tr key={b.id}><td className="px-3 py-2"><p className="font-medium">{b.recipe.name}</p><p className="font-mono text-xs text-zinc-500">{b.lot} · {b.productionMinutesSource === "ACTUAL_OVERRIDE" ? "actual override" : "standard estimate"}</p></td><td className="px-3 py-2 text-right">{num(b.outputQty)} {unitLabel(b.outputUnit)}</td><td className="px-3 py-2 text-right font-medium">{num(left)} {unitLabel(b.outputUnit)}</td><td className="px-3 py-2 text-right">{b.foodCostSnapshot == null ? <Badge color="amber">incomplete</Badge> : money(b.foodCostSnapshot)}</td><td className="px-3 py-2 text-right">{num(b.actualProductionMinutes)} min · {money(b.productionLaborCost)}</td><td className="px-3 py-2 text-right">{num(b.dishwasherMinutes)} min · {money(b.dishwasherLaborCost)}</td></tr>;
        })}</tbody></table></div>}
      </Card>
      <Card><CardHeader>Attention</CardHeader><div className="p-4">{missing.length === 0 ? <p className="text-sm text-emerald-700">No batch costing warnings.</p> : <ul className="space-y-2 text-sm text-amber-800">{missing.map((issue) => <li key={issue}>• {issue}</li>)}</ul>}</div></Card>
    </div>

    <Card className="mt-6">
      <CardHeader>Transferred today</CardHeader>
      {transferToday.length === 0 ? <p className="p-6 text-sm text-zinc-400">No venue transfers recorded.</p> : <div className="divide-y divide-zinc-100">{transferToday.map((t) => {
        const detail = readPrepCostDetailSnapshot(t.batch.foodCostDetailSnapshot);
        return <div key={t.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{t.venue.code} · {t.batch.recipe.name} · {num(t.quantity)} {unitLabel(t.unit)}</p><p className="font-mono text-xs text-zinc-500">{t.stableId} · {t.batch.lot} · {t.sourceType.replaceAll("_", " ").toLowerCase()}</p></div><p className="text-right text-sm">Food {money(t.netFoodCost)} · Prod {money(t.productionLaborCost)} · Dish {money(t.dishwasherLaborCost)}<br/><strong>Total {money(t.totalTransferCost)}</strong></p></div>
          {t.exclusions.length > 0 && <div className="mt-2 text-xs text-zinc-600">{t.exclusions.map((e) => <p key={e.id}>{e.itemName}: {num(e.quantity)} {e.unit}, −{money(e.excludedFoodCost)} · supplied by {e.supplyingVenue.code} · {e.reason}</p>)}</div>}
          {!t.finalizedAt && detail && hasRole(user, "MANAGER") && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-blue-600">Add venue-supplied / borrowed ingredient</summary><form action={addTransferExclusion} className="mt-3 grid gap-2 rounded bg-zinc-50 p-3 md:grid-cols-4"><input type="hidden" name="transferId" value={t.id}/><Field label="Ingredient"><Select name="itemId">{detail.rows.map((r) => <option key={r.itemId} value={r.itemId}>{r.itemName} · {r.gcode || "missing GCODE"}</option>)}</Select></Field><Field label="Quantity"><Input name="quantity" type="number" min="0.001" step="0.001" required/></Field><Field label="Unit"><Input name="unit" defaultValue={detail.rows[0]?.unit || t.unit}/></Field><Field label="Supplying venue"><Select name="supplyingVenueId">{venues.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</Select></Field><Field label="Treatment"><Select name="treatment"><option value="VENUE_SUPPLIED">Supplied for own order</option><option value="BORROWED_OWED">Borrowed · owed back</option></Select></Field><Field label="Reason"><Input name="reason" required/></Field><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="excludeFood" defaultChecked/>Exclude food</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="excludeProductionLabor"/>Exclude production labor</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="excludeDishwasherLabor"/>Exclude dishwasher labor</label><div><Button type="submit" variant="secondary">Add exclusion</Button></div></form></details>}
        </div>;
      })}</div>}
    </Card>

    {adjustmentsToday.length > 0 && <Card className="mt-6"><CardHeader>Waste, returns & corrections today</CardHeader><div className="divide-y divide-zinc-100">{adjustmentsToday.map((a) => <div key={a.id} className="flex flex-wrap justify-between gap-3 p-4 text-sm"><span><strong>{a.type}</strong> · {a.batch.recipe.name} · {num(a.quantity)} {unitLabel(a.unit)} · {a.reason}</span><span className="font-mono text-xs text-zinc-500">{a.stableId}{a.correctionOf ? ` · corrects ${a.correctionOf.stableId}` : ""}</span></div>)}</div></Card>}

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card><CardHeader>Waste, return, or correction</CardHeader><form action={addStockAdjustment} className="grid gap-3 p-4 sm:grid-cols-2"><Field label="Batch"><Select name="batchId">{stockBatches.map((b) => <option key={b.id} value={b.id}>{b.recipe.name} · {b.lot}</option>)}</Select></Field><Field label="Type"><Select name="type"><option value="WASTE">Waste (reduces stock)</option><option value="RETURN">Return (adds stock)</option><option value="CORRECTION">Correction (explain)</option></Select></Field><Field label="Quantity"><Input name="quantity" type="number" min="0.01" step="0.01" required/></Field><Field label="Effect" hint="Used for corrections; waste/return choose automatically."><Select name="effect"><option value="ADD">Add stock</option><option value="REMOVE">Remove stock</option></Select></Field><Field label="Unit"><UnitSelect name="unit"/></Field><Field label="Date"><Input name="date" type="date" defaultValue={businessDate}/></Field><Field label="Corrects adjustment ID"><Input name="correctionOfStableId"/></Field><Field label="Reason"><Input name="reason" required/></Field><div><Button type="submit" variant="secondary">Record adjustment</Button></div></form></Card>
      <Card><CardHeader>Dishwasher allocation & manager closeout</CardHeader><div className="p-4">{closeout?.finalizedAt ? <div><Badge color="green">finalized</Badge><p className="mt-3 text-sm">{num(closeout.dishwasherMinutes)} person-min at {money(closeout.dishwasherRate)}/hr · {money(closeout.dishwasherCost)}</p><p className="mt-2 text-xs text-zinc-500">Rates, basis, minutes, and resulting costs are frozen.</p></div> : <>{<form className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="date" value={businessDate}/><Field label="Dishwasher person-min"><Input name="dishwasherMinutes" type="number" min="0" step="0.1" defaultValue={sp.dishwasherMinutes ?? ""}/></Field><Field label="Dishwasher rate / hr"><Input name="dishwasherRate" type="number" min="0" step="0.01" defaultValue={previewRate}/></Field><div className="self-end"><Button type="submit" variant="secondary">Preview allocation</Button></div></form>}
          {previewMinutes != null && weightTotal <= 0 && previewMinutes > 0 && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-800">Allocation basis is zero. Time remains pending; add production minutes before finalizing.</p>}
          {dishPreview && <><div className="mt-4 space-y-2 text-sm">{dayBatches.map((b, i) => <div key={b.id} className="flex justify-between"><span>{b.recipe.name} · {num(weights[i])} production min</span><strong>{num(dishPreview.minutes[i])} min · {money(dishPreview.costs[i])}</strong></div>)}</div><form action={finalizeCloseout} className="mt-4"><input type="hidden" name="businessDate" value={businessDate}/><input type="hidden" name="dishwasherMinutes" value={previewMinutes ?? 0}/><input type="hidden" name="dishwasherRate" value={previewRate}/><Button type="submit" variant="gold">Finalize daily closeout</Button></form></>}
          <p className="mt-3 text-xs text-zinc-500">Allocated by actual/standard production person-minutes. Production and dishwasher wages remain separate.</p></>}</div></Card>
    </div>

    {openBorrows.length > 0 && <Card className="mt-6"><CardHeader>Borrowed ingredients still owed</CardHeader><div className="divide-y divide-zinc-100">{openBorrows.map((b) => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span>{b.itemName} · {num(b.quantity)} {b.unit} from {b.supplyingVenue.code} for {b.transfer.venue.code} · {b.transfer.batch.recipe.name}</span><form action={resolveBorrow} className="flex gap-2"><input type="hidden" name="id" value={b.id}/><Input name="resolutionNotes" placeholder="Resolution note" required/><Button type="submit" variant="secondary">Mark resolved</Button></form></div>)}</div></Card>}
  </div>;
}

function UnitSelect({ name }: { name: string }) {
  return <Input name={name} defaultValue="each" placeholder="gallon, lb, each, servings…" required />;
}
