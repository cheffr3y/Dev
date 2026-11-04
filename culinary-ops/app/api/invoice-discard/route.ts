import { getPrepUser } from "@/lib/auth/prep-session";
import { validRequestOrigin } from "@/lib/auth/request-origin";
import { prisma } from "@/lib/db/prisma";
import { discardInvoice } from "@/lib/invoices/discard-invoice";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const actor = await getPrepUser();
  if (!actor) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (actor.role === "STAFF") return Response.json({ ok: false, error: "Manager access required." }, { status: 403 });
  if (!validRequestOrigin(request)) return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.text();
    if (body.length > 4000) throw new Error("Discard request is too large.");
    const result = await discardInvoice(prisma, actor.id, JSON.parse(body));
    if (result.ok) revalidatePath("/", "layout");
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Could not discard this invoice. Reload and retry." }, { status: 400 });
  }
}
