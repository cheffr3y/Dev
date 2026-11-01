import { getPrepUser } from "@/lib/prep-session";
import { prisma } from "@/lib/prisma";
import { loadOperatingMonth } from "@/lib/operating-calendar-data";
import { operatingMonth, buildOperatingMonth, operatingCsv } from "@/lib/operating-calendar";

export async function GET(request: Request) {
  const user = await getPrepUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role === "STAFF") return Response.json({ error: "Manager access required." }, { status: 403 });
  const params = new URL(request.url).searchParams, month = params.get("month") || "", venueId = params.get("venue") || "";
  try { operatingMonth(month); } catch { return Response.json({ error: "Choose a valid month." }, { status: 400 }); }
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } });
  if (!venue) return Response.json({ error: "Venue not found." }, { status: 404 });
  const data = await loadOperatingMonth(venueId, month);
  return new Response(operatingCsv(buildOperatingMonth(month, data.entries, data.expenses), venue.name), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="operating-${month}.csv"`, "Cache-Control": "private, no-store",
  } });
}
