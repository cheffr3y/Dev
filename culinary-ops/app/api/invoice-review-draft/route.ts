import { getPrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { saveInvoiceReviewDraft } from "@/lib/invoices/review-draft-data";
import { z } from "zod";
import { validRequestOrigin } from "@/lib/auth/request-origin";

export async function POST(request: Request) {
  const actor = await getPrepUser();
  if (!actor) return Response.json({ ok: false, error: "Sign in again to save your draft." }, { status: 401 });
  if (actor.role === "STAFF") return Response.json({ ok: false, error: "Manager access required." }, { status: 403 });
  if (!validRequestOrigin(request)) return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 1000000) throw new Error("Draft is too large. Split this invoice.");
    const input = z.object({ documentId: z.string().min(1).max(150), expectedRevision: z.number().int().nonnegative(), payload: z.unknown() }).strict().parse(JSON.parse(text));
    const result = await saveInvoiceReviewDraft(prisma, actor.id, input.documentId, input.expectedRevision, input.payload);
    return Response.json(result, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Draft could not be saved. Retry to keep your changes." }, { status: 400 });
  }
}
