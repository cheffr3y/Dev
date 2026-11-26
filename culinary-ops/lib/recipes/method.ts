// Method steps are stored as plain text lines (one step per line). To give each
// step a scannable action label up front — e.g. "Build Roux — combine the AP
// flour with the drippings and whisk continuously" — we treat the text before
// the first " — " (em dash, padded) as the action and the rest as the detail.
//
// The separator is the padded em dash specifically so it never collides with
// the en dash ("–") legacy steps use for timing, e.g. "Mince shallots – 3 min".
// Steps written before this convention simply have no action and render as-is.

export const STEP_SEPARATOR = " — ";

export type MethodStep = { action: string; detail: string };

export function splitStep(text: string): MethodStep {
  const i = text.indexOf(STEP_SEPARATOR);
  if (i === -1) return { action: "", detail: text };
  return {
    action: text.slice(0, i).trim(),
    detail: text.slice(i + STEP_SEPARATOR.length).trim(),
  };
}

export function joinStep(action: string, detail: string): string {
  const a = action.trim();
  const d = detail.trim();
  if (!a) return d;
  if (!d) return a;
  return `${a}${STEP_SEPARATOR}${d}`;
}

// Recipes imported from FoxtownHQ carry a "— Migrated notes —" block appended
// to the method (equipment, critical steps, storage, shelf life …). On paper
// those are notes, not numbered steps. Bookkeeping lines (recipe type, source
// venue, menu descriptor, prep time) mean nothing to a cook and are dropped.
const MIGRATED_MARKER = /^[—–-]*\s*Migrated notes\s*[—–-]*$/i;
const BOOKKEEPING = /^(?:Recipe type|Source venue|Menu descriptor|Prep time \(min\))\s*:/i;

export function splitMethodAndNotes(instructions: string | null | undefined): { steps: string[]; notes: string[] } {
  const steps: string[] = [], notes: string[] = [];
  let inNotes = false;
  for (const raw of (instructions ?? "").split(/\r?\n/)) {
    const line = raw.trim().replace(/^\d+[.)]\s*/, "");
    if (!line) continue;
    if (MIGRATED_MARKER.test(line)) { inNotes = true; continue; }
    if (BOOKKEEPING.test(line)) continue;
    (inNotes ? notes : steps).push(line);
  }
  return { steps, notes };
}
