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
