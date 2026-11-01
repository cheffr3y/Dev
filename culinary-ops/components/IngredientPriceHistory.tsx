import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { convertQty } from "@/lib/units";
import { money, pct, preciseNum } from "@/lib/costing";
import { Card, CardHeader } from "./ui";

export async function IngredientPriceHistory({ itemId, unit }: { itemId: string; unit: string }) {
  const observations = await prisma.invoicePurchaseLine.findMany({ where: { itemId, voided: false }, include: { vendor: { select: { name: true } }, invoiceDocument: { select: { invoiceNumber: true } } }, orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 100 });
  const previous = new Map<string, number>();
  const rows = [...observations].reverse().map(row => {
    // Convert the price basis, never compare a case price with a pound price.
    const factor = row.normalizedUnit ? convertQty(1, unit, row.normalizedUnit) : null;
    const price = factor != null && row.normalizedUnitCost != null ? row.normalizedUnitCost * factor : null;
    const last = previous.get(row.vendorId);
    const change = price != null && price > 0 && last != null ? (price - last) / last * 100 : null;
    if (price != null && price > 0) previous.set(row.vendorId, price);
    return { ...row, price, change };
  });
  const vendors = [...new Map(rows.filter(row => row.price != null && row.price > 0).map(row => [row.vendorId, row.vendor.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const chartRows = rows.filter(row => row.price != null && row.price > 0);
  const dates = chartRows.map(row => row.invoiceDate.getTime()), prices = chartRows.map(row => row.price!);
  const low = Math.min(...prices), high = Math.max(...prices), from = Math.min(...dates), through = Math.max(...dates);
  const x = (date: number) => dates.length && through > from ? 10 + (date - from) / (through - from) * 580 : 300;
  const y = (price: number) => high > low ? 130 - (price - low) / (high - low) * 110 : 75;
  const colors = ["var(--color-gold)", "var(--color-sage)", "var(--color-amber-600)", "var(--color-red-500)", "var(--color-zinc-400)"];
  return <Card><CardHeader>Invoice price history</CardHeader><div className="p-4">
    <p className="mb-4 text-sm text-zinc-500">Latest {observations.length} recorded invoice lines (up to 100). Prices are normalized to {unit} when compatible. Changes compare consecutive positive purchases from the same supplier; credits are listed but excluded from trends. Current catalog prices and recipe costs are not automatically changed.</p>
    {!observations.length ? <p className="text-sm">Match this ingredient to a stored invoice line to start tracking paid prices.</p> : <>
      {chartRows.length > 0 && <figure className="mb-5" aria-label={`Paid ingredient prices in USD per ${unit} by invoice date`}>
        <figcaption className="mb-2 text-sm font-semibold">Paid price · USD / {unit}</figcaption>
        <div className="flex gap-3"><div className="flex w-24 shrink-0 flex-col justify-between py-3 text-xs tabular-nums"><span>{money(high, 5)}</span><span>{money(low, 5)}</span></div>
          <svg className="h-44 min-w-0 flex-1" viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Invoice-date price trend by supplier"><line x1="0" y1="140" x2="600" y2="140" stroke="var(--color-hairline)" vectorEffect="non-scaling-stroke" />{vendors.map(([id], index) => {
            const values = chartRows.filter(row => row.vendorId === id);
            return <g key={id} stroke={colors[index % colors.length]} fill={colors[index % colors.length]}><polyline fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" points={values.map(row => `${x(row.invoiceDate.getTime())},${y(row.price!)}`).join(" ")} />{values.map(row => <circle key={row.id} cx={x(row.invoiceDate.getTime())} cy={y(row.price!)} r="3"><title>{`${row.vendor.name} · ${row.invoiceDate.toISOString().slice(0, 10)} · ${money(row.price, 5)} / ${unit}`}</title></circle>)}</g>;
          })}</svg></div>
        <div className="ml-28 flex justify-between text-xs text-zinc-500"><span>{new Date(from).toISOString().slice(0, 10)}</span><span>{new Date(through).toISOString().slice(0, 10)}</span></div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">{vendors.map(([id, name], index) => <span key={id}><span aria-hidden="true" className="mr-2 inline-block h-2 w-3" style={{ backgroundColor: colors[index % colors.length] }} />{name}</span>)}</div>
      </figure>}
      <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-sm"><thead><tr><th>Invoice date</th><th>Supplier / invoice</th><th>Billed pack</th><th>Paid line total</th><th>Price / {unit}</th><th>Change</th></tr></thead><tbody>{[...rows].reverse().map(row => <tr key={row.id}><td className="whitespace-nowrap">{row.invoiceDate.toISOString().slice(0, 10)}</td><td>{row.vendor.name}<Link className="mt-1 block text-xs text-gold underline" href={`/vendors/invoices?id=${row.invoiceDocumentId}`}>{row.invoiceDocument.invoiceNumber || "Open invoice"}</Link></td><td>{preciseNum(row.quantity)} {row.purchaseUnit} × {preciseNum(row.packQty)} {row.packUnit}</td><td className="tabular-nums">{money(row.amountCents / 100)}{row.amountCents < 0 && <span className="block text-xs">Credit</span>}</td><td className="tabular-nums">{row.price == null ? `${money(row.normalizedUnitCost, 5)} / ${row.normalizedUnit} · different basis` : money(row.price, 5)}</td><td className="tabular-nums">{row.change == null ? "—" : `${row.change > 0 ? "+" : ""}${pct(row.change)}`}</td></tr>)}</tbody></table></div>
    </>}
  </div></Card>;
}
