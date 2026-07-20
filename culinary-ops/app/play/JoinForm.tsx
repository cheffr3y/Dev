"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { joinGame } from "./actions";

export function JoinForm() {
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
      const result = await joinGame({
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      localStorage.setItem(`trivia:player:${result.code}`, result.token);
      router.push(`/play/${result.code}`);
    } catch {
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Room code">
        <Input
          name="code"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          placeholder="K7QF2"
          className="text-center font-mono text-2xl uppercase tracking-[0.35em]"
        />
      </Field>
      <Field label="Your name">
        <Input name="name" required maxLength={24} placeholder="Sam" autoComplete="given-name" />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="gold" disabled={busy} className="min-h-12 w-full text-base">
        {busy ? "Joining…" : "Join game"}
      </Button>
    </form>
  );
}
