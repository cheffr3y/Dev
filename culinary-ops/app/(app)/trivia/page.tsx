import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { TRIVIA_CATEGORIES } from "@/lib/trivia";
import { CreateGameForm } from "./CreateGameForm";

const STATUS_LABEL: Record<string, string> = {
  LOBBY: "In lobby",
  IN_QUESTION: "In progress",
  REVEAL: "In progress",
  FINISHED: "Finished",
  ABANDONED: "Abandoned",
};

export default async function TriviaPage() {
  const user = await requireUser();
  const recent = await prisma.triviaGame.findMany({
    where: { hostUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { players: { orderBy: { score: "desc" } } },
  });

  return (
    <div>
      <PageHeader
        title="Trivia"
        subtitle="Head-to-head, two phones, one winner. Loser does the dishes."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-xl text-ink">New game</h2>
          <CreateGameForm categories={[...TRIVIA_CATEGORIES]} />
        </Card>

        <Card>
          <CardHeader>Recent games</CardHeader>
          <div className="divide-y divide-hairline">
            {recent.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">
                No games yet — start one and share the room code.
              </p>
            )}
            {recent.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <span className="font-mono text-sm font-semibold tracking-widest text-ink">
                    {g.code}
                  </span>
                  <p className="text-xs text-zinc-500">
                    {g.categoryName ?? "Any category"} ·{" "}
                    {g.players.map((p) => `${p.name} ${p.score}`).join(" vs ") || "no players"}
                  </p>
                </div>
                <Badge>{STATUS_LABEL[g.status] ?? g.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
