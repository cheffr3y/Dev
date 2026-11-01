"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";

// Names, grouping and codes belong to the shared company directory. This
// editor changes location metadata only, never history or location identity.
export async function updateVenue(formData: FormData) {
  await requireActiveUser("MANAGER");
  const data = z.object({
    id: z.string().min(1),
    address: z.string().trim().max(1000),
    notes: z.string().trim().max(5000),
  }).parse(Object.fromEntries(formData));
  await prisma.venue.update({ where: { id: data.id }, data: { address: data.address || null, notes: data.notes || null } });
  revalidatePath("/", "layout");
}
