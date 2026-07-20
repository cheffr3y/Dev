"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import { createTriviaGame } from "./actions";

// Programmatic action call (not <form action>) because the host token must
// land in localStorage before we navigate to the public play screen.
export function CreateGameForm({
  categories,
}: {
  categories: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const { code, hostToken, usedFallback } = await createTriviaGame({
        categoryId: form.get("categoryId") ? Number(form.get("categoryId")) : null,
        difficulty: (form.get("difficulty") as string) || null,
        questionCount: Number(form.get("questionCount")),
        questionSecs: Number(form.get("questionSecs")),
      });
      localStorage.setItem(`trivia:player:${code}`, hostToken);
      if (usedFallback) {
        localStorage.setItem(`trivia:fallback:${code}`, "1");
      }
      router.push(`/play/${code}`);
    } catch {
      setError("Couldn't start a game. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select name="categoryId" defaultValue="">
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty">
          <Select name="difficulty" defaultValue="">
            <option value="">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
        <Field label="Questions">
          <Select name="questionCount" defaultValue="10">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
          </Select>
        </Field>
        <Field label="Seconds per question">
          <Select name="questionSecs" defaultValue="20">
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
            <option value="30">30</option>
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="gold" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Setting the table…" : "Start a game"}
      </Button>
    </form>
  );
}
