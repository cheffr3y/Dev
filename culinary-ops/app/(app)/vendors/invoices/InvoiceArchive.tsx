"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { patchUrl } from "@/lib/workspace/url-state";
import { useDocumentQueue } from "@/components/useDocumentQueue";
import { DocumentQueueStatus } from "@/components/DocumentQueueStatus";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
export function InvoiceArchive({vendors}:{vendors:{id:string;name:string}[]}) {
 const router=useRouter(),[error,setError]=useState("");
 const activeOcr=useRef<AbortController|null>(null);
 useEffect(()=>()=>activeOcr.current?.abort(),[]);
 const { entries, enqueue, retry } = useDocumentQueue("/api/invoices", id => {
  router.push(patchUrl(window.location.href, { id })); router.refresh();
 },async(id,task,report)=>{
  const controller=new AbortController();activeOcr.current=controller;
  try {
   const existing=await fetch(`/api/invoice-ocr?id=${encodeURIComponent(id)}`,{signal:controller.signal}).then(response=>response.json());
   if(existing.draft)return;
   const {recognizeInvoice}=await import("@/lib/invoices/invoice-ocr-browser");
   const draft=await recognizeInvoice(task.file,(message,fraction)=>report({message,...(fraction===undefined?{}:{completed:Math.round(fraction*100),total:100})}),controller.signal);
   const response=await fetch("/api/invoice-ocr",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({action:"draft",documentId:id,expectedRevision:existing.revision??0,pages:draft.pages})});const result=await response.json();if(!result.ok)throw new Error(result.error);
  }catch(error){if(!controller.signal.aborted)setError(`${task.file.name} is stored. Local OCR: ${error instanceof Error?error.message:"unavailable"}. Open it to retry or enter lines manually.`);}
 });
 function save(form: HTMLFormElement, selected?: File[]) {
  const data = new FormData(form);
  const files = selected ?? data.getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) { setError("Choose a PDF or photo first."); return; }
  setError("");
  enqueue(files, ["vendorId", "invoiceNumber", "notes"].map(name => [name, String(data.get(name) ?? "")]));
  form.reset();
 }
 return <Card className="p-5"><form aria-label="Store invoice" className="space-y-4" onSubmit={event=>{event.preventDefault();void save(event.currentTarget);}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();save(event.currentTarget,Array.from(event.dataTransfer.files));}}>
  <p className="text-sm text-zinc-500">Drop a PDF/photo here, choose a file, or take a photo. Up to 8 MB and 20 PDF pages. A readable compact copy is stored with a preview. Metadata applies to all selected files. Keep this page open until the queue finishes.</p>
  <fieldset className="space-y-4">
   <label className="block text-sm">Invoice PDF or photo<Input aria-label="Invoice PDF or photo" type="file" multiple name="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
   <label className="block text-sm">Or take a photo<Input aria-label="Take invoice photo" type="file" accept="image/*" capture="environment" onChange={event=>{const file=event.target.files?.[0];if(file&&event.currentTarget.form)save(event.currentTarget.form,[file]);}} /></label>
   <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Vendor (optional)<Select name="vendorId" aria-label="Invoice vendor"><option value="">Unassigned</option>{vendors.map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></label><label className="text-sm">Invoice number (optional)<Input name="invoiceNumber" maxLength={120} /></label></div>
   <label className="block text-sm">Notes (optional)<Textarea name="notes" maxLength={5000} /></label>
   <Button type="submit">Store invoice</Button>
  </fieldset>
  <DocumentQueueStatus entries={entries} retry={retry} href={id => patchUrl(typeof window === "undefined" ? "http://localhost/vendors/invoices" : window.location.href, { id })} />{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 </form></Card>;
}
