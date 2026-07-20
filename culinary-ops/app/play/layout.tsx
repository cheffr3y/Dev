import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Mise Trivia",
  description: "Head-to-head trivia — join with a room code.",
};

// Public shell for the trivia play surface: no sidebar, no session, just a
// centered column sized for a phone held in one hand.
export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream px-4 py-6">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}
