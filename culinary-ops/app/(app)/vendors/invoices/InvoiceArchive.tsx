"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
export function InvoiceArchive({vendors}:{vendors:{id:string;name:string}[]}) {
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(form:HTMLFormElement,file?:File) {
  const data=new FormData(form);if(file)data.set("file",file);
  if(!(data.get("file") instanceof File)||(data.get("file") as File).size===0){setError("Choose a PDF or photo first.");return;}
  setBusy(true);setError("");
  try{const response=await fetch("/api/invoices",{method:"POST",body:data});const result=await response.json();if(!response.ok)throw new Error(result.error);router.push(`/vendors/invoices?id=${encodeURIComponent(result.id)}`);router.refresh();form.reset();}
  catch(error){setError(error instanceof Error?error.message:"Could not save invoice.");}finally{setBusy(false);}
 }
 return <Card className="p-5"><form aria-label="Store invoice" className="space-y-4" onSubmit={event=>{event.preventDefault();void save(event.currentTarget);}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)void save(event.currentTarget,event.dataTransfer.files[0]);}}>
  <p className="text-sm text-zinc-500">Drop a PDF/photo here, choose a file, or take a photo. Up to 8 MB and 20 PDF pages. A readable compact copy is stored with a preview.</p>
  <fieldset disabled={busy} className="space-y-4">
   <label className="block text-sm">Invoice PDF or photo<Input aria-label="Invoice PDF or photo" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
   <label className="block text-sm">Or take a photo<Input aria-label="Take invoice photo" type="file" accept="image/*" capture="environment" onChange={event=>{const file=event.target.files?.[0];if(file&&event.currentTarget.form)void save(event.currentTarget.form,file);}} /></label>
   <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Vendor (optional)<Select name="vendorId" aria-label="Invoice vendor"><option value="">Unassigned</option>{vendors.map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></label><label className="text-sm">Invoice number (optional)<Input name="invoiceNumber" maxLength={120} /></label></div>
   <label className="block text-sm">Notes (optional)<Textarea name="notes" maxLength={5000} /></label>
   <Button type="submit">{busy?"Compressing and storing…":"Store invoice"}</Button>
  </fieldset>
  {busy&&<p role="status" className="text-sm">Preparing the compact copy. Multi-page PDFs may take a moment.</p>}{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 </form></Card>;
}
