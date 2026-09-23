"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveUser, requireRole } from "@/lib/session";
import { buildCostMap, type RecipeCostNode } from "@/lib/costing";
import { buildPrepCostDetail, makePrepCostDetailSnapshot, readPrepCostDetailSnapshot, type CostDetailRecipeNode } from "@/lib/prep-cost-detail";
import { lineCostSnapshot } from "@/lib/prep";
import {
  DEFAULT_DISHWASHER_LABOR_RATE,
  DEFAULT_PRODUCTION_LABOR_RATE,
  allocateCurrencyByWeight,
  allocateMinutesByWeight,
  availableBatchQuantity,
  batchLaborCost,
  prorateTransferCost,
  quantityInBatchUnit,
  reconcileExcludedFood,
} from "@/lib/production";
import { convertQty } from "@/lib/units";

const date = (raw: FormDataEntryValue | null) => new Date(`${String(raw)}T00:00:00.000Z`);

async function recipeNodes() {
  return prisma.recipe.findMany({
    select: {
      id: true, yieldQty: true, yieldUnit: true,
      items: { select: { itemId: true, quantity: true, unit: true, item: { select: { name: true, category: true, unitCost: true, unit: true, sku: true, gcode: true } } } },
      components: { select: { childId: true, quantity: true, unit: true } },
    },
  });
}

const batchSchema = z.object({
  recipeId: z.string().min(1),
  producedOn: z.string().min(1),
  outputQty: z.coerce.number().positive(),
  outputUnit: z.string().trim().min(1),
  lot: z.string().trim().optional(),
  actualProductionMinutes: z.coerce.number().min(0).optional(),
  openingFoodCost: z.coerce.number().min(0).optional(),
  productionLaborRate: z.coerce.number().min(0),
  openingStock: z.boolean(),
  notes: z.string().trim().optional(),
});

export async function recordProduction(formData: FormData) {
  const user = await requireActiveUser();
  const d = batchSchema.parse({
    recipeId: formData.get("recipeId"), producedOn: formData.get("producedOn"),
    outputQty: formData.get("outputQty"), outputUnit: formData.get("outputUnit"),
    lot: formData.get("lot") || undefined,
    actualProductionMinutes: formData.get("actualProductionMinutes") || undefined,
    openingFoodCost: formData.get("openingFoodCost") || undefined,
    productionLaborRate: formData.get("productionLaborRate") || DEFAULT_PRODUCTION_LABOR_RATE,
    openingStock: formData.get("openingStock") === "on", notes: formData.get("notes") || undefined,
  });
  const [recipe, nodes] = await Promise.all([
    prisma.recipe.findUnique({ where: { id: d.recipeId }, select: { prodCode: true, yieldQty: true, yieldUnit: true, productionPersonMinutes: true } }),
    recipeNodes(),
  ]);
  if (!recipe) throw new Error("Recipe not found.");
  const outputInYield = convertQty(d.outputQty, d.outputUnit, recipe.yieldUnit);
  if (outputInYield == null) throw new Error(`Output unit ${d.outputUnit} is not compatible with ${recipe.yieldUnit}.`);
  const scale = outputInYield / recipe.yieldQty;
  const standardMinutes = recipe.productionPersonMinutes == null ? null : recipe.productionPersonMinutes * scale;
  const actualMinutes = d.actualProductionMinutes ?? standardMinutes;
  const food = lineCostSnapshot({
    recipeTotalCost: buildCostMap(nodes as RecipeCostNode[]).get(d.recipeId) ?? 0,
    yieldQty: recipe.yieldQty, yieldUnit: recipe.yieldUnit, qty: d.outputQty, unit: d.outputUnit,
  });
  const details = buildPrepCostDetail(d.recipeId, d.outputQty, d.outputUnit, nodes as CostDetailRecipeNode[]);
  const missingCost = details.length === 0 || details.some((row) => row.unitCost <= 0 || !row.converted);
  const dayKey = d.producedOn.replaceAll("-", "");
  const lot = d.lot || `${d.openingStock ? "OPEN" : "BATCH"}-${dayKey}-${recipe.prodCode}-${Date.now().toString(36).toUpperCase()}`;
  await prisma.productionBatch.create({
    data: {
      recipeId: d.recipeId, producedOn: date(d.producedOn), outputQty: d.outputQty, outputUnit: d.outputUnit,
      lot, openingStock: d.openingStock, estimatedOpeningCost: d.openingStock,
      foodCostSnapshot: d.openingStock && d.openingFoodCost != null ? d.openingFoodCost : missingCost && d.openingStock ? null : food.allocatedCost,
      foodCostDetailSnapshot: makePrepCostDetailSnapshot(details),
      standardProductionMinutes: standardMinutes, actualProductionMinutes: actualMinutes,
      productionMinutesSource: d.actualProductionMinutes == null ? "STANDARD" : "ACTUAL_OVERRIDE",
      productionLaborRate: d.productionLaborRate,
      productionLaborCost: actualMinutes == null ? 0 : batchLaborCost(actualMinutes, d.productionLaborRate),
      dishwasherLaborRate: DEFAULT_DISHWASHER_LABOR_RATE,
      notes: d.notes || null, enteredByUserId: user.id,
    },
  });
  revalidatePath("/production");
  redirect(`/production?date=${d.producedOn}`);
}

// Confirm an existing completed prep lot into the new ledger. This is explicit
// (never a historical backfill): the prep rows provide the defaults, and the
// operator confirms the lot from that day's closeout.
export async function capturePrepLot(formData: FormData) {
  const user = await requireActiveUser();
  const lot = String(formData.get("lot"));
  const transferDate = String(formData.get("transferDate"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) throw new Error("A planned transfer date is required.");
  const [lines, nodes] = await Promise.all([
    prisma.prepOrderLine.findMany({
      where: { lot, productionBatchId: null, status: { in: ["MADE", "SHORT"] } },
      include: { recipe: { select: { prodCode: true, yieldQty: true, yieldUnit: true, productionPersonMinutes: true } }, prepOrder: { select: { forDate: true } } },
      orderBy: { id: "asc" },
    }),
    recipeNodes(),
  ]);
  if (lines.length === 0) throw new Error("This prep lot is already captured or has no completed quantity.");
  if (new Set(lines.map((line) => line.recipeId)).size !== 1) throw new Error("A lot cannot contain multiple recipes.");
  const first = lines[0];
  const outputUnit = first.actualUnit ?? first.requestedUnit;
  let outputQty = 0;
  for (const line of lines) {
    const qty = convertQty(line.actualQty ?? 0, line.actualUnit ?? line.requestedUnit, outputUnit);
    if (qty == null) throw new Error("Prep lot quantities use incompatible units.");
    outputQty += qty;
  }
  const recipe = first.recipe;
  const totalRecipeCost = buildCostMap(nodes as RecipeCostNode[]).get(first.recipeId) ?? 0;
  const food = lineCostSnapshot({ recipeTotalCost: totalRecipeCost, yieldQty: recipe.yieldQty, yieldUnit: recipe.yieldUnit, qty: outputQty, unit: outputUnit });
  const details = buildPrepCostDetail(first.recipeId, outputQty, outputUnit, nodes as CostDetailRecipeNode[]);
  const outputInYield = convertQty(outputQty, outputUnit, recipe.yieldUnit);
  if (outputInYield == null) throw new Error("Prep output is incompatible with the recipe yield unit.");
  const standardMinutes = recipe.productionPersonMinutes == null ? null : recipe.productionPersonMinutes * outputInYield / recipe.yieldQty;
  const enteredMinutes = formData.get("actualProductionMinutes") === null || formData.get("actualProductionMinutes") === ""
    ? standardMinutes
    : Number(formData.get("actualProductionMinutes"));
  if (enteredMinutes != null && (!Number.isFinite(enteredMinutes) || enteredMinutes < 0)) throw new Error("Production person-minutes must be zero or greater.");
  await prisma.$transaction(async (tx) => {
    const stillOpen = await tx.prepOrderLine.count({ where: { id: { in: lines.map((line) => line.id) }, productionBatchId: null } });
    if (stillOpen !== lines.length) throw new Error("This prep lot was captured by another user. Refresh the closeout.");
    const batch = await tx.productionBatch.create({ data: {
      recipeId: first.recipeId, lot, producedOn: first.prepOrder.forDate, outputQty, outputUnit,
      foodCostSnapshot: food.allocatedCost, foodCostDetailSnapshot: makePrepCostDetailSnapshot(details),
      standardProductionMinutes: standardMinutes, actualProductionMinutes: enteredMinutes,
      productionMinutesSource: enteredMinutes === standardMinutes ? "STANDARD" : "ACTUAL_OVERRIDE", productionLaborRate: DEFAULT_PRODUCTION_LABOR_RATE,
      productionLaborCost: batchLaborCost(enteredMinutes ?? 0, DEFAULT_PRODUCTION_LABOR_RATE),
      dishwasherLaborRate: DEFAULT_DISHWASHER_LABOR_RATE, enteredByUserId: user.id,
    } });
    for (const line of lines) {
      const quantity = line.actualQty ?? 0;
      const unit = line.actualUnit ?? line.requestedUnit;
      const cost = prorateTransferCost({
        outputQty, outputUnit, foodCost: food.allocatedCost,
        productionMinutes: enteredMinutes ?? 0,
        productionLaborCost: batchLaborCost(enteredMinutes ?? 0, DEFAULT_PRODUCTION_LABOR_RATE),
        dishwasherMinutes: 0, dishwasherLaborCost: 0,
      }, quantity, unit);
      const captured = {
        foodCostBeforeExclusions: cost.foodCostBeforeExclusions, excludedFoodCost: cost.excludedFoodCost,
        netFoodCost: cost.netFoodCost, productionMinutes: cost.productionMinutes,
        productionLaborCost: cost.productionLaborCost, dishwasherMinutes: cost.dishwasherMinutes,
        dishwasherLaborCost: cost.dishwasherLaborCost, totalTransferCost: cost.totalTransferCost,
      };
      await tx.stockTransfer.create({ data: {
        batchId: batch.id, venueId: line.destinationVenueId, transferDate: date(transferDate),
        quantity, unit, sourceType: "PLANNED", ...captured, notes: `Confirmed from prep line ${line.id}`,
        enteredByUserId: user.id,
      } });
    }
    await tx.prepOrderLine.updateMany({ where: { id: { in: lines.map((line) => line.id) } }, data: { productionBatchId: batch.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/production");
  revalidatePath("/prep-orders/report");
}

const transferSchema = z.object({
  batchId: z.string().min(1), venueId: z.string().min(1), transferDate: z.string().min(1),
  quantity: z.coerce.number().positive(), unit: z.string().trim().min(1),
  sourceType: z.enum(["PLANNED", "STOCK_PICKUP", "CORRECTION"]),
  correctionOfStableId: z.string().trim().optional(), notes: z.string().trim().optional(),
});

export async function recordTransfer(formData: FormData) {
  const user = await requireActiveUser();
  const d = transferSchema.parse(Object.fromEntries(formData));
  await prisma.$transaction(async (tx) => {
    const batch = await tx.productionBatch.findUnique({
      where: { id: d.batchId }, include: { transfers: { select: { quantity: true, unit: true } }, adjustments: { select: { quantity: true, unit: true } } },
    });
    if (!batch) throw new Error("Production batch not found.");
    if (batch.foodCostSnapshot == null) throw new Error("This batch has incomplete opening cost information. Resolve it before transfer.");
    const requested = quantityInBatchUnit(d.quantity, d.unit, batch.outputUnit);
    const available = availableBatchQuantity({ outputQty: batch.outputQty, outputUnit: batch.outputUnit, transfers: batch.transfers, adjustments: batch.adjustments });
    if (requested > available + 1e-9) throw new Error(`Only ${available.toFixed(2)} ${batch.outputUnit} remains in this batch.`);
    const costs = prorateTransferCost({
      outputQty: batch.outputQty, outputUnit: batch.outputUnit, foodCost: batch.foodCostSnapshot,
      productionMinutes: batch.actualProductionMinutes ?? 0, productionLaborCost: batch.productionLaborCost,
      dishwasherMinutes: batch.dishwasherMinutes, dishwasherLaborCost: batch.dishwasherLaborCost,
    }, d.quantity, d.unit);
    const capturedCosts = {
      foodCostBeforeExclusions: costs.foodCostBeforeExclusions, excludedFoodCost: costs.excludedFoodCost,
      netFoodCost: costs.netFoodCost, productionMinutes: costs.productionMinutes,
      productionLaborCost: costs.productionLaborCost, dishwasherMinutes: costs.dishwasherMinutes,
      dishwasherLaborCost: costs.dishwasherLaborCost, totalTransferCost: costs.totalTransferCost,
    };
    const correctionOf = d.sourceType === "CORRECTION" && d.correctionOfStableId
      ? await tx.stockTransfer.findUnique({ where: { stableId: d.correctionOfStableId }, select: { id: true } })
      : null;
    if (d.sourceType === "CORRECTION" && d.correctionOfStableId && !correctionOf) throw new Error("The transfer ID being corrected was not found.");
    await tx.stockTransfer.create({ data: {
      batchId: batch.id, venueId: d.venueId, transferDate: date(d.transferDate), quantity: d.quantity, unit: d.unit,
      sourceType: d.sourceType, ...capturedCosts, finalizedAt: batch.finalizedAt ? new Date() : null,
      correctionOfId: correctionOf?.id ?? null, notes: d.notes || null, enteredByUserId: user.id,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/production");
  revalidatePath("/prep-orders/report");
  redirect(`/production?date=${d.transferDate}`);
}

export async function addTransferExclusion(formData: FormData) {
  await requireRole("MANAGER");
  const transferId = String(formData.get("transferId"));
  const itemId = String(formData.get("itemId"));
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit"));
  const supplyingVenueId = String(formData.get("supplyingVenueId"));
  const reason = String(formData.get("reason") || "").trim();
  const treatment = String(formData.get("treatment")) as "VENUE_SUPPLIED" | "BORROWED_OWED";
  if (!quantity || quantity <= 0 || !reason) throw new Error("Exclusion quantity and reason are required.");
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { batch: true, exclusions: true } });
    if (!transfer || transfer.finalizedAt) throw new Error("Only open transfers can be adjusted.");
    if (transfer.exclusions.some((row) => row.itemId === itemId)) throw new Error("This ingredient already has an exclusion on this transfer.");
    const snapshot = readPrepCostDetailSnapshot(transfer.batch.foodCostDetailSnapshot);
    const detail = snapshot?.rows.find((row) => row.itemId === itemId);
    if (!detail) throw new Error("Ingredient is not present in the frozen batch detail.");
    const qtyInCapturedUnit = quantityInBatchUnit(quantity, unit, detail.unit);
    const transferRatio = quantityInBatchUnit(transfer.quantity, transfer.unit, transfer.batch.outputUnit) / transfer.batch.outputQty;
    const transferShareQty = detail.quantity * transferRatio;
    if (qtyInCapturedUnit > transferShareQty + 1e-9) throw new Error("Exclusion exceeds this destination's share of the ingredient.");
    const excludeFood = formData.get("excludeFood") === "on";
    const excludedFoodCost = excludeFood ? qtyInCapturedUnit * detail.unitCost : 0;
    const excluded = reconcileExcludedFood(transfer.excludedFoodCost, excludedFoodCost, transfer.foodCostBeforeExclusions);
    await tx.transferExclusion.create({ data: {
      transferId, itemId, itemName: detail.itemName, gcode: detail.gcode, quantity, unit,
      capturedUnitPrice: detail.unitCost, excludedFoodCost, supplyingVenueId, reason, treatment,
      excludeFood,
      excludeProductionLabor: formData.get("excludeProductionLabor") === "on",
      excludeDishwasherLabor: formData.get("excludeDishwasherLabor") === "on",
    } });
    const productionLaborCost = formData.get("excludeProductionLabor") === "on" || transfer.exclusions.some((row) => row.excludeProductionLabor) ? 0 : transfer.productionLaborCost;
    const dishwasherLaborCost = formData.get("excludeDishwasherLabor") === "on" || transfer.exclusions.some((row) => row.excludeDishwasherLabor) ? 0 : transfer.dishwasherLaborCost;
    const netFoodCost = transfer.foodCostBeforeExclusions - excluded;
    await tx.stockTransfer.update({ where: { id: transferId }, data: {
      excludedFoodCost: excluded, netFoodCost, productionLaborCost, dishwasherLaborCost,
      totalTransferCost: netFoodCost + productionLaborCost + dishwasherLaborCost,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/production");
}

export async function resolveBorrow(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.transferExclusion.update({ where: { id }, data: { resolvedAt: new Date(), resolutionNotes: String(formData.get("resolutionNotes") || "") || null } });
  revalidatePath("/production");
}

export async function addStockAdjustment(formData: FormData) {
  const user = await requireActiveUser();
  const batchId = String(formData.get("batchId"));
  const kind = String(formData.get("type")) as "WASTE" | "RETURN" | "CORRECTION";
  const effect = String(formData.get("effect") || "ADD");
  let quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit"));
  const adjustmentDate = String(formData.get("date"));
  const reason = String(formData.get("reason") || "").trim();
  const correctionOfStableId = String(formData.get("correctionOfStableId") || "").trim();
  if (!quantity || quantity <= 0 || !reason) throw new Error("Adjustment quantity and reason are required.");
  if (kind === "WASTE" || (kind === "CORRECTION" && effect === "REMOVE")) quantity *= -1;
  await prisma.$transaction(async (tx) => {
    const batch = await tx.productionBatch.findUnique({ where: { id: batchId }, include: { transfers: true, adjustments: true } });
    if (!batch) throw new Error("Batch not found.");
    quantityInBatchUnit(quantity, unit, batch.outputUnit);
    const after = availableBatchQuantity({ outputQty: batch.outputQty, outputUnit: batch.outputUnit, transfers: batch.transfers, adjustments: [...batch.adjustments, { quantity, unit }] });
    if (after < -1e-9) throw new Error("This adjustment would make finished stock negative.");
    const correctionOf = kind === "CORRECTION" && correctionOfStableId
      ? await tx.finishedStockAdjustment.findUnique({ where: { stableId: correctionOfStableId }, select: { id: true } })
      : null;
    if (kind === "CORRECTION" && correctionOfStableId && !correctionOf) throw new Error("The stock adjustment ID being corrected was not found.");
    await tx.finishedStockAdjustment.create({ data: { batchId, date: date(adjustmentDate), type: kind, quantity, unit, reason, correctionOfId: correctionOf?.id ?? null, enteredByUserId: user.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/production");
}

export async function finalizeCloseout(formData: FormData) {
  const user = await requireActiveUser("MANAGER");
  const businessDate = String(formData.get("businessDate"));
  const dishwasherMinutes = Number(formData.get("dishwasherMinutes"));
  const dishwasherRate = Number(formData.get("dishwasherRate") || DEFAULT_DISHWASHER_LABOR_RATE);
  if (!Number.isFinite(dishwasherMinutes) || dishwasherMinutes < 0 || dishwasherRate < 0) throw new Error("Valid dishwasher minutes and rate are required.");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.productionCloseout.findUnique({ where: { businessDate: date(businessDate) } });
    if (existing?.finalizedAt) throw new Error("Dishwasher time for this day is already finalized.");
    const batches = await tx.productionBatch.findMany({ where: { producedOn: date(businessDate) }, include: { transfers: true }, orderBy: { id: "asc" } });
    if (batches.some((batch) => batch.actualProductionMinutes == null)) throw new Error("Every batch needs production person-minutes before closeout.");
    if (batches.some((batch) => batch.foodCostSnapshot == null)) throw new Error("Every batch needs a captured food cost before closeout.");
    const weights = batches.map((batch) => batch.actualProductionMinutes ?? 0);
    const totalBasis = weights.reduce((sum, n) => sum + n, 0);
    if (dishwasherMinutes > 0 && totalBasis <= 0) throw new Error("Production labor basis is zero. Leave dishwasher time pending until an explicit allocation can be entered.");
    const totalCost = batchLaborCost(dishwasherMinutes, dishwasherRate);
    const minuteAllocations = dishwasherMinutes === 0 ? batches.map(() => 0) : allocateMinutesByWeight(dishwasherMinutes, weights);
    const costAllocations = dishwasherMinutes === 0 ? batches.map(() => 0) : allocateCurrencyByWeight(totalCost, weights);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      await tx.productionBatch.update({ where: { id: batch.id }, data: {
        dishwasherMinutes: minuteAllocations[index], dishwasherLaborRate: dishwasherRate,
        dishwasherLaborCost: costAllocations[index], dishwasherAllocationMethod: "PRODUCTION_PERSON_MINUTES",
        status: "FINALIZED", finalizedAt: new Date(),
      } });
      for (const transfer of batch.transfers) {
        const ratio = quantityInBatchUnit(transfer.quantity, transfer.unit, batch.outputUnit) / batch.outputQty;
        const dishMinutes = minuteAllocations[index] * ratio;
        const dishCost = costAllocations[index] * ratio;
        await tx.stockTransfer.update({ where: { id: transfer.id }, data: {
          dishwasherMinutes: dishMinutes, dishwasherLaborCost: dishCost,
          totalTransferCost: transfer.netFoodCost + transfer.productionLaborCost + dishCost,
          finalizedAt: new Date(),
        } });
      }
    }
    await tx.productionCloseout.upsert({ where: { businessDate: date(businessDate) }, create: {
      businessDate: date(businessDate), dishwasherMinutes, dishwasherRate, allocationBasisMinutes: totalBasis,
      dishwasherCost: totalCost, allocationSnapshot: batches.map((batch, i) => ({ batchId: batch.id, minutes: minuteAllocations[i], cost: costAllocations[i] })),
      finalizedAt: new Date(), finalizedByUserId: user.id,
    }, update: {
      dishwasherMinutes, dishwasherRate, allocationBasisMinutes: totalBasis, dishwasherCost: totalCost,
      allocationSnapshot: batches.map((batch, i) => ({ batchId: batch.id, minutes: minuteAllocations[i], cost: costAllocations[i] })),
      finalizedAt: new Date(), finalizedByUserId: user.id,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/production");
  redirect(`/production?date=${businessDate}`);
}
