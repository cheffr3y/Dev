import { getPrepUser } from "@/lib/auth/prep-session";
import { loadLocalInvoice, mutateLocalInvoice } from "@/lib/invoices/invoice-ocr-data";
import { revalidatePath } from "next/cache";
export async function GET(request:Request) {
  const actor=await getPrepUser();if(!actor)return Response.json({ok:false,error:"Sign in first."},{status:401});if(actor.role==="STAFF")return Response.json({ok:false,error:"Manager access required."},{status:403});
  try {const url=new URL(request.url);return Response.json(await loadLocalInvoice(url.searchParams.get("id")??"",url.searchParams.get("vendor")??undefined),{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({ok:false,error:"Invoice unavailable."},{status:404});}
}
export async function POST(request:Request) {
  const actor=await getPrepUser();if(!actor)return Response.json({ok:false,error:"Sign in first."},{status:401});if(actor.role==="STAFF")return Response.json({ok:false,error:"Manager access required."},{status:403});
  const origin=request.headers.get("origin");if(origin && origin!==new URL(request.url).origin)return Response.json({ok:false,error:"Invalid request origin."},{status:403});
  try {const body=await request.text();if(body.length>600000)throw new Error("Recognition draft is too large. Split the invoice.");const result=await mutateLocalInvoice(actor.id,JSON.parse(body));revalidatePath("/vendors/invoices");revalidatePath("/items");return Response.json(result);}catch(error){return Response.json({ok:false,error:error instanceof Error&&!error.name.startsWith("Prisma")?error.message:"Could not save this recognition edit. Retry the same operation."},{status:400});}
}
