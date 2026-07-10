"use client";

import { useMemo, useState } from "react";
import type { OwRole } from "@prisma/client";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { updateMatch, deleteMatch } from "@/app/(app)/ow/actions";

type HeroOpt = { id: string; name: string; role: OwRole };
type MapOpt = { id: string; name: string };

export type EditableMatch = {
  id: string;
  role: OwRole;
  hero: string;
  map: string;
  result: "WIN" | "LOSS" | "DRAW";
  ratePositioning: number;
  rateUltUsage: number;
  rateTilt: number;
  deaths: number | null;
  enemyComp: string[];
  heroSwaps: string[];
  notes: string | null;
};

const ROLES: OwRole[] = ["TANK", "DPS", "SUPPORT"];
const ROLE_LABEL: Record<OwRole, string> = { TANK: "Tank", DPS: "DPS", SUPPORT: "Support" };

// Edit form for a logged match. Role drives the hero list; changing role resets
// the hero so the submitted pair always agrees (the action rejects a mismatch).
export function MatchEditor({
  match,
  heroes,
  maps,
}: {
  match: EditableMatch;
  heroes: HeroOpt[];
  maps: MapOpt[];
}) {
  const [role, setRole] = useState<OwRole>(match.role);
  const [hero, setHero] = useState<string>(match.hero);

  const heroOptions = useMemo(
    () => heroes.filter((h) => h.role === role).sort((a, b) => a.name.localeCompare(b.name)),
    [heroes, role],
  );

  function pickRole(next: OwRole) {
    setRole(next);
    const stillValid = heroes.some((h) => h.id === hero && h.role === next);
    if (!stillValid) setHero(heroes.find((h) => h.role === next)?.id ?? "");
  }

  return (
    <div className="space-y-4">
      <form action={updateMatch} className="space-y-4">
        <input type="hidden" name="id" value={match.id} />
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="hero" value={hero} />
        <input type="hidden" name="enemyComp" value={match.enemyComp.join(",")} />
        <input type="hidden" name="heroSwaps" value={match.heroSwaps.join(",")} />

        <Card className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Role">
              <Select value={role} onChange={(e) => pickRole(e.target.value as OwRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Hero">
              <Select value={hero} onChange={(e) => setHero(e.target.value)}>
                {heroOptions.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Map">
              <Select name="map" defaultValue={match.map}>
                {[...maps].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Result">
              <Select name="result" defaultValue={match.result}>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
                <option value="DRAW">Draw</option>
              </Select>
            </Field>
            <Field label="Deaths">
              <Input name="deaths" type="number" min="0" defaultValue={match.deaths ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Positioning (1–5)">
              <Input name="ratePositioning" type="number" min="1" max="5" defaultValue={match.ratePositioning} required />
            </Field>
            <Field label="Ult usage (1–5)">
              <Input name="rateUltUsage" type="number" min="1" max="5" defaultValue={match.rateUltUsage} required />
            </Field>
            <Field label="Tilt (1–5)">
              <Input name="rateTilt" type="number" min="1" max="5" defaultValue={match.rateTilt} required />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea name="notes" defaultValue={match.notes ?? ""} />
          </Field>

          <Button type="submit">Save changes</Button>
        </Card>
      </form>

      <form action={deleteMatch}>
        <input type="hidden" name="id" value={match.id} />
        <ConfirmDelete />
      </form>
    </div>
  );
}

function ConfirmDelete() {
  return (
    <Button
      type="submit"
      variant="danger"
      onClick={(e) => {
        if (!window.confirm("Delete this match? This can't be undone.")) e.preventDefault();
      }}
    >
      Delete match
    </Button>
  );
}
