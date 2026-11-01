import { getPrepUser } from "@/lib/prep-session";
import { prisma } from "@/lib/prisma";
import { saveInvoicePurchase } from "@/lib/invoice-purchases-data";
import { revalidatePath } from "next/cache";
export async function POST(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (user.role === "STAFF") return Response.json({ ok: false, error: "Manager access required." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) { try { const host = new URL(origin).host; if (origin !== new URL(request.url).origin && host !== request.headers.get("host") && host !== request.headers.get("x-forwarded-host")) throw new Error(); } catch { return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 }); } }
  if (Number(request.headers.get("content-length")) > 20000) return Response.json({ ok: false, error: "Line is too large." }, { status: 413 });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid line." }, { status: 400 }); }
  const result = await saveInvoicePurchase(prisma, user.id, input);
  if (result.ok) { revalidatePath("/vendors/invoices"); revalidatePath("/operating-calendar"); revalidatePath("/items/[id]", "page"); }
  return Response.json(result, { status: result.ok ? 200 : result.conflict ? 409 : 400 });
}
