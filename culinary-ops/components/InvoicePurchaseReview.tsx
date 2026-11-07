"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { measurementVersion, type IngredientMeasure } from "@/lib/ingredients/measurements";
import { invoiceLineAmounts, invoiceLineReview } from "@/lib/invoices/invoice-review";
import { formatInvoicePack, invoiceDetailsFromText, invoicePackDefaults, parseInvoicePack, type InvoicePack } from "@/lib/invoices/invoice-workflow";
import { invoiceGarbage } from "@/lib/invoices/invoice-layout";
import { matchInvoiceLine } from "@/lib/invoices/invoice-learning";
import { reviewRowSchema, type ReviewRowDraft } from "@/lib/invoices/review-draft";
import { priceVariance } from "@/lib/invoices/price-trends";
import { gridNavigation } from "@/lib/workspace/grid-navigation";
import { money } from "@/lib/recipes/costing";
import type { LocalInvoiceLine } from "@/lib/invoices/invoice-parser";
import type { loadLocalInvoice } from "@/lib/invoices/invoice-ocr-data";
import { invoiceNormalizationMeasure } from "@/lib/invoices/invoice-purchases";
import type { InvoicePurchaseData, InvoicePurchaseInput } from "@/lib/invoices/invoice-purchases";
import type { FoodExpenseData } from "@/lib/accounting/operating-calendar";
import type { InvoiceChoice } from "./OperatingEntryForms";
import { Badge, Button, Input, Select } from "./ui";
import { ComboPicker, type ComboOption } from "./ComboPicker";
import { useInvoiceDraft } from "./InvoiceDraftProvider";
import { useInvoiceSource } from "./InvoiceWorkspace";

type Data = Awaited<ReturnType<typeof loadLocalInvoice>>;
type Item = ComboOption & IngredientMeasure & { unit?:string; unitCost?:number; sku?:string|null; vendorId?:string|null; invoiceDefaults?:InvoicePack|null };
type Row = ReviewRowDraft & { page:number; rawText:string; bbox?:LocalInvoiceLine["bbox"]; warnings:string[]; confidence:string };
const numeric = (value:string) => value.trim() === "" ? null : Number(value);
const cellClass = "w-full min-w-0 rounded border border-hairline bg-transparent px-2 py-2 text-base focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus md:border-transparent md:py-1 md:text-sm md:hover:border-hairline";
const mobileLabel = "mb-1 block text-xs font-medium text-zinc-500 md:hidden";

export function InvoicePurchaseReview({invoice,vendorId,lineRevision,lines,expense,vendors,venues,items,defaultVenueId}: {
  invoice:InvoiceChoice; vendorId:string|null; lineRevision:number; lines:InvoicePurchaseData[]; expense:FoodExpenseData|null;
  vendors:{id:string;name:string}[]; venues:{id:string;name:string}[]; items:Item[]; defaultVenueId?:string|null;
}) {
  const {draft,update,flush,recovered} = useInvoiceDraft();
  const recovery = useRef(draft), initialLines = useRef(lines);
  const [data,setData] = useState<Data|null>(null), [rows,setRows] = useState<Row[]>([]), [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false), [recognizing,setRecognizing] = useState(false), [status,setStatus] = useState(""), [selected,setSelected] = useState<string|null>(draft.selectedKey);
  const [revision,setRevision] = useState(lineRevision), [expenseRevision,setExpenseRevision] = useState(expense?.revision??null);
  const source = useInvoiceSource(), router = useRouter(), grid = useRef<HTMLDivElement>(null), abort = useRef<AbortController|null>(null);
  const supplier = draft.supplier || vendorId || lines[0]?.vendorId || "";
  const date = draft.date, venue = draft.venue;
  const catalog:Item[] = data ? data.items.map(item=>({...items.find(original=>original.id===item.id),...item,label:item.name})) : items;

  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/invoice-ocr?id=${encodeURIComponent(invoice.id)}&vendor=${encodeURIComponent(supplier)}`,{signal:controller.signal}).then(async response=>{
      const result:Data=await response.json(); if(!response.ok||!result.ok)throw new Error("Could not load invoice recognition.");
      setData(result);
      const suggestions=invoiceDetailsFromText(result.draft?.pages??[],venues);
      update(previous=>({...previous,supplier:previous.supplier||vendorId||initialLines.current[0]?.vendorId||"",date:previous.date||initialLines.current[0]?.invoiceDate||expense?.invoiceDate||suggestions.date,venue:previous.venue||initialLines.current[0]?.venueId||expense?.venueId||suggestions.venueId||defaultVenueId||""}));
      setRows(previous=>{
        if(previous.length)return previous;
        const savedDraft=recovery.current.sourceRevision===result.revision?recovery.current.rows:[];
        const saved = initialLines.current.map(line=>{
          const ocr=result.draft?.lines.find(source=>source.key===line.ocrLineKey);
          return {...ocr,key:line.ocrLineKey||`saved-${line.id}`,purchaseId:line.id,savedRevision:line.revision,itemId:line.itemId||"",rawCode:line.rawCode,rawDescription:line.description,eachWeightOz:line.eachWeightOz??null,quantity:line.quantity,unit:line.purchaseUnit,unitPrice:line.billedUnitPrice,extendedPrice:line.amountCents/100,totalMode:"entered" as const,packQty:line.packQty,packUnit:line.packUnit,packText:formatInvoicePack({unit:line.purchaseUnit,packQty:line.packQty,packUnit:line.packUnit}),ignored:line.voided||!line.countsAsFood,remember:true,newName:line.description,newUnit:line.packUnit,page:ocr?.page??1,rawText:ocr?.rawText||line.description,warnings:[],confidence:"Saved",...savedDraft.find(row=>row.purchaseId===line.id)};
        });
        const extracted=(result.draft?.lines??[]).filter(line=>!initialLines.current.some(saved=>saved.ocrLineKey===line.key)).map(line=>{
          const match=result.matches.find(match=>match.key===line.key)!;
          const item=result.items.find(item=>item.id===match.itemId), original=items.find(item=>item.id===match.itemId);
          const defaults=invoicePackDefaults(line.unit||match.defaultUnit||"",item,match.defaultPackQty?{unit:match.defaultUnit,packQty:match.defaultPackQty,packUnit:match.defaultPackUnit}:original?.invoiceDefaults?.packQty?original.invoiceDefaults:item?.invoiceDefaults);
          const pack={unit:line.unit||defaults.unit,packQty:line.packQty??defaults.packQty,packUnit:line.packUnit||defaults.packUnit};
          return {...line,...pack,purchaseId:crypto.randomUUID(),savedRevision:null,itemId:match.itemId||"",ignored:!!line.ignored||invoiceGarbage.test(line.rawText)||match.isIgnored||result.ignored.includes(line.key),remember:true,newName:line.rawDescription,newUnit:line.packUnit,confidence:match.confidence==="learned-exact"?"Alias":match.itemId?"Fuzzy":"Unmatched",packText:formatInvoicePack(pack),...savedDraft.find(row=>row.key===line.key)};
        });
        const known = new Set([...saved,...extracted].map(row=>row.key));
        const manual=savedDraft.filter(row=>!known.has(row.key)&&row.key.startsWith("manual-")).map(row=>({...row,page:1,rawText:row.rawDescription,warnings:[],confidence:row.itemId?"Selected":"Unmatched"}));
        return [...saved,...extracted,...manual];
      });
      setLoaded(true);
    }).catch(error=>{if(!controller.signal.aborted)setStatus(error.message);});
    return ()=>controller.abort();
  },[invoice.id,supplier,vendorId,venues,defaultVenueId,expense?.invoiceDate,expense?.venueId,items,update]);

  useEffect(()=>{
    if(!loaded||!data)return;
    update(previous=>({...previous,sourceRevision:data.revision,selectedKey:selected,rows:rows.map(row=>reviewRowSchema.parse(row))}));
  },[rows,loaded,data,selected,update]);
  useEffect(()=>()=>abort.current?.abort(),[]);
  function patch(key:string,values:Partial<Row>) { setRows(previous=>previous.map(row=>row.key===key?{...row,...values}:row)); }
  function focusRow(row:Row) { setSelected(row.key); source(row.page,row.bbox); }
  function ingredient(row:Row,itemId:string) {
    if(!itemId){patch(row.key,{itemId:"",confidence:"Unmatched"});return;}
    const item=catalog.find(item=>item.id===itemId);
    const alias=data?.aliases.find(alias=>alias.itemId===itemId&&alias.vendorId===supplier&&!alias.isIgnored);
    const remembered=alias?.defaultPackQty?{unit:alias.defaultUnit,packQty:alias.defaultPackQty,packUnit:alias.defaultPackUnit}:item?.invoiceDefaults;
    const pack=invoicePackDefaults(remembered?.unit||row.unit,item,remembered);
    // A deliberate selection uses the ingredient's saved pack; keep OCR contents when no default exists.
    const next={unit:pack.unit||row.unit,packQty:pack.packQty??row.packQty,packUnit:pack.packQty?pack.packUnit:row.packUnit};
    patch(row.key,{itemId,ignored:false,manual:true,confidence:"Selected",...next,packText:formatInvoicePack(next)});
  }
  function review(row:Row) {
    const item=catalog.find(item=>item.id===row.itemId);
    const saved=lines.find(line=>line.id===row.purchaseId);
    const basis=item?.unit?invoiceNormalizationMeasure({...item,unit:item.unit},saved,{itemId:row.itemId,quantity:row.quantity??0,packQty:row.packQty??0,packUnit:row.packUnit,eachWeightOz:row.eachWeightOz}).measure:{};
    const result=invoiceLineReview(row,item?.unit?{...item,...basis,unit:item.unit}:null);
    return {...result,problems:[...result.problems,...(!parseInvoicePack(row.packText||"")?["Use a pack such as 16 oz x 16 or case (5 lb)."]:[])]};
  }
  const reviewed = rows.map(row => ({ row, result: review(row) }));
  const visible = reviewed.filter(({ row }) => draft.showIgnored || !row.ignored);
  const ready = reviewed.filter(({ row, result }) => !row.ignored && !result.problems.length).map(({ row }) => row);
  const remaining = reviewed.filter(({ row, result }) => !row.ignored && result.problems.length).map(({ row }) => row);
  const missingDetails = [!supplier && "supplier", !venue && "venue", !date && "invoice date"].filter(Boolean);
  const total=rows.filter(row=>!row.ignored).reduce((sum,row)=>sum+Math.round((invoiceLineAmounts(row).total??0)*100),0);
  const comparison=draft.invoiceTotal?.trim()?Math.round(Number(draft.invoiceTotal)*100)-total:null;
  const ignoredKeys=rows.filter(row=>row.ignored&&row.savedRevision==null&&!row.key.startsWith("manual-")).map(row=>row.key);

  async function recognize() {
    const controller=new AbortController();abort.current=controller;setBusy(true);setRecognizing(true);setStatus("Reading stored invoice locally…");
    try {
      await flush();
      const response=await fetch(`/api/invoices/file?id=${encodeURIComponent(invoice.id)}`,{signal:controller.signal});
      if(!response.ok)throw new Error("Stored invoice unavailable.");
      const {recognizeInvoice}=await import("@/lib/invoices/invoice-ocr-browser");
      const recognized=await recognizeInvoice(await response.blob(),(message,fraction)=>setStatus(`${message}${fraction==null?"":` ${Math.round(fraction*100)}%`}`),controller.signal);
      const saved=await fetch("/api/invoice-ocr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"draft",documentId:invoice.id,expectedRevision:data?.revision??0,pages:recognized.pages})});
      const result=await saved.json();if(!saved.ok||!result.ok)throw new Error(result.error||"Could not save recognition.");
      // Reload only after recognition is durably stored; draft recovery retains manual entries.
      const refreshed=await fetch(`/api/invoice-ocr?id=${encodeURIComponent(invoice.id)}&vendor=${encodeURIComponent(supplier)}`).then(response=>response.json()) as Data;
      if(!refreshed.ok)throw new Error("Could not reload recognition.");
      setData(refreshed);
      update(previous=>({...previous,sourceRevision:refreshed.revision}));
      await flush();
      window.location.reload();
    } catch(error) {setStatus(controller.signal.aborted?"Recognition cancelled.":error instanceof Error?error.message:"Recognition failed.");}
    finally {setBusy(false);setRecognizing(false);}
  }
  async function approve() {
    setBusy(true);setStatus("");
    try {
      const inputs:InvoicePurchaseInput[]=rows.filter(row=>ready.includes(row)||row.savedRevision!=null&&row.ignored).map(row=>({
        id:row.purchaseId,invoiceDocumentId:invoice.id,revision:row.savedRevision??null,itemId:row.itemId||null,vendorId:supplier,venueId:venue,invoiceDate:date,
        description:row.rawDescription,rawCode:row.rawCode,ocrLineKey:data?.draft?.lines.some(line=>line.key===row.key)?row.key:null,ocrReviewed:true,confirmedUsd:true,remember:row.remember,
        quantity:row.quantity!,purchaseUnit:row.unit,packQty:row.packQty!,packUnit:row.packUnit,amount:invoiceLineAmounts(row).total!.toFixed(2),billedUnitPrice:row.unitPrice,
        expectedMeasurementVersion:measurementVersion(catalog.find(item=>item.id===row.itemId)??{}),eachWeightOz:row.eachWeightOz??null,countsAsFood:!row.ignored,
        voided:!!lines.find(line=>line.id===row.purchaseId)?.voided&&row.ignored,reason:"Reviewed inline invoice grid correction"
      }));
      const body={documentId:invoice.id,expectedLineRevision:revision,lines:inputs,ignoredKeys,commit:remaining.length===0,expenseId:expense?.id||`invoice:${invoice.id}`,expenseRevision};
      const hash=JSON.stringify(body),previous=draft.pending.find(entry=>entry.key==="grid-batch");
      const operationId=previous?.hash===hash?previous.operationId:crypto.randomUUID();
      // Keep the full request identity for lost-response retries without exceeding draft limits.
      const signature=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(hash));
      const digest=Array.from(new Uint8Array(signature),n=>n.toString(16).padStart(2,"0")).join("");
      const stableId=previous?.hash===digest?previous.operationId:operationId;
      update(previous=>({...previous,pending:[{key:"grid-batch",hash:digest,operationId:stableId}]}));
      await flush();
      const response=await fetch("/api/invoice-purchases/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,operationId:stableId})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Approval failed. Your edits are kept; retry this batch.");
      setRevision(result.lineRevision);if(result.expenseRevision!=null)setExpenseRevision(result.expenseRevision);
      setRows(previous=>previous.map(row=>result.revisions[row.purchaseId]!=null?{...row,savedRevision:result.revisions[row.purchaseId],confidence:"Saved"}:row));
      update(previous=>({...previous,pending:[]}));
      setStatus(result.committed?"Invoice approved. Food spending and ingredient prices updated.":`${inputs.length} lines saved. ${remaining.length} lines still need review before committing food spending.`);
      router.refresh();
    } catch(error) {setStatus(error instanceof Error?error.message:"Approval failed. Your edits are kept.");}
    finally {setBusy(false);}
  }
  function addLine() {
    const id=crypto.randomUUID(),key=`manual-${id}`;
    setRows(previous=>[...previous,{key,purchaseId:id,savedRevision:null,itemId:"",rawCode:null,rawDescription:"",quantity:1,unit:"case",unitPrice:null,extendedPrice:null,packQty:null,packUnit:"",packText:"",ignored:false,remember:true,newName:"",newUnit:"",page:1,rawText:"",warnings:[],confidence:"Unmatched"}]);
    setSelected(key);
    requestAnimationFrame(()=>grid.current?.querySelector<HTMLTextAreaElement>(`[data-row-key="${key}"] textarea[data-grid-column="description"]`)?.focus());
  }
  function focusNextIssue() {
    const current = remaining.findIndex(row => row.key === selected);
    const next = remaining[(current + 1) % remaining.length];
    if (!next) return;
    const element = grid.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(next.key)}"]`);
    element?.scrollIntoView({ block: "center", inline: "nearest" });
    element?.focus({ preventScroll: true });
  }
  function navigate(event:KeyboardEvent<HTMLDivElement>) {
    if(event.defaultPrevented)return;
    const target=event.target;
    if(target instanceof HTMLTableRowElement&&(event.key==="Delete"||event.key==="Backspace")) {
      event.preventDefault();patch(target.dataset.rowKey!,{ignored:true});return;
    }
    if(!(target instanceof HTMLInputElement))return;
    // The combo owns its open list. Alt+Up/Down moves between ingredient rows.
    if(target.getAttribute("role")==="combobox"&&target.getAttribute("aria-expanded")==="true"&&!event.altKey&&["ArrowUp","ArrowDown","Enter","Escape"].includes(event.key))return;
    const navigation=gridNavigation(event.currentTarget,target,{...event,key:event.key,shiftKey:event.shiftKey,altKey:target.getAttribute("role")==="combobox"?false:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey});
    if(navigation?.preventDefault)event.preventDefault();navigation?.target?.focus();
  }
  const gridCell=(column:string,label:string)=>({"data-grid-cell":true,"data-grid-column":column,"aria-label":label,className:cellClass,onFocus:(event:React.FocusEvent<HTMLInputElement>)=>event.currentTarget.select()});
  return <section id="invoice-accounting" aria-label="Invoice purchase review" className="min-w-0 rounded-lg border border-hairline bg-canvas">
    <div className="grid grid-cols-2 items-end gap-3 border-b border-hairline bg-canvas p-3 md:grid-cols-3 lg:sticky lg:top-16 lg:z-30 lg:shadow-sm 2xl:grid-cols-5">
      <label className="min-w-0 text-xs">Supplier<Select aria-label="Invoice supplier" value={supplier} disabled={busy||!!vendorId} onChange={event=>{update(previous=>({...previous,supplier:event.target.value}));setRows(previous=>previous.map(row=>{
        if(row.savedRevision!=null||row.manual)return row;
        const match=matchInvoiceLine(row.rawCode,row.rawDescription,event.target.value,data?.aliases??[],data?.items??[]);
        return {...row,itemId:match.itemId??"",confidence:match.confidence==="learned-exact"?"Alias":match.itemId?"Fuzzy":"Unmatched"};
      }));}}><option value="">Choose supplier</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</Select></label>
      <label className="min-w-0 text-xs">Venue<Select aria-label="Invoice venue" value={venue} disabled={busy} onChange={event=>update(previous=>({...previous,venue:event.target.value}))}><option value="">Choose venue</option>{venues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</Select></label>
      <label className="min-w-0 text-xs">Invoice date<Input aria-label="Invoice date" type="date" className="min-w-0" value={date} disabled={busy} onChange={event=>update(previous=>({...previous,date:event.target.value}))}/></label>
      <label className="min-w-0 text-xs">Invoice total ($)<Input aria-label="Invoice total ($)" type="number" step="0.01" value={draft.invoiceTotal??""} disabled={busy} onChange={event=>update(previous=>({...previous,invoiceTotal:event.target.value}))}/></label>
      <div className="col-span-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs tabular-nums 2xl:col-span-1 2xl:block" aria-live="polite">Food-line total ($)<strong className="block text-sm">{money(total/100)}</strong>{comparison!==null&&<span className={comparison===0?"text-emerald-700":"text-amber-700"}>{comparison===0?"Matches invoice":`${money(comparison/100)} difference`}</span>}</div>
    </div>
    {loaded && (missingDetails.length > 0 || remaining.length > 0) && <div className="space-y-2 border-b border-hairline bg-amber-500/5 px-3 py-2 text-sm">
      {missingDetails.length > 0 && <p>Fill in the {missingDetails.join(", ")} above to approve lines.</p>}
      {remaining.length > 0 && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p>{remaining.length} {remaining.length === 1 ? "line needs" : "lines need"} review. Food spending is confirmed when all included lines are ready.</p>
        <button type="button" className="font-medium text-blue-600 underline" disabled={busy} onClick={focusNextIssue}>Go to next line needing review ↓</button>
      </div>}
    </div>}
    <div className="flex flex-wrap items-center gap-3 p-3" aria-label="Bulk actions">
      <Button type="button" disabled={busy||!loaded||missingDetails.length>0||(!ready.length&&!ignoredKeys.length&&!rows.some(row=>row.savedRevision!=null))} onClick={()=>void approve()}>{busy?"Working…":`Approve All Matched Lines (${ready.length})`}</Button>
      <Button type="button" variant="secondary" disabled={busy||!loaded||rows.length>=200} onClick={addLine}>+ Add Line</Button>
      <label className="ml-auto text-xs"><input type="checkbox" checked={draft.showIgnored} onChange={event=>update(previous=>({...previous,showIgnored:event.target.checked}))}/> Show ignored rows ({rows.filter(row=>row.ignored).length})</label>
    </div>
    <details className="px-3 pb-3 text-xs text-zinc-500">
      <summary className="cursor-pointer">Review tips</summary>
      <p className="mt-1">Tab across cells. Use Enter or ↑ ↓ down a column, Alt+↑ ↓ between ingredient rows, and Delete on a focused row to ignore it. Packs and ingredient mappings are remembered by default. Amounts are in USD.</p>
    </details>
    {recovered&&<p className="px-3 pb-2 text-xs text-zinc-500">Your invoice edits were restored.</p>}
    {!loaded&&<p role="status" className="p-3 text-sm">Loading invoice lines…</p>}
    {loaded&&!data?.draft&&<div className="p-3"><Button type="button" variant="secondary" disabled={busy} onClick={()=>void recognize()}>Run local invoice OCR</Button></div>}
    {recognizing&&<Button type="button" variant="secondary" onClick={()=>abort.current?.abort()}>Cancel OCR</Button>}
    {status&&<p role="status" className="border-t border-hairline p-3 text-sm">{status}</p>}
    <div ref={grid} data-edit-grid onKeyDown={navigate} className="md:overflow-x-auto">
      <fieldset disabled={busy} className="min-w-0 md:min-w-[880px]">
        <table role="table" className="block w-full table-fixed text-left text-sm md:table" aria-label="Editable invoice lines"><thead role="rowgroup" className="sr-only border-y border-hairline bg-stone text-xs md:not-sr-only md:table-header-group"><tr role="row">
          <th className="w-8 p-2" aria-label="Include">In</th><th className="w-44 p-2">Vendor SKU / OCR description</th><th className="w-48 p-2">Matched ingredient</th><th className="w-12 p-2">Qty</th><th className="w-28 p-2">Pack / unit size</th><th className="w-24 p-2">Line total ($)</th><th className="w-24 p-2">Computed unit cost</th><th className="w-8" aria-label="Ignore"/>
        </tr></thead><tbody role="rowgroup" className="block md:table-row-group">{visible.map(({ row, result })=>{
          const item=catalog.find(item=>item.id===row.itemId),saved=lines.find(line=>line.id===row.purchaseId);
          const delta=priceVariance(saved?.previousUnitCost??item?.unitCost??null,result.newPrice);
          return <tr role="row" key={row.key} data-row-key={row.key} tabIndex={0} onFocus={()=>focusRow(row)} onClick={()=>focusRow(row)} className={`grid grid-cols-6 gap-2 border-t border-hairline p-3 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-form-focus md:table-row md:border-t-0 md:border-b md:p-0 md:align-top ${selected===row.key?"bg-blue-500/5":""} ${row.ignored?"opacity-50":""}`}>
            <td role="cell" className="col-span-6 md:p-2"><label className="flex items-center gap-2"><input aria-label={`Include ${row.rawDescription||"new line"}`} type="checkbox" checked={!row.ignored} onChange={event=>patch(row.key,{ignored:!event.target.checked})}/><span className="text-xs text-zinc-500 md:hidden">Include in review</span></label></td>
            <td role="cell" className="col-span-6 min-w-0 md:p-1"><span className={mobileLabel}>Description / SKU</span><textarea aria-label="OCR description" data-grid-column="description" rows={2} title={row.rawDescription} className={`${cellClass} resize-none whitespace-normal font-semibold leading-tight`} maxLength={500} value={row.rawDescription} placeholder="Description" onChange={event=>patch(row.key,{rawDescription:event.target.value})}/><div className="flex items-center gap-1 px-2 text-xs text-zinc-500"><input {...gridCell("code","Vendor SKU")} className="w-20 min-w-0 bg-transparent outline-none focus:ring-1 focus:ring-form-focus" maxLength={100} placeholder="SKU" value={row.rawCode??""} onChange={event=>patch(row.key,{rawCode:event.target.value||null})}/><span className="truncate" title={row.rawText}>{row.rawText.match(/\d+(?:\.\d+)?\s*[/x]\s*\d+(?:\.\d+)?\s*(?:OZ|LB|KG|GR|G|EA)\b/i)?.[0]||""}</span></div></td>
            <td role="cell" className="col-span-6 min-w-0 md:p-1"><span className={mobileLabel}>Matched ingredient</span><ComboPicker name={`ingredient-${row.key}`} ariaLabel={`Ingredient for ${row.rawDescription||"new line"}`} options={catalog.map(item=>({id:item.id,label:item.label,keywords:`${item.sku??""} ${item.keywords??""}`,meta:`${money(item.unitCost??0,3)} / ${item.unit||""}`}))} valueId={row.itemId} defaultId={row.itemId} selectOnTab gridColumn="ingredient" onSelect={choice=>ingredient(row,choice?.id||"")}/><span className="mt-1 inline-block text-[10px]"><Badge color={row.itemId?"green":"amber"}>{row.confidence}</Badge></span><label className="ml-2 text-xs text-zinc-500 md:text-[10px]"><input type="checkbox" checked={row.remember} onChange={event=>patch(row.key,{remember:event.target.checked})}/> Remember</label></td>
            <td role="cell" className="col-span-2 min-w-0 md:p-1"><span className={mobileLabel}>Billed qty</span><input {...gridCell("quantity","Billed quantity")} type="number" step="any" min="0.000001" value={row.quantity??""} onChange={event=>patch(row.key,{quantity:numeric(event.target.value)})}/></td>
            <td role="cell" className="col-span-4 min-w-0 md:p-1"><span className={mobileLabel}>Pack / unit size</span><input {...gridCell("pack","Pack / unit size")} aria-invalid={!parseInvoicePack(row.packText||"")} maxLength={100} placeholder="16 oz x 16" value={row.packText??""} onChange={event=>{const pack=parseInvoicePack(event.target.value);patch(row.key,{packText:event.target.value,...(pack??{packQty:null,packUnit:""})});}}/>{item?.eachWeightOz!=null&&<label className="block px-2 text-[10px] text-zinc-500">oz / each override<input {...gridCell("weight","Received weight oz per each")} type="number" min="0.000001" step="any" placeholder={String(item.eachWeightOz)} value={row.eachWeightOz??""} onChange={event=>patch(row.key,{eachWeightOz:numeric(event.target.value)})}/></label>}</td>
            <td role="cell" className="col-span-3 min-w-0 md:p-1"><span className={mobileLabel}>Line total ($)</span><input {...gridCell("amount","Line total ($)")} type="number" step="0.01" value={invoiceLineAmounts(row).total??""} onChange={event=>patch(row.key,{extendedPrice:numeric(event.target.value),totalMode:"entered"})}/></td>
            <td role="cell" className="col-span-3 min-w-0 text-xs tabular-nums md:p-2"><span className={mobileLabel}>Cost per unit</span>{result.newPrice!=null?<><strong>{money(result.newPrice,3)} / {item?.unit}</strong>{delta!==null&&!row.ignored&&<span className={`block ${delta>0?"text-amber-700":"text-emerald-700"}`}>{delta>=0?"+":""}{delta.toFixed(1)}% vs last price</span>}</>:<span className="text-zinc-500">Needs pack / match</span>}{!row.ignored&&result.problems.length>0&&<p className="mt-1 text-xs text-amber-700 md:text-[10px]">{result.problems.join(" ")}</p>}{result.warnings.length>0&&<details className="mt-1 text-xs text-amber-700 md:text-[10px]"><summary>Check OCR</summary>{result.warnings.join(" ")}</details>}</td>
            <td role="cell" className="hidden py-2 md:table-cell"><button type="button" aria-label={`${row.ignored?"Restore":"Ignore"} ${row.rawDescription||"new line"}`} className="rounded px-2 py-1 text-zinc-500 hover:bg-stone focus:ring-1" onClick={()=>patch(row.key,{ignored:!row.ignored})}>{row.ignored?"↶":"×"}</button></td>
          </tr>;
        })}</tbody></table>
      </fieldset>
      {loaded&&!visible.length&&<p className="p-4 text-sm">No active lines. Add a line or show ignored rows to restore one.</p>}
    </div>
  </section>;
}
