import { getPrepUser } from "@/lib/prep-session";
import { exportSnapshot, reportCsv, reportTableCsv } from "@/lib/prep-accounting-report";
export async function GET(request: Request) {
  const user = await getPrepUser();
  if (!user || user.role !== "ADMIN")
    return new Response("Unauthorized", { status: 403 });
  const p = new URL(request.url).searchParams;
  const { id, report } = await exportSnapshot(
    p.get("from"),
    p.get("to"),
    p.get("venue"),
    p.get("run"),
  );
  const table = p.get("table");
  if (table && !report.tables.some(row => row.name === table)) return new Response("Unknown report table", {status:400});
  return new Response(table ? reportTableCsv(report, table) : reportCsv(report, id), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prep-accounting_${id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Export-Snapshot": id,
    },
  });
}
