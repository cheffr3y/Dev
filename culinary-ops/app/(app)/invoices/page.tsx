import { getVenues } from "@/lib/venues/venue";
import { loadInvoicePurchases } from "@/lib/invoices/invoice-purchases-data";
import { InvoicePurchaseReview } from "@/components/InvoicePurchaseReview";
import Link from "next/link";
import Form from "next/form";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, Card } from "@/components/ui";
import { InvoiceArchive } from "./InvoiceArchive";
const size=(bytes:number)=>bytes<1024*1024?`${Math.round(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;
export default async function InvoicePage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; vendor?: string; sort?: string }> }) {
 await requirePrepUser("MANAGER");const {id, q = "", vendor = "", sort = "newest"}=await searchParams;
 const [documents,vendors,selected]=await Promise.all([
  prisma.invoiceDocument.findMany({where:{...(vendor ? { vendorId: vendor } : {}), ...(q ? { OR: [{ filename: { contains: q, mode: "insensitive" } }, { invoiceNumber: { contains: q, mode: "insensitive" } }, { vendor: { name: { contains: q, mode: "insensitive" } } }] } : {})},orderBy:{createdAt:sort === "oldest" ? "asc" : "desc"},take:50,select:{id:true,filename:true,storedBytes:true,pages:true,createdAt:true,vendor:{select:{name:true}},invoiceNumber:true}}),
  prisma.vendor.findMany({select:{id:true,name:true},orderBy:{name:"asc"}}),
  id?prisma.invoiceDocument.findUnique({where:{id},select:{id:true,filename:true,mime:true,originalBytes:true,storedBytes:true,pages:true,createdAt:true,vendor:{select:{name:true}},vendorId:true,lineRevision:true,invoiceNumber:true,notes:true}}):null,
 ]);
 const review = selected ? await Promise.all([
  loadInvoicePurchases(selected.id), getVenues({ includeLegacy: true }),
  prisma.item.findMany({ select: { id: true, name: true, unit: true, unitCost: true, sku: true, gcode: true, vendor: { select: { name: true } } }, orderBy: { name: "asc" } }),
  prisma.operatingFoodExpense.findUnique({ where: { invoiceDocumentId: selected.id } }),
 ]) : null;
 const spending = review?.[3];
 const expense = spending ? { ...spending, invoiceDate: spending.invoiceDate.toISOString().slice(0, 10), invoiceReviewPending: spending.invoiceLineRevision != null && spending.invoiceLineRevision !== selected?.lineRevision } : null;
 return <div><PageHeader title="Invoices" subtitle="Store invoices, match ingredients, track paid prices, and review food spending." /><InvoiceArchive vendors={vendors}/>
 {id&&!selected&&<p role="alert" className="mt-4 text-sm">Invoice not found.</p>}
 {selected&&<Card className="mt-5 space-y-3 p-5"><h2 className="break-words font-semibold">{selected.filename}</h2><p role="status" className="text-sm">Stored · {selected.pages} page{selected.pages===1?"":"s"} · {size(selected.storedBytes)}{selected.storedBytes<selected.originalBytes?` (${Math.round((1-selected.storedBytes/selected.originalBytes)*100)}% smaller)`:""}</p><p className="text-sm text-zinc-500">{selected.vendor?.name??"Unassigned vendor"}{selected.invoiceNumber?` · ${selected.invoiceNumber}`:""}</p>{selected.notes&&<p className="whitespace-pre-wrap text-sm">{selected.notes}</p>}
 <div className="flex flex-wrap gap-4 text-sm text-blue-600 underline"><a href={`/api/invoices/file?id=${selected.id}`} target="_blank" rel="noreferrer">Open full invoice</a><a href={`/api/invoices/file?id=${selected.id}&download=1`}>Download stored copy</a></div>
 <p className="text-xs text-zinc-500">First-page preview. Open the full invoice to check small print and all pages.</p>
 {/* The authenticated document endpoint supplies the stored preview. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <a href={`/api/invoices/file?id=${selected.id}`} target="_blank" rel="noreferrer"><img src={`/api/invoices/file?id=${selected.id}&preview=1`} alt={`First page of ${selected.filename}`} className="mt-2 h-auto max-w-full rounded border border-hairline" /></a>
 </Card>}
 {selected && review && <InvoicePurchaseReview invoice={{ id: selected.id, filename: selected.filename, vendor: selected.vendor?.name ?? null, invoiceNumber: selected.invoiceNumber }} vendorId={selected.vendorId} lineRevision={selected.lineRevision} lines={review[0]} expense={expense} vendors={vendors} venues={review[1].map(v => ({ id: v.id, name: v.name }))} items={review[2].map(item => ({ id: item.id, label: item.name, unit: item.unit, unitCost: item.unitCost, meta: `${item.unit} · ${item.vendor?.name ?? "No catalog vendor"}`, keywords: [item.sku, item.gcode, item.vendor?.name].filter(Boolean).join(" ") }))} />}
 <Form action="/invoices" className="mt-5 flex flex-wrap gap-3">
 {id && <input type="hidden" name="id" value={id} />}
 <label>Search invoices<input key={q} className="ml-2 rounded border p-2" name="q" defaultValue={q} /></label>
 <label>Vendor<select aria-label="Filter invoice vendor" key={vendor} className="ml-2 rounded border p-2" name="vendor" defaultValue={vendor}><option value="">All vendors</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>Order<select aria-label="Invoice order" key={sort} className="ml-2 rounded border p-2" name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
 <button className="rounded border px-3" type="submit">Filter invoices</button>
 </Form>
 <Card className="mt-5 overflow-x-auto p-4"><h2 className="mb-3 font-semibold">Recent invoices</h2><table className="w-full text-left text-sm"><thead><tr><th>Document</th><th>Vendor / reference</th><th>Pages</th><th>Stored size</th></tr></thead><tbody>{documents.map(document=><tr key={document.id}><td className="max-w-64 break-words"><Link className="text-blue-600 underline" href={`/invoices?${new URLSearchParams({ ...(q ? {q} : {}), ...(vendor ? {vendor} : {}), sort, id: document.id })}`}>{document.filename}</Link></td><td>{document.vendor?.name??"Unassigned"}{document.invoiceNumber?` · ${document.invoiceNumber}`:""}</td><td>{document.pages}</td><td className="tabular-nums">{size(document.storedBytes)}</td></tr>)}</tbody></table>{!documents.length&&<p className="text-sm text-zinc-500">No invoices stored yet.</p>}</Card></div>;
}
