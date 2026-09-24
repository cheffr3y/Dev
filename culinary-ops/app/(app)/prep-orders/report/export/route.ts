import { getCurrentUser, hasRole } from "@/lib/session";
import { exportSnapshot, reportCsv } from "@/lib/prep-accounting-report";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "MANAGER"))
    return new Response("Unauthorized", { status: 403 });
  const p = new URL(request.url).searchParams;
  const { id, report } = await exportSnapshot(
    p.get("from"),
    p.get("to"),
    p.get("venue"),
    p.get("run"),
  );
  return new Response(reportCsv(report, id), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prep-accounting_${id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Export-Snapshot": id,
    },
  });
}
