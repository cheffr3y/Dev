"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl">
        ⚠️
      </div>
      <h1 className="font-display text-2xl leading-none tracking-tight text-ink">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm text-zinc-500">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Try again
      </button>
    </div>
  );
}
