import { revalidatePath } from "next/cache";
import { getPrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { saveOperatingRecord } from "@/lib/accounting/operating-calendar-data";

export async function POST(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ ok: false, error: "Sign in before saving." }, { status: 401 });
  if (user.role === "STAFF") return Response.json({ ok: false, error: "Manager access is required." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const host = new URL(origin).host;
      if (origin !== new URL(request.url).origin && host !== request.headers.get("host") && host !== request.headers.get("x-forwarded-host")) throw new Error();
    } catch { return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 }); }
  }
  if (Number(request.headers.get("content-length")) > 20000) return Response.json({ ok: false, error: "Entry is too large." }, { status: 413 });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid entry." }, { status: 400 }); }
  const result = await saveOperatingRecord(prisma, user.id, input);
  if (result.ok) {
    revalidatePath("/operating-calendar", "layout");
    revalidatePath("/vendors/invoices");
  }
  return Response.json(result, { status: result.ok ? 200 : result.conflict ? 409 : 400 });
}
