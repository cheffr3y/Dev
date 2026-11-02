"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { mutatePreservation } from "@/lib/production/preservation-data";

export async function savePreservation(input: unknown) {
  const user = await requireActiveUser();
  try {
    const batch = await mutatePreservation(user.id, input);
    revalidatePath("/production/preservation");
    revalidatePath(`/production/preservation/${batch.id}`);
    revalidatePath(`/production/preservation/${batch.id}/print`);
    if ((input as { action?: string })?.action === "post") revalidatePath("/", "layout");
    return { ok: true as const, id: batch.id };
  } catch (error) {
    return { ok: false as const, error: error instanceof ZodError ? error.issues.map(issue => issue.message).join(" ") : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Unable to save this batch. Reload and retry the same entry." };
  }
}
