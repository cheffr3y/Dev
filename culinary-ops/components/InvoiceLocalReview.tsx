"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Select } from "./ui";
import { useInvoiceDraft } from "./InvoiceDraftProvider";
import { measurementVersion } from "@/lib/ingredients/measurements";
import { reviewRowSchema } from "@/lib/invoices/review-draft";
import { ComboPicker } from "./ComboPicker";
import { useInvoiceSource } from "./InvoiceWorkspace";
import type { LocalInvoiceLine } from "@/lib/invoices/invoice-parser";
import { matchInvoiceLine, normalizeInvoiceCode, normalizeInvoiceText, type LocalMatch } from "@/lib/invoices/invoice-learning";
import { invoiceLineAmounts, invoiceLineReview } from "@/lib/invoices/invoice-review";
import { money } from "@/lib/recipes/costing";
import { priceVariance } from "@/lib/invoices/price-trends";
import type { loadLocalInvoice } from "@/lib/invoices/invoice-ocr-data";
type Data=Awaited<ReturnType<typeof loadLocalInvoice>>;
type Row=LocalInvoiceLine & { match:LocalMatch;itemId:string;ignored:boolean;remember:boolean;verified:boolean;purchaseId:string;message:string;newName:string;newUnit:string;eachWeightOz?:number|null; totalMode?:"calculated"|"entered"; changed?:boolean; manual?:boolean };
const number=(value:string)=>value.trim()===""?null:Number(value);
async function send(body:unknown){const response=await fetch("/api/invoice-ocr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Unable to save this edit.");return result;}
export function InvoiceLocalReview({invoiceId,vendorId,vendors,venues,defaults}:{invoiceId:string;vendorId:string|null;vendors:{id:string;name:string}[];venues:{id:string;name:string}[];defaults?:{date:string;venueId:string;vendorId?:string}}){
  const { draft, update: updateDraft, flush: saveDraft, recovered } = useInvoiceDraft();
  const recovery = useRef(draft);
  const router=useRouter(),[data,setData]=useState<Data|null>(null),[rows,setRows]=useState<Row[]>([]),[supplier,setSupplier]=useState(vendorId || draft.supplier || defaults?.vendorId || ""),[date,setDate]=useState(draft.date || defaults?.date || ""),[venue,setVenue]=useState(draft.venue || defaults?.venueId || ""),[usd,setUsd]=useState(false),[status,setStatus]=useState(""),[busy,setBusy]=useState<string|null>(null),[showIgnored,setShowIgnored]=useState(draft.showIgnored);
  const [selectedKey, setSelectedKey] = useState<string | null>(draft.selectedKey);
  const selectSourcePage = useInvoiceSource();
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const controller=useRef<AbortController|null>(null), pending=useRef(new Map(draft.pending.map(entry => [entry.key, {hash:entry.hash,operationId:entry.operationId}])));
  useEffect(()=>{const stop=new AbortController();void fetch(`/api/invoice-ocr?id=${encodeURIComponent(invoiceId)}&vendor=${encodeURIComponent(supplier)}`,{signal:stop.signal}).then(response=>response.json()).then((result:Data)=>{
    if(!result.ok)throw new Error("Could not load local recognition.");setData(result);
    setRows(previous=>previous.length?previous:(result.draft?.lines??[]).map(line=>{const match=result.matches.find(match=>match.key===line.key)!;const restored=recovery.current.sourceRevision === result.revision ? recovery.current.rows.find(saved=>saved.key===line.key) : undefined;return {...line,match,itemId:match.itemId??"",ignored:match.isIgnored,remember:true,purchaseId:crypto.randomUUID(),newName:line.rawDescription,newUnit:match.defaultPackUnit||line.packUnit||"",unit:line.unit||match.defaultUnit||"",packQty:line.packQty??match.defaultPackQty,packUnit:line.packUnit||match.defaultPackUnit||"",...restored,verified:false,message:""};}));
  }).catch(error=>{if(!stop.signal.aborted)setStatus(error.message);});return()=>stop.abort();},[invoiceId,supplier]);
  useEffect(() => {
    if (!data) return;
    updateDraft(previous => ({ ...previous, sourceRevision: data.revision, supplier, date, venue, selectedKey, showIgnored,
      rows: rows.filter(row=>!data.approved.includes(row.key)).map(row=>reviewRowSchema.parse(row)) }));
  }, [data, rows, supplier, date, venue, selectedKey, showIgnored, updateDraft]);
  function savePending() { updateDraft(previous => ({ ...previous, pending: [...pending.current].map(([key, value]) => ({ key, ...value })) })); }
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[busy]);
  const patch=(key:string,values:Partial<Row>)=>{setRows(previous=>previous.map(row=>row.key===key?{...row,...values,changed:true}:row));};
  async function recognize(){const abort=new AbortController();controller.current=abort;setBusy("ocr");setStatus("Reading stored invoice locally…");try{
    const file=await fetch(`/api/invoices/file?id=${encodeURIComponent(invoiceId)}`,{signal:abort.signal}).then(response=>{if(!response.ok)throw new Error("Stored invoice unavailable.");return response.blob();});
    const {recognizeInvoice}=await import("@/lib/invoices/invoice-ocr-browser");const draft=await recognizeInvoice(file,(message,fraction)=>setStatus(`${message}${fraction===undefined?"":` ${Math.round(fraction*100)}%`}`),abort.signal);
    await send({action:"draft",documentId:invoiceId,expectedRevision:data?.revision??0,pages:draft.pages});router.refresh();
    const result:Data=await fetch(`/api/invoice-ocr?id=${encodeURIComponent(invoiceId)}&vendor=${encodeURIComponent(supplier)}`).then(response=>response.json());setData(result);
    setRows((result.draft?.lines??[]).map(line=>{const match=result.matches.find(match=>match.key===line.key)!;return {...line,match,itemId:match.itemId??"",ignored:match.isIgnored,remember:true,verified:false,purchaseId:crypto.randomUUID(),message:"",newName:line.rawDescription,newUnit:line.packUnit,unit:line.unit||match.defaultUnit||"",packQty:line.packQty??match.defaultPackQty,packUnit:line.packUnit||match.defaultPackUnit||""};}));setStatus("Local draft ready. Verify each row against the invoice before approval.");
  }catch(error){setStatus(abort.signal.aborted?"Recognition cancelled. Manual entry remains available.":error instanceof Error?error.message:"Local recognition failed.");}finally{setBusy(null);}}
  function fields(row:Row){return {documentId:invoiceId,vendorId:supplier,key:row.key,rawCode:row.rawCode,description:row.rawDescription,itemId:row.itemId||null,isIgnored:row.ignored};}
  async function changeRowPresence(row: Row, action: "remove" | "restore") {
    setBusy(row.key);
    patch(row.key, { verified: false, message: "" });
    const payload = { action, documentId: invoiceId, key: row.key };
    const hash = JSON.stringify(payload), old = pending.current.get(row.key);
    const operationId = old?.hash === hash ? old.operationId : crypto.randomUUID();
    pending.current.set(row.key, { hash, operationId });
    savePending();
    try {
      await saveDraft();
      await send({ ...payload, operationId });
      pending.current.delete(row.key);
      savePending();
      setData(previous => previous ? { ...previous,
        ignored: action === "remove" ? [...new Set([...previous.ignored, row.key])] : previous.ignored.filter(key => key !== row.key),
        removed: action === "remove" ? [...new Set([...previous.removed, row.key])] : previous.removed.filter(key => key !== row.key),
      } : previous);
      if (action === "remove") advance(row.key);
      else selectRow(row);
      setStatus(action === "remove" ? "Line removed from review. Use Show removed or ignored rows to restore it." : "Line restored. Verify it against the invoice before approval.");
      router.refresh();
    } catch (error) {
      patch(row.key, { message: error instanceof Error ? error.message : "Could not save this change. Retry this row." });
    } finally { setBusy(null); }
  }
  async function operation(row:Row,action:"remember"|"ignore"|"createItem"){
    if(!supplier){patch(row.key,{message:"Choose the invoice supplier first."});return;}
    setBusy(row.key);
    const payload={action,...fields(row),...(action==="remember"?{}:{remember:row.remember}),...(action==="createItem"?{name:row.newName,unit:row.newUnit}: {})};
    const hash=JSON.stringify(payload), old=pending.current.get(row.key),operationId=old?.hash===hash?old.operationId:crypto.randomUUID();pending.current.set(row.key,{hash,operationId});savePending();
    try{await saveDraft();const result=await send({...payload,operationId});pending.current.delete(row.key);savePending();const ignored=action==="ignore"||row.ignored;const target=ignored?"":result.item?.id??row.itemId;
      if(result.alias)setData(previous=>previous?{...previous,aliases:[...previous.aliases.filter(alias=>alias.id!==result.alias.id && !(alias.vendorId===result.alias.vendorId && (alias.normalizedOcrText===result.alias.normalizedOcrText || result.alias.rawCode && alias.rawCode===result.alias.rawCode))),result.alias]}:previous);
      if(action==="ignore")setData(previous=>previous?{...previous,ignored:[...new Set([...previous.ignored,row.key])]}:previous);
      if(result.item){setData(previous=>previous?{...previous,items:[...previous.items,{...result.item,sku:null,vendorId:supplier}]}:previous);patch(row.key,{itemId:result.item.id,ignored:false,manual:!row.remember});}
      if(action==="remember"||row.remember) setRows(previous=>previous.map(candidate=>candidate.key===row.key || row.rawCode && normalizeInvoiceCode(candidate.rawCode)===normalizeInvoiceCode(row.rawCode) || normalizeInvoiceText(candidate.rawDescription)===normalizeInvoiceText(row.rawDescription)?{...candidate,itemId:target,ignored,manual:false,verified:false,match:{...candidate.match,confidence:"learned-exact",itemId:target||null,isIgnored:ignored,score:1},message:"Mapping remembered; quantities and prices still need review."}:candidate));
      patch(row.key,{message:action==="ignore"?"Ignored line saved.":action==="createItem"?"Ingredient created. Confirm its pack and paid price before approval.":"Mapping remembered."});
      if(action === "ignore") advance(row.key);
    }catch(error){patch(row.key,{message:error instanceof Error?error.message:"Learning failed. Retry this edit."});}finally{setBusy(null);}
  }
  function reviewLine(row: Row) {
    const review = invoiceLineReview(row, data?.items.find(item=>item.id===row.itemId));
    return { ...review, problems: [...review.problems,
      ...(!supplier ? ["Choose the invoice supplier."] : []),
      ...(!date ? ["Enter the invoice date."] : []),
      ...(!venue ? ["Choose the invoice venue."] : []),
      ...(!usd ? ["Confirm this invoice is in USD above the line list."] : []),
      ...(!row.verified ? ["Verify this line and conversion against the invoice."] : []),
    ] };
  }
  async function approve(row:Row){
    const review=reviewLine(row);
    if(review.problems.length){patch(row.key,{message:review.problems.join(" ")});return;}
    setBusy(row.key);try{await saveDraft();const response=await fetch("/api/invoice-purchases",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.purchaseId,invoiceDocumentId:invoiceId,revision:null,itemId:row.itemId,vendorId:supplier,venueId:venue,invoiceDate:date,description:row.rawDescription,rawCode:row.rawCode,billedUnitPrice:row.unitPrice,ocrLineKey:row.key,ocrReviewed:true,confirmedUsd:true,remember:row.remember,quantity:row.quantity,purchaseUnit:row.unit,packQty:row.packQty,packUnit:row.packUnit,amount:review.total?.toFixed(2)??"",expectedMeasurementVersion:measurementVersion(data?.items.find(item=>item.id===row.itemId)??{}),eachWeightOz:row.eachWeightOz??null,countsAsFood:true})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Approval failed.");setData(previous=>previous?{...previous,approved:[...new Set([...previous.approved,row.key])],ignored:previous.ignored.filter(key=>key!==row.key),items:result.catalogItem?previous.items.map(item=>item.id===result.catalogItem.id?{...item,...result.catalogItem}:item):previous.items}:previous);advance(row.key);router.refresh();setStatus("Approved. Current ingredient costs, recipe/menu margins and order guides now use eligible invoice pricing.");}catch(error){patch(row.key,{message:error instanceof Error && !/fetch|network/i.test(error.message)?error.message:"Connection interrupted. Retry this row; approval is idempotent."});}finally{setBusy(null);}
  }
  const options=data?.items.map(item=>({id:item.id,label:item.name,meta:`${money(item.unitCost,5)} / ${item.unit}`}))??[];
  const visible=rows.filter(row=>!data?.approved.includes(row.key)&&(showIgnored||!data?.ignored.includes(row.key)));
  const active = visible.find(row => row.key === selectedKey) ?? visible[0];
  const resolved = rows.filter(row => data?.approved.includes(row.key) || data?.ignored.includes(row.key)).length;
  function selectRow(row: Row) { setSelectedKey(row.key); selectSourcePage(row.page); }
  function advance(key: string) {
    const index = visible.findIndex(row => row.key === key);
    const next = visible.slice(index + 1).find(row => !data?.ignored.includes(row.key)) ?? visible.find(row => row.key !== key && !data?.ignored.includes(row.key));
    if (next) selectRow(next);
    else setSelectedKey(null);
  }
  useEffect(() => { reviewHeading.current?.focus({ preventScroll: true }); }, [active?.key]);
  const activePage = active?.page;
  const restoredSource = useRef(false);
  useEffect(() => { if (!activePage) return; if (!restoredSource.current) { restoredSource.current = true; return; } selectSourcePage(activePage); }, [activePage, selectSourcePage]);
  return <section className="my-4 min-w-0 space-y-4" aria-label="Local invoice OCR review">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 ref={reviewHeading} tabIndex={-1} className="font-semibold">{active ? `Line ${rows.indexOf(active) + 1} of ${rows.length}` : data?.draft ? rows.length ? "Review complete" : "No lines recognized" : "Prepare invoice"}</h3>{data?.draft && <Badge color={resolved === rows.length ? "green" : "blue"}>{rows.length ? `${resolved} of ${rows.length} resolved` : "Manual entry needed"}</Badge>}</div>
    {data?.draft && <div role="progressbar" aria-label="Invoice review progress" aria-valuenow={resolved} aria-valuemin={0} aria-valuemax={rows.length || 1} className="h-1.5 overflow-hidden rounded-full bg-stone"><div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${rows.length ? resolved / rows.length * 100 : 0}%` }} /></div>}
    {recovered && <p className="text-xs text-zinc-500">Your draft was restored. Verify the invoice currency and each line before approval.</p>}
    <button type="button" disabled={!!busy} className="text-sm text-blue-600 underline" onClick={async()=>{try{const response=await fetch(`/api/invoice-ocr?id=${encodeURIComponent(invoiceId)}&vendor=${encodeURIComponent(supplier)}`);const result:Data=await response.json();if(!response.ok||!result.ok)throw new Error("Could not refresh ingredient data.");setData(result);setRows(previous=>previous.map(row=>({...row,verified:false})));router.refresh();setStatus("Ingredient data refreshed. Verify each line before approval.");}catch(error){setStatus(error instanceof Error?error.message:"Refresh failed.");}}}>Refresh ingredient data</button>
    <details className="text-xs text-zinc-500"><summary className="cursor-pointer">Recognition details</summary><p className="mt-2">Recognition runs on this device. Matches are suggestions; review each price against the invoice.</p>{data?.draft && <p className="mt-1">Saved recognition reused · {rows.length} candidate lines</p>}</details>
    {!data?.draft&&<Button type="button" disabled={!!busy||!data} onClick={()=>void recognize()}>Run local invoice OCR</Button>}{busy==="ocr"&&<Button type="button" variant="secondary" onClick={()=>controller.current?.abort()}>Cancel OCR</Button>}
    {data?.draft&&<><p className="text-xs text-zinc-500" aria-live="polite">{data.approved.length} approved · {data.ignored.length - data.removed.length} ignored · {data.removed.length} removed · {rows.length - resolved} to review</p><label className="text-sm"><input type="checkbox" checked={showIgnored} onChange={event=>setShowIgnored(event.target.checked)} /> Show removed or ignored rows</label>
      <details open={!supplier || !date || !venue} className="rounded-lg border border-hairline p-3"><summary className="cursor-pointer text-sm font-medium">Invoice details{supplier && date && venue ? ` · ${date} · ${venues.find(option=>option.id===venue)?.name ?? ""}` : " · Choose supplier, date & venue"}</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm">Supplier<Select aria-label="OCR invoice supplier" value={supplier} disabled={!!vendorId||!!busy} onChange={event=>{setSupplier(event.target.value);setRows(previous=>previous.map(row=>({...row,verified:false})));}}><option value="">Choose supplier</option>{vendors.map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></label><label className="text-sm">Invoice date<Input aria-label="OCR invoice date" type="date" value={date} disabled={!!busy} onChange={event=>{setDate(event.target.value);setRows(previous=>previous.map(row=>({...row,verified:false})));}} /></label><label className="text-sm">Venue<Select aria-label="OCR venue" value={venue} disabled={!!busy} onChange={event=>{setVenue(event.target.value);setRows(previous=>previous.map(row=>({...row,verified:false})));}}><option value="">Choose venue</option>{venues.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</Select></label></div></details>
      <label className="block text-sm"><input type="checkbox" checked={usd} onChange={event=>setUsd(event.target.checked)} /> I verified this invoice is in USD</label>
      <nav aria-label="Invoice review lines" className="max-h-48 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">{visible.map(row => <button key={row.key} type="button" disabled={!!busy} aria-current={active?.key === row.key ? "step" : undefined} aria-label={`Review line ${row.page}-${row.lineNumber}: ${row.rawDescription}`} onClick={() => selectRow(row)} className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-stone ${active?.key === row.key ? "bg-blue-100" : "bg-canvas"}`}><span className="min-w-0"><span className="block truncate font-medium">{row.rawDescription || "Unnamed line"}</span><span className="text-xs text-zinc-500">Page {row.page} · {data.removed.includes(row.key) ? "Removed" : row.ignored ? "Ignored" : !row.itemId ? "Needs ingredient" : "Check pack & price"}</span></span><span className="shrink-0 tabular-nums">{money(invoiceLineAmounts(row).total)}</span></button>)}</nav>
      {visible.map(row=>{
        if (data.removed.includes(row.key)) return <form hidden={active?.key !== row.key} key={row.key} aria-label={`OCR row ${row.page}-${row.lineNumber}`} className="min-w-0 space-y-3 rounded border border-hairline p-3" onSubmit={event=>event.preventDefault()}>
          <div className="flex flex-wrap justify-between gap-2"><span className="text-xs">Page {row.page}, line {row.lineNumber}</span><Badge color="gray">Removed line</Badge></div>
          <p className="break-words text-base font-medium">{row.rawDescription}</p>
          <p className="text-sm text-zinc-500">Removed from this invoice review. The original document is preserved.</p>
          <Button type="button" variant="secondary" disabled={!!busy} onClick={()=>void changeRowPresence(row,"restore")}>Restore line</Button>
          {row.message&&<p role="status" className="break-words text-sm">{row.message}</p>}
        </form>;
        const item=data.items.find(item=>item.id===row.itemId);
        const {total,calculatedTotal,automatic,newPrice,problems,warnings,math}=reviewLine(row);
        const delta=item?priceVariance(item.unitCost,newPrice):null;
        const approvalHintId=`invoice-approval-${row.key}`;
        return <form hidden={active?.key !== row.key} key={row.key} aria-label={`OCR row ${row.page}-${row.lineNumber}`} className={`min-w-0 space-y-3 rounded border p-3 ${math?"border-amber-500":"border-hairline"}`} onSubmit={event=>{event.preventDefault();void approve(row);}}><fieldset disabled={!!busy} className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs">Page {row.page}, line {row.lineNumber}</span><div className="flex flex-wrap items-center gap-3"><Badge color={row.ignored?"gray":row.match.confidence==="unmatched"?"amber":"green"}>{row.ignored?"Ignored Line":row.manual?"Manual match":row.match.confidence==="learned-exact"?"Learned Alias":row.match.confidence==="unmatched"?"Unmatched":`Fuzzy Match (${Math.round(row.match.score*100)}%)`}</Badge>{!data.ignored.includes(row.key)&&<Button type="button" variant="secondary" onClick={()=>void changeRowPresence(row,"remove")}>Remove line</Button>}</div></div>
          <p className="text-base font-medium">{row.rawDescription}</p><p className="text-sm tabular-nums text-zinc-500">{row.quantity ?? "—"} {row.unit} × {money(row.unitPrice,5)} · Line total {money(total)}{automatic && total !== null ? " (calculated)" : ""}</p>
          <details open={math || row.warnings.length > 0 || automatic}><summary className="cursor-pointer text-sm text-blue-600">Edit recognized text &amp; amounts</summary><div className="mt-3 space-y-3"><details><summary className="cursor-pointer text-xs">Original recognized text</summary><p className="break-words whitespace-pre-wrap text-xs">{row.rawText}</p></details>
          <div className="grid min-w-0 gap-3 sm:grid-cols-3"><label className="text-sm">Raw code<Input aria-label="OCR raw code" value={row.rawCode??""} onChange={event=>patch(row.key,{rawCode:event.target.value||null,verified:false})} maxLength={100}/></label><label className="text-sm sm:col-span-2">Raw description<Input aria-label="OCR description" value={row.rawDescription} onChange={event=>patch(row.key,{rawDescription:event.target.value,verified:false})} required maxLength={500}/></label></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([['quantity','Quantity'],['unitPrice','Unit price'],['extendedPrice','Extended price']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<Input aria-label={`OCR ${label.toLowerCase()}`} type="number" step="any" value={(key==="extendedPrice"?total:row[key])??""} onChange={event=>patch(row.key,{[key]:number(event.target.value),...(key==="extendedPrice"?{totalMode:"entered" as const}:{}),verified:false})}/></label>)}<label className="text-sm">Billed unit<Input aria-label="OCR billed unit" value={row.unit} maxLength={40} onChange={event=>patch(row.key,{unit:event.target.value,verified:false})}/></label></div>
          {automatic ? <p className="text-xs text-zinc-500">{total === null ? "The line total will calculate when quantity and unit price are filled in." : `Calculated total: ${row.quantity} × ${money(row.unitPrice,5)} = ${money(total)}. Updates as you edit; enter a different total to override.`}</p> : calculatedTotal !== null && <button type="button" className="text-xs text-blue-600 underline" onClick={()=>patch(row.key,{totalMode:"calculated",verified:false})}>Use calculated total ({money(calculatedTotal)})</button>}
          {warnings.length>0&&<div className="text-xs text-amber-700">{warnings.map(warning=><p key={warning}>{warning}</p>)}</div>}
          </div></details>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Ingredient &amp; pack</p><ComboPicker key={row.key} valueId={row.itemId} ariaLabel="Override OCR ingredient" name="ocrItem" options={options} defaultId={row.itemId} onSelect={choice=>{const next={...row,itemId:choice?.id??"",ignored:false};patch(row.key,{itemId:next.itemId,ignored:false,verified:false,manual:true});if(next.remember&&next.itemId)void operation(next,"remember");}} />
          {item && <a className="block text-xs text-blue-600 underline" href={`/items/${item.id}#ingredient-measurements`} target="_blank" rel="noreferrer">Conversion &amp; yield settings ↗</a>}
          <div className="flex flex-wrap gap-3 text-xs"><button type="button" className="underline" onClick={()=>{const match=matchInvoiceLine(row.rawCode,row.rawDescription,supplier||null,data.aliases,data.items);patch(row.key,{match,itemId:match.itemId??"",ignored:match.isIgnored,verified:false});}}>Find match for edited text</button>{row.match.candidates.map(candidate=><button key={candidate.id} className="underline" type="button" onClick={()=>{const next={...row,itemId:candidate.id,ignored:false};patch(row.key,{itemId:candidate.id,ignored:false,verified:false,manual:true});if(row.remember)void operation(next,"remember");}}>{candidate.name}</button>)}</div>
          <label className="block text-sm"><input type="checkbox" checked={row.ignored} onChange={event=>{const next={...row,ignored:event.target.checked};patch(row.key,{ignored:next.ignored,verified:false});if(next.remember&&next.ignored)void operation(next,"remember");}} /> Ignore line (non-food / fee)</label>
          {!row.ignored&&<><div className="grid grid-cols-2 gap-3"><label className="text-sm">Contents per billed unit<Input aria-label="OCR pack quantity" type="number" step="any" min="0.000001" value={row.packQty??""} onChange={event=>patch(row.key,{packQty:number(event.target.value),verified:false})}/></label><label className="text-sm">Content unit<Input aria-label="OCR pack unit" value={row.packUnit} onChange={event=>patch(row.key,{packUnit:event.target.value,verified:false})} maxLength={40}/></label></div>{newPrice!==null&&<p className="text-sm tabular-nums">{newPrice<0?"Credit: saved as a paid-price observation, not a new catalog cost.":`New unit cost: ${money(newPrice,5)} / ${item!.unit}${delta===null?"":` (${delta>=0?"+":""}${delta.toFixed(1)}% vs current catalog)`}`}</p>}</>}
          {item?.eachWeightOz != null && <div className="space-y-2 rounded bg-stone p-3"><p className="text-sm">Purchased average: {item.eachWeightOz} oz / {item.eachLabel} · Usable yield {((item.yieldFactor??1)*100).toFixed(1)}% · <a className="text-blue-600 underline" href={`/items/${item.id}`} target="_blank" rel="noreferrer">Ingredient measurements</a></p><label className="block text-sm">Received average weight (oz / {item.eachLabel}), optional<Input aria-label="Invoice received each weight" type="number" min="0.000001" step="any" placeholder={String(item.eachWeightOz)} value={row.eachWeightOz??""} onChange={event=>patch(row.key,{eachWeightOz:number(event.target.value),verified:false})}/></label><p className="text-xs text-zinc-500">Overrides this invoice only. Purchased cost is normalized before recipe trim loss.</p></div>}
          <label className="block text-sm"><input type="checkbox" checked={row.remember} onChange={event=>patch(row.key,{remember:event.target.checked})}/> Remember for future invoices</label>
          {!row.ignored&&<details><summary className="cursor-pointer text-sm">+ Quick-Create Ingredient</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input aria-label="New OCR ingredient name" maxLength={500} value={row.newName} onChange={event=>patch(row.key,{newName:event.target.value})}/><Input aria-label="New OCR ingredient cost unit" maxLength={40} value={row.newUnit} placeholder="Cost unit, e.g. lb" onChange={event=>patch(row.key,{newUnit:event.target.value})}/></div><Button type="button" variant="secondary" className="mt-2" onClick={()=>void operation(row,"createItem")}>Create ingredient for this row</Button></details>}
          {row.ignored?<Button type="button" variant="secondary" onClick={()=>void operation(row,"ignore")}>Save ignored line</Button>:<><label className="block text-sm"><input type="checkbox" checked={row.verified} onChange={event=>patch(row.key,{verified:event.target.checked})}/> I verified this line and conversion against the invoice</label>{problems.length>0&&<div id={approvalHintId} aria-label="Needed to confirm this line" aria-live="polite" className="text-sm text-amber-700"><p className="font-medium">To confirm this line:</p><ul className="list-disc pl-5">{problems.map(problem=><li key={problem}>{problem}</li>)}</ul></div>}<Button aria-label="Approve invoice price" aria-describedby={problems.length?approvalHintId:undefined} disabled={problems.length>0}>Confirm line &amp; next →</Button></>}
        </fieldset>{row.message&&<p role="status" className="break-words text-sm">{row.message}</p>}</form>;
      })}
      {!visible.length&&<p className="text-sm">{rows.length ? "All candidate lines are resolved. Open Saved lines & food spending below to check the totals or correct a reviewed line." : "No candidate lines were found. Open Saved lines & food spending below and choose Add invoice line to enter this document manually."}</p>}
    </>}{status&&<p role="status" className="text-sm">{status}</p>}
  </section>;
}
