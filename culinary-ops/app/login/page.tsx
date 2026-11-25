import { safeReturnTo } from "@/lib/auth/login-return";
import { LoginForm } from "./LoginForm";
import { Card } from "@/components/ui";
import { ShallotMark, Wordmark } from "@/components/Brand";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-aubergine text-porcelain">
            <ShallotMark className="h-9 w-9" />
          </div>
          <h1 className="text-4xl leading-none text-aubergine">
            <Wordmark />
          </h1>
          <p className="mt-3 font-display text-lg italic text-zinc-600">Built for the back of house.</p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">angryshallot.com</p>
        </div>
        <Card className="p-6">
          <LoginForm returnTo={returnTo} />
        </Card>
        <p className="mt-5 text-center font-mono text-[11px] leading-relaxed text-zinc-400">
          Sign in with the email and password assigned by your administrator.
        </p>
      </div>
    </div>
  );
}
