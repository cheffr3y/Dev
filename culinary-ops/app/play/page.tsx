import { Card } from "@/components/ui";
import { JoinForm } from "./JoinForm";

export default function PlayJoinPage() {
  return (
    <div className="pt-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-charcoal font-display text-xl text-white">
          M
        </div>
        <h1 className="font-display text-4xl leading-none tracking-tight text-ink">Trivia</h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
          Two phones. One winner.
        </p>
      </div>
      <Card className="p-6">
        <JoinForm />
      </Card>
    </div>
  );
}
