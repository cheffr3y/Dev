import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl leading-none tracking-tight text-ink md:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline bg-canvas shadow-[0_1px_2px_rgba(26,26,26,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-hairline px-5 py-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
      {children}
    </div>
  );
}

const buttonStyles = {
  primary: "rounded-full bg-primary text-white hover:bg-zinc-700",
  secondary: "rounded-full border border-hairline bg-canvas text-ink hover:border-ink",
  danger: "rounded-full border border-red-200 bg-transparent text-red-600 hover:border-red-600",
  gold: "rounded-full bg-gold text-white hover:bg-amber-700",
};

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-medium tracking-wide transition-colors disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  href,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-medium tracking-wide transition-colors",
        buttonStyles[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

const fieldBase =
  "w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(fieldBase, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(fieldBase, "min-h-[80px]", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cn(fieldBase, props.className)} />;
}

const badgeStyles: Record<string, string> = {
  gray: "border-hairline bg-zinc-50 text-zinc-600",
  green: "border-emerald-600/30 bg-pale-sage text-emerald-700",
  red: "border-red-200 bg-red-50 text-red-600",
  amber: "border-amber-300 bg-amber-50 text-amber-700",
  blue: "border-blue-600/25 bg-blue-100 text-blue-600",
};

export function Badge({
  children,
  color = "gray",
}: {
  children: ReactNode;
  color?: keyof typeof badgeStyles;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.02em]",
        badgeStyles[color],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-400">{hint}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg bg-stone p-5 transition-colors hover:bg-zinc-200">
      <p className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">{label}</p>
      <p className="mt-3 font-display text-3xl leading-none tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-2 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
