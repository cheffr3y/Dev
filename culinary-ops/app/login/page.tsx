import { LoginForm } from "./LoginForm";
import { Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white">
            M
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Mise</h1>
          <p className="text-sm text-zinc-500">Culinary operations, all in one place.</p>
        </div>
        <Card className="p-6">
          <LoginForm />
        </Card>
        <p className="mt-4 text-center text-xs text-zinc-400">
          Demo: admin@culinaryops.test · manager@culinaryops.test · cook@culinaryops.test
          <br />
          password: password123
        </p>
      </div>
    </div>
  );
}
