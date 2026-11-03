import { prisma } from "../db/prisma";
import { priceTrend, varianceThreshold, type PriceTrend } from "./price-trends";
export async function loadPriceTrends(items: { id: string; unit: string; vendorId?: string | null }[]) {
  if (!items.length) return {} as Record<string, PriceTrend | null>;
  const observations = await prisma.item.findMany({ where: { id: { in: items.map(item => item.id) } }, select: { id: true, purchaseLines: {
    where: { voided: false, countsAsFood: true, amountCents: { gt: 0 }, normalizedUnitCost: { gt: 0 } },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 100,
    select: { vendorId: true, vendor: { select: { name: true } }, normalizedUnit: true, normalizedUnitCost: true, amountCents: true, invoiceDate: true, measurementSnapshot: true },
  } } });
  const units = new Map(items.map(item => [item.id, item]));
  const threshold = varianceThreshold(process.env.PRICE_VARIANCE_THRESHOLD_PERCENT);
  return Object.fromEntries(observations.map(item => { const current = units.get(item.id)!; return [item.id, priceTrend(item.purchaseLines.map(row => ({ ...row, vendorName: row.vendor.name })), current.unit, current.vendorId, threshold)]; }));
}
