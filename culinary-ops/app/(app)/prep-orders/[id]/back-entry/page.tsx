import { redirect } from "next/navigation";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
export default async function BackEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePrepUser("ADMIN");
  const { id } = await params;
  const order = await prisma.prepOrder.findUnique({
    where: { id },
    select: { forDate: true },
  });
  redirect(
    `/prep-orders/closeout${order ? `?date=${order.forDate.toISOString().slice(0, 10)}` : ""}`,
  );
}
