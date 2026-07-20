"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { TRIVIA_CATEGORIES, TRIVIA_DIFFICULTIES, createGame } from "@/lib/trivia";

const createSchema = z.object({
  categoryId: z.number().int().nullable(),
  difficulty: z.enum(TRIVIA_DIFFICULTIES).nullable(),
  questionCount: z.number().int().min(3).max(20),
  questionSecs: z.number().int().min(10).max(60),
});

// Called programmatically from CreateGameForm (not a <form action>) so the
// client can stash the returned host token in localStorage before navigating
// to the public play screen.
export async function createTriviaGame(input: {
  categoryId: number | null;
  difficulty: string | null;
  questionCount: number;
  questionSecs: number;
}): Promise<{ code: string; hostToken: string; usedFallback: boolean }> {
  const user = await requireUser();
  const d = createSchema.parse({
    ...input,
    difficulty: input.difficulty as (typeof TRIVIA_DIFFICULTIES)[number] | null,
  });
  if (d.categoryId !== null && !TRIVIA_CATEGORIES.some((c) => c.id === d.categoryId)) {
    throw new Error("Unknown category.");
  }
  return createGame({
    hostUserId: user.id,
    hostName: user.name.split(" ")[0] || user.name,
    categoryId: d.categoryId,
    difficulty: d.difficulty,
    questionCount: d.questionCount,
    questionSecs: d.questionSecs,
  });
}
