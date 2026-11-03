import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { applyMeasurements, measurementPreview, measurementSchema } from "@/lib/ingredients/measurement-data";
import { validRequestOrigin } from "@/lib/auth/request-origin";

export async function POST(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (user.role === "STAFF") return Response.json({ ok: false, error: "Manager access required." }, { status: 403 });
  if (!validRequestOrigin(request)) return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  try {
    const input = z.object({ action: z.enum(["preview", "apply"]), id: z.string().min(1).max(150), settings: measurementSchema, operationId: z.string().uuid().optional(), token: z.string().optional(), confirmedBasis: z.boolean().optional() }).strict().parse(await request.json());
    if (input.action === "preview") {
      const preview = await prisma.$transaction(tx => measurementPreview(tx, input.id, input.settings), { isolationLevel: "RepeatableRead", timeout: 30000 });
      return Response.json({ ok: true, token: preview.token, rows: preview.rows, unitCost: preview.proposedItem.unitCost, unit: preview.proposedItem.unit, blocked: preview.blocked }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const command = {id:input.id,settings:input.settings,operationId:input.operationId,token:input.token,confirmedBasis:input.confirmedBasis};
    const result = await applyMeasurements(prisma, user.id, command);
    revalidatePath("/", "layout");
    return Response.json(result);
  } catch (error) { return Response.json({ ok: false, error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Could not save measurements. Preview again and retry." }, { status: 400 }); }
}
