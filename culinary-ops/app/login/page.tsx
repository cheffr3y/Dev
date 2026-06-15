import { LoginForm } from "./LoginForm";
import { Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-charcoal font-display text-xl text-white">
            M
          </div>
          <h1 className="font-display text-4xl leading-none tracking-tight text-ink">Mise</h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
            Culinary operations, all in one place
          </p>
        </div>
        <Card className="p-6">
          <LoginForm />
        </Card>
        <p className="mt-5 text-center font-mono text-[11px] leading-relaxed text-zinc-400">
          Demo: admin@culinaryops.test · manager@culinaryops.test · cook@culinaryops.test
          <br />
          password: password123
        </p>
      </div>
    </div>
  );
}
