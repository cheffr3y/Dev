import Link from "next/link";
export default function PrepLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav
        aria-label="Prep Orders"
        className="no-print mb-6 flex gap-6 border-b border-hairline pb-3 text-sm"
      >
        <Link href="/prep-orders">Today</Link>
        <Link href="/prep-orders/requests">Requests</Link>
        <Link href="/prep-orders/history">History</Link>
        <Link href="/prep-orders/report">Accounting</Link>
      </nav>
      {children}
    </>
  );
}
