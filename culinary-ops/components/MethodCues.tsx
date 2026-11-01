import { methodCues, type MethodCueKind } from "@/lib/recipes/method-cues";

const LABELS: Record<MethodCueKind, string> = {
  technique: "Technique", time: "Time", temperature: "Temperature", endpoint: "Endpoint",
};

function CueIcon({ kind }: { kind: MethodCueKind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "time" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>}
    {kind === "temperature" && <><path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z" /><path d="M12 8v9" /><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" /></>}
    {kind === "technique" && <><path d="M7 15a4.5 4.5 0 1 1 0-9 5.5 5.5 0 0 1 10 0 4.5 4.5 0 1 1 0 9v5H7Z" /><path d="M7 16h10" /></>}
    {kind === "endpoint" && <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>}
  </svg>;
}

export function MethodCues({ step }: { step: string }) {
  const cues = methodCues(step);
  if (cues.length === 0) return null;
  return <ul className="recipe-cues" aria-label="Method cues">
    {cues.map(cue => <li key={`${cue.kind}:${cue.label}`} className="recipe-cue" data-kind={cue.kind}
      aria-label={`${LABELS[cue.kind]}: ${cue.label}`}>
      <CueIcon kind={cue.kind} />
      <span>{cue.label}</span>
    </li>)}
  </ul>;
}
