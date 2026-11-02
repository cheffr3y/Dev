import { getPrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { smokeScope } from "@/lib/smoking/data";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const params = new URL(request.url).searchParams,
    id = params.get("id");
  const photo = id
    ? await prisma.smokePhoto.findFirst({
        where: { id, run: smokeScope(user) },
        select: { metadata: true, data: true, preview: true },
      })
    : null;
  if (!photo)
    return Response.json({ error: "Document not found." }, { status: 404 });
  const metadata = photo.metadata as { filename: string; mime: string };
  const preview = params.get("preview") === "1",
    download = params.get("download") === "1";
  return new Response(new Uint8Array(preview ? photo.preview : photo.data), {
    headers: {
      "Content-Type": preview ? "image/jpeg" : metadata.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(metadata.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
