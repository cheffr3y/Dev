import { cn } from "./ui";

/*
 * angryshallot identity. The shallot mark is line art drawn in currentColor so
 * it inherits text color on aubergine chrome, porcelain pages, and paper.
 * The wordmark ends in a paprika period, as on the identity board.
 */
export function ShallotMark({ className, strokeWidth = 2.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <g transform="rotate(-9 32 34)">
        <path d="M33 9C31 17 25 22 18 29C10 37 9.5 49 17 55.5C24 61 40 61 47 55.5C54.5 49 54 37 46 29C39 22 35 17 33 9Z" />
        <path d="M32.5 13C29 23 22 30 20.5 41C19.5 49 23 55 28 58" />
        <path d="M33.5 13C37 23 44 30 45.5 41C46.5 49 43 55 38 58" />
        <path d="M33 16C31 28 28 40 30 58.5" />
        <path d="M33 9C34 5 37.5 2.5 43 2.5" />
        <path d="M33 9C32 6 29.5 4 26.5 3.5" />
        <path d="M28 59.5L26 62.5M33 60V63M38 59.5L40 62.5" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[-0.02em]", className)}>
      angryshallot<span className="text-paprika">.</span>
    </span>
  );
}

// Sidebar lockup on aubergine; compact navigation keeps just the mark.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-label="angryshallot" className="flex items-center gap-2.5 text-porcelain">
      <ShallotMark className={compact ? "h-8 w-8" : "h-9 w-9 shrink-0"} />
      {!compact && (
        <div className="min-w-0">
          <Wordmark className="block text-[24px] leading-none" />
          <p className="mt-1.5 whitespace-nowrap font-display text-[12px] italic text-white/65">Built for the back of house.</p>
        </div>
      )}
    </div>
  );
}
