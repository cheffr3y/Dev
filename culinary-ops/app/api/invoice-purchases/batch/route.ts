import { getPrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { saveInvoiceBatch } from "@/lib/invoices/invoice-batch-data";
import { validRequestOrigin } from "@/lib/auth/request-origin";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ok:false,error:"Sign in first."},{status:401});
  if (user.role === "STAFF") return Response.json({ok:false,error:"Manager access required."},{status:403});
  if(!validRequestOrigin(request))return Response.json({ok:false,error:"Invalid request origin."},{status:403});
  const text=await request.text();
  if(text.length>500000)return Response.json({ok:false,error:"Invoice is too large."},{status:413});
  try {
    const result=await saveInvoiceBatch(prisma,user.id,JSON.parse(text));
    revalidatePath("/","layout");
    return Response.json(result);
  } catch(error) {
    return Response.json({ok:false,error:error instanceof Error?error.message:"Invoice approval failed. Your edits are kept."},{status:400});
  }
}
