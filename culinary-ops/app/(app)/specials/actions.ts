"use server";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "@/lib/db/prisma";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { specialCostingSchema } from "@/lib/recipes/special-costing";
import { z } from "zod";
import { revalidatePath } from "next/cache";
export async function saveSpecial(raw: unknown) {
  const user = await requirePrepUser("MANAGER");
  const input = z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative().nullable(), payload: specialCostingSchema }).parse(raw);
  if (input.payload.venueId && !await prisma.venue.findUnique({where:{id:input.payload.venueId}})) return {ok:false,error:"Choose an existing venue."};
  if (input.revision == null) {
    // A create retry may follow a lost response; owner and payload must match.
    const current = await prisma.specialCosting.findUnique({where:{id:input.id}});
    if (current) return current.userId === user.id && isDeepStrictEqual(current.payload, input.payload) ? {ok:true,revision:current.revision} : {ok:false,error:"This draft already exists. Open its saved copy."};
    await prisma.specialCosting.create({data:{id:input.id,userId:user.id,name:input.payload.name,payload:input.payload}});
    revalidatePath("/specials"); return {ok:true,revision:0};
  }
  const saved = await prisma.specialCosting.updateMany({where:{id:input.id,userId:user.id,revision:input.revision},data:{name:input.payload.name,payload:input.payload,revision:{increment:1}}});
  if(!saved.count) return {ok:false,error:"This costing changed in another tab. Reload its saved copy before saving."};
  revalidatePath("/specials"); return {ok:true,revision:input.revision+1};
}
