"use server";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { ACCOUNTING_CATEGORIES } from "@/lib/ingredients/categories";
import { revalidatePath } from "next/cache";
export async function saveMappings(form: FormData) {
  await requireActiveUser("ADMIN");
  const venues = await prisma.venue.findMany({ select: { id: true } });
  const valid = new Set([...ACCOUNTING_CATEGORIES.map(name => `CATEGORY:${name}`), "LABOR:Production labor", "LABOR:Dishwasher labor", "VENUE:PRODUCTION", ...venues.map(venue => `VENUE:${venue.id}`)]);
  await prisma.$transaction(async tx => {
    for (const [field, raw] of form) {
      if (!valid.has(field)) continue;
      const colon = field.indexOf(":"), kind = field.slice(0, colon), sourceKey = field.slice(colon + 1), code = String(raw).trim();
      if (code.length > 60 || /[\r\n\t]/.test(code)) throw new Error("Use a code of up to 60 characters without line breaks.");
      if (!code) await tx.accountingMapping.deleteMany({ where: { kind, sourceKey } });
      else await tx.accountingMapping.upsert({ where: { kind_sourceKey: { kind, sourceKey } }, create: { kind, sourceKey, code }, update: { code } });
    }
  });
  revalidatePath("/prep-orders/report", "layout");
}
