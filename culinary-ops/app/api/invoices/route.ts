import { createHash } from "node:crypto";
import { getPrepUser } from "@/lib/prep-session";
import { prisma } from "@/lib/prisma";
import { compactInvoice, INVOICE_UPLOAD_LIMIT } from "@/lib/invoice-storage";
export const runtime = "nodejs";
export const maxDuration = 120;
async function actor() { const user = await getPrepUser(); return user && user.role !== "STAFF" ? user : null; }
export async function GET(request: Request) {
  if (!await actor()) return Response.json({error:"Manager access required."},{status:403});
  const id = new URL(request.url).searchParams.get("id");
  const document = id ? await prisma.invoiceDocument.findUnique({where:{id},select:{id:true,filename:true,mime:true,originalBytes:true,storedBytes:true,pages:true,createdAt:true,vendor:true,invoiceNumber:true,notes:true}}) : null;
  return document ? Response.json(document) : Response.json({error:"Invoice not found."},{status:404});
}
export async function POST(request: Request) {
  const user = await actor(); if (!user) return Response.json({error:"Manager access required."},{status:403});
  const origin = request.headers.get("origin");
  if (origin) { try {const host=new URL(origin).host;if(origin!==new URL(request.url).origin && host!==request.headers.get("host") && host!==request.headers.get("x-forwarded-host")) throw new Error();} catch {return Response.json({error:"Invalid request origin."},{status:403});} }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return Response.json({error:"AI invoice extraction and automatic price updates are deferred. Upload a document to store it."},{status:410});
  if (Number(request.headers.get("content-length")) > INVOICE_UPLOAD_LIMIT + 65536) return Response.json({error:"Choose an invoice under 8 MB."},{status:413});
  try {
    const form=await request.formData(),file=form.get("file");
    if (!(file instanceof File) || !file.size || file.size>INVOICE_UPLOAD_LIMIT) throw new Error("Choose a nonempty invoice under 8 MB.");
    const source=new Uint8Array(await file.arrayBuffer()),fileHash=createHash("sha256").update(source).digest("hex");
    const existing=await prisma.invoiceDocument.findUnique({where:{fileHash},select:{id:true}});
    if(existing) return Response.json(existing);
    const vendorId=String(form.get("vendorId")??"").trim()||null,invoiceNumber=String(form.get("invoiceNumber")??"").trim()||null,notes=String(form.get("notes")??"").trim()||null;
    if ((invoiceNumber?.length??0)>120 || (notes?.length??0)>5000) throw new Error("Keep invoice numbers under 120 characters and notes under 5000.");
    if (vendorId && !await prisma.vendor.findUnique({where:{id:vendorId}})) throw new Error("Choose an existing vendor.");
    const compact=await compactInvoice(source);
    const document=await prisma.invoiceDocument.upsert({where:{fileHash},create:{...compact,data:new Uint8Array(compact.data),preview:new Uint8Array(compact.preview),filename:file.name.replace(/[\r\n]/g," ").slice(0,200),createdBy:user.id,vendorId,invoiceNumber,notes},update:{},select:{id:true}});
    return Response.json(document);
  } catch(error) { return Response.json({error:error instanceof Error && !/Invalid `|prisma\./.test(error.message)?error.message:"Could not store this invoice. Try another PDF or photo."},{status:400}); }
}
