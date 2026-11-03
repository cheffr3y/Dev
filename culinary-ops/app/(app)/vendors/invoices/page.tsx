import { redirect } from "next/navigation";

// Preserve bookmarked invoices and filter selections at the former vendor URL.
export default async function LegacyInvoicesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, part);
    }
  }
  redirect(`/invoices${query.size ? `?${query}` : ""}`);
}
