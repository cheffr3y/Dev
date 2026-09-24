import Link from "next/link";
import { requirePrepUser } from "@/lib/prep-session";
import { getPrepReport } from "@/lib/prep-accounting-report";
import { chicagoToday } from "@/lib/prep-dates";
import { prisma } from "@/lib/prisma";
import { PageHeader, Input, Button, Select, Card } from "@/components/ui";
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; venue?: string }>;
}) {
  await requirePrepUser("ADMIN");
  const p = await searchParams;
  const [report, venues, runs] = await Promise.all([
    getPrepReport(
      p.from ?? chicagoToday(),
      p.to ?? p.from ?? chicagoToday(),
      p.venue,
    ),
    prisma.venue.findMany({ orderBy: { name: "asc" }, take: 200 }),
    prisma.transferReportRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const query = new URLSearchParams({
    from: report.from,
    to: report.to,
    ...(p.venue ? { venue: p.venue } : {}),
  }).toString();
  return (
    <div>
      <PageHeader
        title="Accounting"
        subtitle="Review venue totals, resolve missing costs, and download for accounting."
      />
      <form className="mb-5 flex flex-wrap gap-3">
        <Input
          aria-label="From date"
          type="date"
          name="from"
          defaultValue={report.from}
        />
        <Input
          aria-label="To date"
          type="date"
          name="to"
          defaultValue={report.to}
        />
        <Select aria-label="Venue" name="venue" defaultValue={p.venue ?? ""}>
          <option value="">All venues</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Button>Apply</Button>
      </form>
      <p className="mb-5 flex gap-5">
        <a
          className="text-blue-700"
          href={`/prep-orders/report/export?${query}`}
        >
          Download CSV
        </a>
        <a
          className="text-blue-700"
          href={`/prep-orders/report/export-xlsx?${query}`}
        >
          Download Excel
        </a>
      </p>
      <p className="mb-5 text-sm">
        Transfer dates determine charges; returns and corrections use adjustment
        dates. Late completions require review of the original period. Exports
        never post charges.
      </p>
      {report.tables.map((table) => (
        <Card key={table.name} className="mb-5 overflow-x-auto p-4">
          <details
            open={["Venue Summary", "Ready Charges", "Pending Issues"].includes(
              table.name,
            )}
          >
            <summary className="mb-3 cursor-pointer text-lg font-semibold">
              {table.name}
              {table.name === "Pending Issues"
                ? " · excluded from ready totals"
                : ""}
            </summary>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {table.headers.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {row.map((v, j) => (
                      <td key={j} className="px-3 py-2">
                        {v == null ? (
                          "—"
                        ) : table.currencyColumns?.includes(j) &&
                          typeof v === "number" ? (
                          `$${v.toFixed(2)}`
                        ) : j === 0 &&
                          ["Ready Charges", "Pending Issues"].includes(
                            table.name,
                          ) &&
                          report.transferStableIds.includes(String(v)) ? (
                          <Link
                            className="text-blue-700"
                            href={`/prep-orders/transfers/${v}`}
                          >
                            {v}
                          </Link>
                        ) : (
                          String(v)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!table.rows.length && (
              <p className="text-sm text-zinc-500">None in this period.</p>
            )}
          </details>
        </Card>
      ))}
      <Card className="p-4">
        <h2 className="font-semibold">Previous exports</h2>
        {runs
          .filter((r) => r.snapshot)
          .map((r) => (
            <p key={r.id} className="my-2 text-sm">
              {r.stableId} · {r.fromDate.toISOString().slice(0, 10)} –{" "}
              {r.toDate.toISOString().slice(0, 10)} ·{" "}
              <a href={`/prep-orders/report/export?run=${r.stableId}`}>CSV</a> ·{" "}
              <a href={`/prep-orders/report/export-xlsx?run=${r.stableId}`}>
                Excel
              </a>
            </p>
          ))}
      </Card>
    </div>
  );
}
