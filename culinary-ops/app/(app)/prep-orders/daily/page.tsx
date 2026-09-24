import { redirect } from "next/navigation";
export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  redirect(`/prep-orders${date ? `?date=${encodeURIComponent(date)}` : ""}`);
}
