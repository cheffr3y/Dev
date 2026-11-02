import { ZodError } from "zod";
import { getPrepUser } from "@/lib/auth/prep-session";
import { mutateSmoke, SmokeError, uploadSmokePhoto } from "@/lib/smoking/data";
import {
  compactSmokeDocument,
  SMOKE_UPLOAD_LIMIT,
} from "@/lib/smoking/storage";
export const runtime = "nodejs";
export const maxDuration = 120;
async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new SmokeError("Missing request body.");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new SmokeError("The upload or form is too large.", 413);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
export async function POST(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      const host = new URL(origin).host;
      if (
        origin !== new URL(request.url).origin &&
        host !== request.headers.get("host") &&
        host !== request.headers.get("x-forwarded-host")
      )
        throw new SmokeError("Invalid request origin.", 403);
    }
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const bytes = await limitedBody(request, SMOKE_UPLOAD_LIMIT + 65536);
      const form = await new Response(bytes, {
          headers: { "content-type": type },
        }).formData(),
        file = form.get("file");
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > SMOKE_UPLOAD_LIMIT
      )
        throw new SmokeError("Choose a photo or PDF under 8 MB.");
      const input = {
        operationId: String(form.get("operationId") ?? ""),
        runId: String(form.get("runId") ?? ""),
        lotId: String(form.get("lotId") ?? "") || null,
        filename: file.name.replace(/[\r\n]/g, " ").slice(0, 200),
      };
      const compact = await compactSmokeDocument(
        new Uint8Array(await file.arrayBuffer()),
      );
      return Response.json(await uploadSmokePhoto(user.id, input, compact));
    }
    if (!type.startsWith("application/json"))
      throw new SmokeError("Use a smoking form or a source document.");
    const body = await limitedBody(request, 65536);
    return Response.json(
      await mutateSmoke(user.id, JSON.parse(body.toString("utf8"))),
    );
  } catch (error) {
    if (error instanceof SmokeError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError)
      return Response.json(
        {
          error: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return Response.json({ error: "Invalid form data." }, { status: 400 });
    console.error(
      "Smoking request failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return Response.json(
      {
        error:
          "Could not save this record. Keep your entries and retry, or refresh if another cook changed it.",
      },
      { status: 400 },
    );
  }
}
