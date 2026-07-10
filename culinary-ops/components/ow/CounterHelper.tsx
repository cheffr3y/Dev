"use client";

import { useMemo, useState } from "react";
import type { OwRole } from "@prisma/client";
import { Button, Card, cn } from "@/components/ui";
import { recommend } from "@/lib/ow/counterEngine";
import { analyzeCounterPick, type AnalyzeResult } from "@/app/(app)/ow/actions";

type HeroOpt = { id: string; name: string; role: OwRole };
type MapOpt = { id: string; name: string; mode: string };

const ROLES: OwRole[] = ["TANK", "DPS", "SUPPORT"];
const ROLE_LABEL: Record<OwRole, string> = { TANK: "Tank", DPS: "DPS", SUPPORT: "Support" };

// Counter-pick helper. The rules engine runs instantly client-side; the AI
// "Deeper analysis" is an optional enhancement that never blocks the rules
// result (spec §5).
export function CounterHelper({
  maps,
  heroes,
  pools,
  personalStats,
}: {
  maps: MapOpt[];
  heroes: HeroOpt[];
  pools: Record<OwRole, string[]>;
  personalStats: Record<string, { games: number; winRate: number }>;
}) {
  const [mapId, setMapId] = useState<string>(maps[0]?.id ?? "");
  const [role, setRole] = useState<OwRole>("TANK");
  const [enemies, setEnemies] = useState<string[]>([]);
  const [mapQuery, setMapQuery] = useState("");

  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<AnalyzeResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const pool = useMemo(() => pools[role] ?? [], [pools, role]);

  const result = useMemo(
    () => recommend({ map: mapId, enemyHeroes: enemies, role, pool, personalStats }),
    [mapId, enemies, role, pool, personalStats],
  );

  const mapChoices = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    return maps.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [maps, mapQuery]);

  const enemyChoices = useMemo(
    () => [...heroes].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    [heroes],
  );

  function toggleEnemy(id: string) {
    setAi(null);
    setAiError(null);
    setEnemies((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 5 ? prev : [...prev, id],
    );
  }

  async function runAi() {
    setAiLoading(true);
    setAiError(null);
    setAi(null);
    const res = await analyzeCounterPick({ map: mapId, enemyHeroes: enemies, role });
    setAiLoading(false);
    if (res.ok) setAi(res.data);
    else setAiError(res.error);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Inputs */}
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Your role</h2>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setAi(null);
                }}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  role === r ? "border-ink bg-ink text-white" : "border-hairline bg-canvas text-ink hover:border-ink",
                )}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          {pool.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              No {ROLE_LABEL[role]} heroes in your pool — flip <code>inPool</code> in lib/ow/data/heroes.ts.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Map</h2>
          <input
            value={mapQuery}
            onChange={(e) => setMapQuery(e.target.value)}
            placeholder="Search maps…"
            className="mb-2 w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {mapChoices.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMapId(m.id);
                  setAi(null);
                }}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  mapId === m.id ? "border-ink bg-ink text-white" : "border-hairline bg-canvas text-ink hover:border-ink",
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">
            Enemy heroes {enemies.length > 0 && `(${enemies.length}/5)`}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {enemyChoices.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => toggleEnemy(h.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  enemies.includes(h.id) ? "border-ink bg-ink text-white" : "border-hairline bg-canvas text-zinc-500 hover:border-ink",
                )}
              >
                {h.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">Partial info is fine — pick 0–5.</p>
        </section>
      </div>

      {/* Results */}
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Rules pick — instant</h2>
            <span className="rounded-full border border-hairline bg-zinc-50 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">
              {result.archetypeConfident ? `${result.archetype} comp` : "mixed / partial"}
            </span>
          </div>

          {pool.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">Add heroes to your pool to get recommendations.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {result.recommendations.map((r, i) => (
                <li key={r.heroId} className="rounded-lg border border-hairline p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-ink">
                      <span className="mr-1.5 text-zinc-400">{i + 1}.</span>
                      {r.heroName}
                    </span>
                    <span className="font-mono text-sm text-zinc-600">score {r.score}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {r.parts.map((p, j) => (
                      <li key={j} className="flex justify-between text-xs text-zinc-500">
                        <span>{p.label}</span>
                        <span className={cn("font-mono", p.value >= 0 ? "text-emerald-700" : "text-red-600")}>
                          {p.value >= 0 ? "+" : ""}
                          {p.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          {pool.length > 0 && (
            <div className="mt-4">
              <Button type="button" variant="gold" onClick={runAi} disabled={aiLoading}>
                {aiLoading ? "Analyzing…" : "Deeper analysis"}
              </Button>
            </div>
          )}
        </Card>

        {aiError && (
          <Card className="border-amber-300 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">{aiError}</p>
          </Card>
        )}

        {ai && (
          <Card className="p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">AI deep analysis</h2>
            <p className="mt-3 text-sm">
              <span className="font-medium text-ink">Primary:</span> {ai.primary}
            </p>
            {ai.alternates.length > 0 && (
              <p className="mt-1 text-sm text-zinc-600">Alternates: {ai.alternates.join(", ")}</p>
            )}
            {ai.reasoning && <p className="mt-3 text-sm text-zinc-700">{ai.reasoning}</p>}
            {ai.swapTriggers && (
              <p className="mt-3 rounded-md bg-pale-gold px-3 py-2 text-sm text-amber-900">
                <span className="font-medium">Swap trigger:</span> {ai.swapTriggers}
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
