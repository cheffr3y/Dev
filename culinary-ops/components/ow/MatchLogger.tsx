"use client";

import { useMemo, useState } from "react";
import type { OwRole } from "@prisma/client";
import { Button, Card, Textarea, cn } from "@/components/ui";
import { logMatch } from "@/app/(app)/ow/actions";

type HeroOpt = { id: string; name: string; role: OwRole; inPool: boolean };
type MapOpt = { id: string; name: string; mode: string };

const ROLES: OwRole[] = ["TANK", "DPS", "SUPPORT"];
const ROLE_LABEL: Record<OwRole, string> = { TANK: "Tank", DPS: "DPS", SUPPORT: "Support" };
const RESULTS = [
  { value: "WIN", label: "Win", tone: "win" },
  { value: "LOSS", label: "Loss", tone: "loss" },
  { value: "DRAW", label: "Draw", tone: "draw" },
] as const;

const RATINGS = [
  { name: "ratePositioning", label: "Positioning", low: "sloppy", high: "clean" },
  { name: "rateUltUsage", label: "Ult usage", low: "wasted", high: "impactful" },
  { name: "rateTilt", label: "Tilt", low: "calm", high: "tilted" },
] as const;

// Tap-only match logger — one screen, large touch targets. Jeff logs from his
// phone between queues, so every step is a tap and the form scrolls top to
// bottom in logging order (spec §6 /ow/log).
export function MatchLogger({
  heroes,
  maps,
  heroPlayCounts,
  mapPlayCounts,
  lastRole,
}: {
  heroes: HeroOpt[];
  maps: MapOpt[];
  heroPlayCounts: Record<string, number>;
  mapPlayCounts: Record<string, number>;
  lastRole: OwRole;
}) {
  const [role, setRole] = useState<OwRole>(lastRole);
  const [hero, setHero] = useState<string | null>(null);
  const [map, setMap] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [mapQuery, setMapQuery] = useState("");
  const [showMore, setShowMore] = useState(false);

  // Pool heroes for the role, most-played first. Fall back to all role heroes
  // when the pool is empty (e.g. Support, which is out-of-pool by default).
  const heroChoices = useMemo(() => {
    const forRole = heroes.filter((h) => h.role === role);
    const pool = forRole.filter((h) => h.inPool);
    const list = pool.length ? pool : forRole;
    return [...list].sort(
      (a, b) => (heroPlayCounts[b.id] ?? 0) - (heroPlayCounts[a.id] ?? 0) || a.name.localeCompare(b.name),
    );
  }, [heroes, role, heroPlayCounts]);

  const mapChoices = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    return [...maps]
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort(
        (a, b) => (mapPlayCounts[b.id] ?? 0) - (mapPlayCounts[a.id] ?? 0) || a.name.localeCompare(b.name),
      );
  }, [maps, mapQuery, mapPlayCounts]);

  const ready = hero && map && result && RATINGS.every((r) => ratings[r.name]);

  function pickRole(next: OwRole) {
    setRole(next);
    setHero(null); // hero list changes with role
  }

  return (
    <form action={logMatch} className="space-y-6 pb-24">
      {/* Hidden values submitted to the server action */}
      <input type="hidden" name="role" value={role} />
      {hero && <input type="hidden" name="hero" value={hero} />}
      {map && <input type="hidden" name="map" value={map} />}
      {result && <input type="hidden" name="result" value={result} />}
      {RATINGS.map((r) => ratings[r.name] && <input key={r.name} type="hidden" name={r.name} value={ratings[r.name]} />)}

      {/* 1. Role */}
      <Section step={1} title="Role">
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <TapButton key={r} active={role === r} onClick={() => pickRole(r)}>
              {ROLE_LABEL[r]}
            </TapButton>
          ))}
        </div>
      </Section>

      {/* 2. Hero */}
      <Section step={2} title="Hero">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {heroChoices.map((h) => (
            <TapButton key={h.id} active={hero === h.id} onClick={() => setHero(h.id)}>
              {h.name}
            </TapButton>
          ))}
        </div>
      </Section>

      {/* 3. Map */}
      <Section step={3} title="Map">
        <input
          value={mapQuery}
          onChange={(e) => setMapQuery(e.target.value)}
          placeholder="Search maps…"
          className="mb-2 w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {mapChoices.map((m) => (
            <TapButton key={m.id} active={map === m.id} onClick={() => setMap(m.id)}>
              {m.name}
            </TapButton>
          ))}
        </div>
      </Section>

      {/* 4. Result */}
      <Section step={4} title="Result">
        <div className="grid grid-cols-3 gap-2">
          {RESULTS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setResult(r.value)}
              className={cn(
                "rounded-lg border px-4 py-4 text-base font-semibold tracking-wide transition-colors",
                result === r.value
                  ? r.tone === "win"
                    ? "border-emerald-600 bg-pale-sage text-emerald-700"
                    : r.tone === "loss"
                      ? "border-red-500 bg-red-50 text-red-600"
                      : "border-zinc-400 bg-stone text-ink"
                  : "border-hairline bg-canvas text-zinc-500 hover:border-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Section>

      {/* 5. Self-ratings */}
      <Section step={5} title="Self-ratings">
        <div className="space-y-4">
          {RATINGS.map((r) => (
            <RatingRow
              key={r.name}
              label={r.label}
              low={r.low}
              high={r.high}
              value={ratings[r.name] ?? 0}
              onChange={(v) => setRatings((prev) => ({ ...prev, [r.name]: v }))}
            />
          ))}
        </div>
      </Section>

      {/* 6. Optional detail */}
      <div>
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          className="text-sm font-medium text-blue-600"
        >
          {showMore ? "− Hide" : "+ Add"} deaths, enemy comp, notes
        </button>
        {showMore && (
          <Card className="mt-2 space-y-3 p-4">
            <label className="block">
              <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Deaths</span>
              <input
                name="deaths"
                type="number"
                min="0"
                inputMode="numeric"
                className="w-28 rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
              />
            </label>
            <EnemyCompPicker heroes={heroes} />
            <label className="block">
              <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Notes</span>
              <Textarea name="notes" placeholder="What happened, what to fix…" />
            </label>
          </Card>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-cream/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {ready ? "Ready to save" : "Pick role, hero, map, result, and all three ratings"}
          </p>
          <Button type="submit" disabled={!ready} className="px-8 py-3 text-base">
            Save match
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone text-[11px] text-ink">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function TapButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
        active ? "border-ink bg-ink text-white" : "border-hairline bg-canvas text-ink hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}

function RatingRow({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-[11px] text-zinc-400">
          1 {low} · 5 {high}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "rounded-lg border py-3 text-base font-semibold transition-colors",
              value === n ? "border-gold bg-gold text-white" : "border-hairline bg-canvas text-zinc-500 hover:border-ink",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// Multi-select enemy hero grid → comma-separated hidden input. Optional.
function EnemyCompPicker({ heroes }: { heroes: HeroOpt[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const sorted = useMemo(
    () => [...heroes].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    [heroes],
  );
  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  return (
    <div>
      <input type="hidden" name="enemyComp" value={picked.join(",")} />
      <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
        Enemy comp {picked.length > 0 && `(${picked.length})`}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => toggle(h.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              picked.includes(h.id) ? "border-ink bg-ink text-white" : "border-hairline bg-canvas text-zinc-500 hover:border-ink",
            )}
          >
            {h.name}
          </button>
        ))}
      </div>
    </div>
  );
}
