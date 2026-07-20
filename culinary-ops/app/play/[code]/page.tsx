import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeRoomCode } from "@/lib/trivia-engine";
import { TriviaPlayClient } from "./TriviaPlayClient";

export default async function PlayGamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = normalizeRoomCode(raw);
  const game = await prisma.triviaGame.findUnique({
    where: { code },
    select: { code: true },
  });
  if (!game) notFound();
  return <TriviaPlayClient code={code} />;
}
