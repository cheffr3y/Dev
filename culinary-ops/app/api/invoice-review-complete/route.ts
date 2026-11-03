import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { completeInvoiceReview } from "@/lib/invoices/complete-review";
import { validRequestOrigin } from "@/lib/auth/request-origin";

export async function POST(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (user.role === "STAFF") return Response.json({ ok: false, error: "Manager access required." }, { status: 403 });
  if (!validRequestOrigin(request)) return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  try {
    const input = z.object({ id: z.string().min(1).max(150), lineRevision: z.number().int().nonnegative(), ocrRevision: z.number().int().nonnegative() }).strict().parse(await request.json());
    const result = await completeInvoiceReview(prisma, user.id, input.id, input.lineRevision, input.ocrRevision);
    revalidatePath("/invoices");
    return Response.json(result);
  } catch (error) { return Response.json({ ok: false, error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Could not finish review. Reload and retry." }, { status: 400 }); }
}
