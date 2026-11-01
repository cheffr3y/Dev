import { getPrepUser } from "@/lib/prep-session";
import { prisma } from "@/lib/prisma";
export const runtime="nodejs";
export async function GET(request:Request) {
 const user=await getPrepUser();if(!user || user.role==="STAFF") return new Response("Unauthorized",{status:403});
 const params=new URL(request.url).searchParams,id=params.get("id")??"",preview=params.get("preview")==="1";
 const document=await prisma.invoiceDocument.findUnique({where:{id},select:{preview,data:!preview,filename:true,mime:true}});
 if(!document) return new Response("Invoice not found",{status:404});
 const bytes=preview?document.preview:document.data;
 const extension=preview||document.mime==="image/jpeg"?"jpg":document.mime==="image/png"?"png":"pdf";
 const filename=document.filename.replace(/\.[^.]+$/,"")+`.${extension}`;
 return new Response(new Uint8Array(bytes!),{headers:{"Content-Type":preview?"image/jpeg":document.mime,"Content-Disposition":`${params.get("download")==="1"?"attachment":"inline"}; filename="invoice.${extension}"; filename*=UTF-8''${encodeURIComponent(filename)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
}
