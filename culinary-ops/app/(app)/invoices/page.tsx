import { getVenues } from "@/lib/venues/venue";
import { loadInvoicePurchases } from "@/lib/invoices/invoice-purchases-data";
import { InvoicePurchaseReview } from "@/components/InvoicePurchaseReview";
import Link from "next/link";
import Form from "next/form";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { Badge, PageHeader, Card } from "@/components/ui";
import { InvoiceArchive } from "./InvoiceArchive";
import { reviewDraftSchema } from "@/lib/invoices/review-draft";
import { InvoiceDiscard } from "@/components/InvoiceDiscard";
import { InvoiceDraftProvider } from "@/components/InvoiceDraftProvider";
import { InvoiceWorkspace } from "@/components/InvoiceWorkspace";
import { InvoiceCompletion, type InvoiceCompletionData } from "@/components/InvoiceCompletion";
import { invoiceStateLabels, invoiceStates, type InvoiceState } from "@/lib/invoices/inbox";
import { affectedRecipes } from "@/lib/ingredients/measurement-impact";
import { measurementSelect } from "@/lib/ingredients/measurements";
import { money } from "@/lib/recipes/costing";

export default async function InvoicePage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; vendor?: string; sort?: string; state?: string; page?: string; discarded?: string }> }) {
  const user = await requirePrepUser("MANAGER");
  const { id, discarded, q = "", vendor = "", sort = "newest", state = "ALL", page = "1" } = await searchParams;
  const filter = invoiceStates.includes(state as InvoiceState) ? state as InvoiceState : null;
  const where = { reviewState: { not: "DISCARDED" }, ...(vendor ? { vendorId: vendor } : {}), ...(q ? { OR: [{ filename: { contains: q, mode: "insensitive" as const } }, { invoiceNumber: { contains: q, mode: "insensitive" as const } }, { vendor: { name: { contains: q, mode: "insensitive" as const } } }] } : {}) };
  const counts = await prisma.invoiceDocument.groupBy({ by: ["reviewState"], where, _count: true });
  const total = counts.reduce((sum, row) => sum + (!filter || row.reviewState === filter ? row._count : 0), 0);
  const pages = Math.max(1, Math.ceil(total / 25)), currentPage = Math.min(pages, Math.max(1, Number.isSafeInteger(Number(page)) ? Number(page) : 1));
  const listWhere = { ...where, ...(filter ? { reviewState: filter } : {}) };
  const order = sort === "oldest" ? "asc" as const : "desc" as const;
  function href(patch: Record<string, string | null> = {}) {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(vendor ? { vendor } : {}), sort, ...(filter ? { state: filter } : {}), ...(currentPage > 1 ? { page: String(currentPage) } : {}) });
    for (const [key, value] of Object.entries(patch)) { if (value == null) params.delete(key); else params.set(key, value); }
    return `/invoices${params.size ? `?${params}` : ""}${patch.id ? "#invoice-review" : "#invoice-inbox"}`;
  }
  const [documents, vendors, selected] = await Promise.all([
    prisma.invoiceDocument.findMany({ where: listWhere, orderBy: [{ createdAt: order }, { id: order }], take: 25, skip: (currentPage - 1) * 25,
      select: { id: true, filename: true, vendor: { select: { name: true } }, invoiceNumber: true, reviewState: true, candidateLineCount: true, reviewedCandidateCount: true, lineRevision: true,
        foodExpense: { select: { voided: true, amountCents: true, invoiceLineRevision: true } }, _count: { select: { purchaseLines: { where: { voided: false, countsAsFood: true } } } } } }),
    prisma.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    id ? prisma.invoiceDocument.findFirst({ where: { id, reviewState: { not: "DISCARDED" } }, select: { id: true, filename: true, mime: true, pages: true, vendor: { select: { name: true } }, vendorId: true, lineRevision: true, ocrRevision: true, invoiceNumber: true, notes: true, reviewState: true } }) : null,
  ]);
  const review = selected ? await Promise.all([
    loadInvoicePurchases(selected.id), getVenues({ includeLegacy: true }),
    prisma.item.findMany({ select: { id: true, name: true, unit: true, unitCost: true, ...measurementSelect, sku: true, gcode: true, vendorId:true,vendor: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.operatingFoodExpense.findUnique({ where: { invoiceDocumentId: selected.id } }),
    prisma.invoiceReviewDraft.findUnique({ where: { userId_documentId: { userId: user.id, documentId: selected.id } } }),
    prisma.invoiceItemAlias.findMany({where:{vendorId:selected.vendorId,isIgnored:false,itemId:{not:null}},orderBy:[{hitCount:"desc"},{updatedAt:"desc"}],select:{itemId:true,rawCode:true,defaultUnit:true,defaultPackQty:true,defaultPackUnit:true}}),
  ]) : null;
  const parsedDraft = reviewDraftSchema.safeParse(review?.[4]?.payload);
  const initialDraft = review?.[4] && parsedDraft.success ? { revision: review[4].revision, payload: parsedDraft.data } : null;
  const spending = review?.[3];
  const expense = spending ? { ...spending, invoiceDate: spending.invoiceDate.toISOString().slice(0, 10), invoiceReviewPending: spending.invoiceLineRevision != null && spending.invoiceLineRevision !== selected?.lineRevision } : null;
  let completion: InvoiceCompletionData | null = null;
  if (selected && review && ["READY", "COMPLETE"].includes(selected.reviewState)) {
    const [changes, graph, next, ignored] = await Promise.all([
      prisma.invoicePriceChange.findMany({ where: { invoiceDocumentId: selected.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.recipe.findMany({ select: { id: true, name: true, items: { select: { itemId: true } }, components: { select: { childId: true } } } }),
      prisma.invoiceDocument.findFirst({ where: { ...where, id: { not: selected.id }, reviewState: { notIn: ["COMPLETE", "DISCARDED"] } }, orderBy: [{ createdAt: order }, { id: order }], select: { id: true } }),
      prisma.invoiceOcrDecision.count({ where: { documentId: selected.id, lineKey:{notIn:review[0].flatMap(line=>line.ocrLineKey?[line.ocrLineKey]:[])} } }),
    ]);
    // Price history is grouped by its captured rate unit, never comparing unlike bases.
    const priceGroups = new Map<string, InvoiceCompletionData["changes"][number]>();
    for (const change of changes) { const key = `${change.itemId}:${change.unit}`, previous = priceGroups.get(key); priceGroups.set(key, { id: change.itemId, name: review[2].find(item => item.id === change.itemId)?.name ?? "Archived ingredient", unit: change.unit, before: previous?.before ?? change.beforeCost, after: change.afterCost }); }
    const changed = [...priceGroups.values()].filter(change => change.before !== change.after);
    const active = review[0].filter(line => !line.voided), food = active.filter(line => line.countsAsFood);
    completion = { id: selected.id, reviewState: selected.reviewState, lineRevision: selected.lineRevision, ocrRevision: selected.ocrRevision, saved: active.length, voided: review[0].length - active.length, ignored,
      foodTotal: food.reduce((sum, line) => sum + line.amountCents, 0), accounting: !food.length ? "not_needed" : !expense || expense.voided || expense.invoiceLineRevision == null ? "unconfirmed" : expense.invoiceReviewPending ? "changed" : "current",
      changes: changed, recipes: affectedRecipes(graph, changed.map(change => change.id)).map(recipe => ({ id: recipe.id, name: recipe.name })), nextHref: next ? href({ id: next.id, page: null, state: null }) : null, inboxHref: href() };
  }
  const inbox = <section id="invoice-inbox" aria-label="Invoice inbox" className="scroll-mt-20 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Invoice inbox</h2><span className="text-sm text-zinc-500">{total} invoices · Page {currentPage} of {pages}</span></div>
    <nav aria-label="Invoice status filters" className="flex flex-wrap gap-2">{[null, ...invoiceStates].map(value => <Link key={value ?? "ALL"} aria-current={value === filter ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${value === filter ? "border-primary bg-primary text-white" : "border-hairline bg-canvas"}`} href={href({ state: value, page: null })}>{value ? invoiceStateLabels[value] : "All"} · {counts.reduce((sum, row) => sum + (!value || row.reviewState === value ? row._count : 0), 0)}</Link>)}</nav>
    <Form action="/invoices" className="flex flex-wrap items-end gap-3">
      {id && <input type="hidden" name="id" value={id} />}{filter && <input type="hidden" name="state" value={filter} />}
      <label className="text-sm">Search invoices<input key={q} className="ml-2 rounded border border-hairline bg-canvas p-2" name="q" defaultValue={q} /></label>
      <label className="text-sm">Vendor<select aria-label="Filter invoice vendor" key={vendor} className="ml-2 rounded border border-hairline bg-canvas p-2" name="vendor" defaultValue={vendor}><option value="">All vendors</option>{vendors.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="text-sm">Order<select aria-label="Invoice order" key={sort} className="ml-2 rounded border border-hairline bg-canvas p-2" name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><button className="rounded border border-hairline px-3 py-2 text-sm" type="submit">Filter invoices</button>
    </Form>
    <Card className="overflow-hidden"><table className="block w-full text-left text-sm md:table"><thead className="hidden md:table-header-group"><tr><th className="p-3">Invoice</th><th>Review</th><th>Progress</th><th>Accounting</th></tr></thead><tbody className="block md:table-row-group">{documents.map(document => <tr key={document.id} className="grid grid-cols-2 border-t border-hairline md:table-row"><td className="col-span-2 min-w-0 break-words p-3 md:max-w-64"><Link className="text-blue-600 underline" href={href({ id: document.id })}>{document.filename}</Link><p className="mt-1 text-xs text-zinc-500">{document.vendor?.name ?? "Unassigned vendor"}{document.invoiceNumber ? ` · ${document.invoiceNumber}` : ""}</p></td><td className="min-w-0 px-3 pb-3 md:p-3"><span className="mb-1 block text-xs text-zinc-500 md:hidden">Review</span><Badge color={document.reviewState === "COMPLETE" ? "green" : document.reviewState === "NEEDS_ATTENTION" ? "amber" : "blue"}>{invoiceStateLabels[document.reviewState as InvoiceState] ?? "Needs review"}</Badge></td><td className="min-w-0 px-3 pb-3 md:p-3"><span className="mb-1 block text-xs text-zinc-500 md:hidden">Progress</span>{document.candidateLineCount ? `${document.reviewedCandidateCount} / ${document.candidateLineCount} lines resolved` : "Manual review / recognition pending"}</td><td className="col-span-2 px-3 pb-3 md:p-3"><span className="mb-1 block text-xs text-zinc-500 md:hidden">Accounting</span>{document.foodExpense && !document.foodExpense.voided ? <><span className="tabular-nums">{money(document.foodExpense.amountCents / 100)}</span><span className="block text-xs text-zinc-500">{document.foodExpense.invoiceLineRevision === document.lineRevision ? "Confirmed" : "Reconfirmation needed"}</span></> : document._count.purchaseLines === 0 && ["COMPLETE", "READY"].includes(document.reviewState) ? "No food lines" : "Not confirmed"}</td></tr>)}</tbody></table>{!documents.length && <p className="p-5 text-sm text-zinc-500">No invoices match this view.</p>}</Card>
    {pages > 1 && <nav aria-label="Invoice pages" className="flex justify-between text-sm">{currentPage > 1 ? <Link href={href({ page: String(currentPage - 1) })}>← Previous page</Link> : <span />}{currentPage < pages && <Link href={href({ page: String(currentPage + 1) })}>Next page →</Link>}</nav>}
  </section>;
  return <div className="space-y-5"><PageHeader title="Invoices" subtitle="Review purchases, protect ingredient costs, and keep accounting clear." action={<Link href="#invoice-upload" className="text-sm text-blue-600 underline">Add invoices →</Link>} />
    {discarded === "1" && !selected && <p role="status" className="text-sm">Invoice discarded. Upload an invoice below to start fresh.</p>}
    {!selected && inbox}
    <div id="invoice-upload"><InvoiceArchive vendors={vendors} compact={!!selected} /></div>
    {id && !selected && <p role="alert" className="text-sm">Invoice not found.</p>}
    {selected && review && <div id="invoice-review" className="scroll-mt-20"><InvoiceDraftProvider key={selected.id} documentId={selected.id} sourceRevision={selected.ocrRevision} initial={initialDraft}>
      <InvoiceDiscard documentId={selected.id} filename={selected.filename} lineRevision={selected.lineRevision} ocrRevision={selected.ocrRevision} savedLines={review[0].filter(line => !line.voided).length} expense={spending ? { revision: spending.revision, active: !spending.voided, amountCents: spending.amountCents } : null} />
      {completion && <InvoiceCompletion data={completion} />}
      <InvoiceWorkspace document={selected}><InvoicePurchaseReview defaultVenueId={user.homeVenueId} invoice={{ id: selected.id, filename: selected.filename, vendor: selected.vendor?.name ?? null, invoiceNumber: selected.invoiceNumber }} vendorId={selected.vendorId} lineRevision={selected.lineRevision} lines={review[0]} expense={expense} vendors={vendors} venues={review[1].map(venue => ({ id: venue.id, name: venue.name }))} items={review[2].map(item => {const learned=review[5].find(alias=>alias.itemId===item.id);return { ...item, label: item.name, meta: `${item.unit} · ${item.vendor?.name ?? "No catalog vendor"}`, keywords: [item.sku, item.gcode, item.vendor?.name].filter(Boolean).join(" "),invoiceDefaults:learned?{unit:learned.defaultUnit,packQty:learned.defaultPackQty,packUnit:learned.defaultPackUnit,rawCode:learned.rawCode}:null };})} /></InvoiceWorkspace>
    </InvoiceDraftProvider></div>}
    {selected && inbox}
  </div>;
}
