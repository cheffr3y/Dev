import { getCurrentUser, hasRole } from "@/lib/session";
import { exportSnapshot, reportSheets } from "@/lib/prep-accounting-report";
import { createXlsx } from "@/lib/xlsx";
export const runtime = "nodejs";
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
  return new Response(new Uint8Array(createXlsx(reportSheets(report, id))), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="prep-accounting_${id}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Export-Snapshot": id,
    },
  });
}
