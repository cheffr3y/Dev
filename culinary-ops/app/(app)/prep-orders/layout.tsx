import Link from "next/link";
import { requirePrepUser } from "@/lib/prep-session";
export default async function PrepLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePrepUser();
  return (
    <>
      <nav
        aria-label="Prep Orders"
        className="no-print mb-6 flex flex-wrap gap-4 border-b border-hairline pb-3 text-sm"
      >
        <Link href="/prep-orders">Daily Prep</Link>
        {user.role === "ADMIN" && (
          <Link href="/prep-orders/closeout">Closeout &amp; Accounting</Link>
        )}
      </nav>
      {children}
    </>
  );
}
