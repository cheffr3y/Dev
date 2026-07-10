"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, Select, cn } from "@/components/ui";

export type HistoryRow = {
  id: string;
  playedAt: string; // ISO
  role: string;
  hero: string; // display name
  map: string; // display name
  result: "WIN" | "LOSS" | "DRAW";
  rateTilt: number;
  deaths: number | null;
};

const RESULT_COLOR: Record<HistoryRow["result"], "green" | "red" | "gray"> = {
  WIN: "green",
  LOSS: "red",
  DRAW: "gray",
};

// Filterable match table. Filtering is client-side over the already-loaded rows
// (a personal log stays small); each row links to its editable detail page.
export function MatchHistory({ rows }: { rows: HistoryRow[] }) {
  const [hero, setHero] = useState("");
  const [map, setMap] = useState("");
  const [result, setResult] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const heroes = useMemo(() => [...new Set(rows.map((r) => r.hero))].sort(), [rows]);
  const maps = useMemo(() => [...new Set(rows.map((r) => r.map))].sort(), [rows]);

  const filtered = useMemo(() => {
    const fromT = from ? new Date(from).getTime() : -Infinity;
    // include the whole "to" day
    const toT = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 : Infinity;
    return rows.filter((r) => {
      if (hero && r.hero !== hero) return false;
      if (map && r.map !== map) return false;
      if (result && r.result !== result) return false;
      const t = new Date(r.playedAt).getTime();
      return t >= fromT && t < toT;
    });
  }, [rows, hero, map, result, from, to]);

  const dateInput =
    "rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus";

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Hero</span>
            <Select value={hero} onChange={(e) => setHero(e.target.value)}>
              <option value="">All</option>
              {heroes.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Map</span>
            <Select value={map} onChange={(e) => setMap(e.target.value)}>
              <option value="">All</option>
              {maps.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Result</span>
            <Select value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">All</option>
              <option value="WIN">Win</option>
              <option value="LOSS">Loss</option>
              <option value="DRAW">Draw</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(dateInput, "w-full")} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(dateInput, "w-full")} />
          </label>
        </div>
      </Card>

      <p className="mb-2 text-xs text-zinc-500">
        {filtered.length} of {rows.length} matches
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-500">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Hero</th>
                <th className="px-4 py-2.5">Map</th>
                <th className="px-4 py-2.5">Result</th>
                <th className="px-4 py-2.5">Tilt</th>
                <th className="px-4 py-2.5">Deaths</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                    No matches for those filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">
                      {new Date(r.playedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{r.role.charAt(0) + r.role.slice(1).toLowerCase()}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">{r.hero}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{r.map}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={RESULT_COLOR[r.result]}>{r.result.toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{r.rateTilt}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{r.deaths ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/ow/matches/${r.id}`} className="text-sm text-blue-600 hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
