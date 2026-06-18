"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Card, EmptyState, cn } from "@/components/ui";

// One order's worth of dashboard data — already shaped + serialized on the
// server so this stays a thin presentational client island (the tabs need
// local state, everything else is render-only).
export type OrderSummary = {
  id: string;
  ref: string;
  dateLabel: string;
  total: number;
  open: number;
  user: string;
  cost: string;
  status: "draft" | "in_progress" | "completed";
  notes: string | null;
};

const TABS = [
  { key: "active", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "historical", label: "Historical" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_META: Record<
  OrderSummary["status"],
  { label: string; color: "gray" | "blue" | "green" }
> = {
  draft: { label: "Draft", color: "gray" },
  in_progress: { label: "In Progress", color: "blue" },
  completed: { label: "Completed", color: "green" },
};

const EMPTY_HINT: Record<TabKey, string> = {
  active: "Orders due today (or overdue) with work still open land here.",
  scheduled: "Upcoming production dates show up here before they're due.",
  historical: "Finished orders are filed here once every line is resolved.",
};

export function PrepOrdersTabs({
  active,
  scheduled,
  historical,
}: {
  active: OrderSummary[];
  scheduled: OrderSummary[];
  historical: OrderSummary[];
}) {
  const [tab, setTab] = useState<TabKey>(
    active.length > 0 ? "active" : scheduled.length > 0 ? "scheduled" : "active",
  );
  const groups: Record<TabKey, OrderSummary[]> = { active, scheduled, historical };
  const orders = groups[tab];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Prep order groups"
        className="mb-5 flex items-center gap-6 border-b border-hairline"
      >
        {TABS.map((t) => {
          const selected = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-0.5 pb-2.5 text-sm font-medium tracking-wide transition-colors",
                selected
                  ? "border-ink text-ink"
                  : "border-transparent text-zinc-400 hover:text-zinc-600",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[11px] leading-none",
                  selected ? "bg-stone text-zinc-600" : "bg-zinc-100 text-zinc-400",
                )}
              >
                {groups[t.key].length}
              </span>
            </button>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <EmptyState title={`No ${tab} prep orders`} hint={EMPTY_HINT[tab]} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  const status = STATUS_META[order.status];
  return (
    <Link href={`/prep-orders/${order.id}`} className="group block">
      <Card className="flex h-full flex-col p-3.5 transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight text-ink">
              {order.dateLabel}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-zinc-400">
              {order.ref}
            </p>
          </div>
          <Badge color={status.color}>{status.label}</Badge>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-hairline pt-3">
          <Metric label="Lines">{order.total}</Metric>
          <Metric label="Open">{order.open}</Metric>
          <Metric label="By">
            <span className="truncate" title={order.user}>
              {order.user}
            </span>
          </Metric>
          <Metric label="Cost">{order.cost}</Metric>
        </dl>

        {order.notes && (
          <p className="mt-2.5 line-clamp-2 text-xs leading-snug text-zinc-500">
            {order.notes}
          </p>
        )}
      </Card>
    </Link>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.04em] text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 flex truncate text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
