export type MethodCueKind = "technique" | "time" | "temperature" | "endpoint";
export type MethodCue = { kind: MethodCueKind; label: string };

const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?[¼½¾]?|[¼½¾])`;
const RANGE = `${NUMBER}(?:\\s*(?:[-–—]|to)\\s*${NUMBER})?`;
const QUALIFIER = String.raw`(?:(?:at\s+least|up\s+to|about|approximately|within|no\s+more\s+than|at\s+most)\s+)?`;
const DURATION = `${RANGE}\\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\\b`;
const TIME = new RegExp(`(?<![\\w./])${QUALIFIER}${DURATION}(?:\\s+(?:and\\s+)?${DURATION})*|\\bovernight\\b`, "gi");
const DEGREES = String.raw`(?:°\s*[FC]|degrees?\s*(?:Fahrenheit|Celsius|[FC]))\b`;
const TEMPERATURE = new RegExp(
  String.raw`(?<![\w.])(?:(?:at\s+least|up\s+to|below|above|under|over|no\s+higher\s+than|no\s+lower\s+than|do\s+not\s+exceed)\s+)?-?\d+(?:\.\d+)?(?:\s*${DEGREES})?(?:\s*(?:[-–—]|to)\s*-?\d+(?:\.\d+)?)?\s*${DEGREES}`,
  "gi",
);

const TECHNIQUES: Array<[RegExp, string, boolean?]> = [
  [/\bice[\s-]+bath\b/gi, "Ice bath", true],
  [/\bhigh[\s-]+shear\b/gi, "High shear", true],
  [/\bsous[\s-]+vide\b/gi, "Sous vide", true],
  [/\bdeep[\s-]+fry\b/gi, "Deep-fry"],
  [/\bpan[\s-]+fry\b/gi, "Pan-fry"],
  [/\bstir[\s-]+fry\b/gi, "Stir-fry"],
  [/\bblanch\b/gi, "Blanch"],
  [/\bshock\b/gi, "Shock"],
  [/\bboil\b/gi, "Boil"],
  [/\bboiling\s+water\b/gi, "Boiling water", true],
  [/\bsimmer\b/gi, "Simmer"],
  [/\bsaut[ée](?![a-zé])/gi, "Sauté"],
  [/\bsear\b/gi, "Sear"],
  [/\broast\b/gi, "Roast"],
  [/\bbake\b/gi, "Bake"],
  [/\bbraise\b/gi, "Braise"],
  [/\bpoach\b/gi, "Poach"],
  [/\bsteam\b/gi, "Steam"],
  [/\bgrill\b/gi, "Grill"],
  [/\bbroil\b/gi, "Broil"],
  [/\bfry\b/gi, "Fry"],
  [/\bsmoke\b/gi, "Smoke"],
  [/\btoast\b/gi, "Toast"],
  [/\bsweat\b/gi, "Sweat"],
  [/\bcarameli[sz]e\b/gi, "Caramelize"],
  [/\bdeglaze\b/gi, "Deglaze"],
  [/\breduce\b/gi, "Reduce"],
  [/\bwhisk\b/gi, "Whisk"],
  [/\bblend\b/gi, "Blend"],
  [/\bpur[ée]e\b/gi, "Purée"],
  [/\bpulse\b/gi, "Pulse"],
  [/\bfold\b/gi, "Fold"],
  [/\bemulsify\b/gi, "Emulsify"],
  [/\bknead\b/gi, "Knead"],
  [/\bproof\b/gi, "Proof"],
  [/\brest\b/gi, "Rest"],
  [/\bmarinate\b/gi, "Marinate"],
  [/\bstrain\b/gi, "Strain"],
  [/\bchill\b/gi, "Chill"],
  [/\bcool\b/gi, "Cool"],
  [/\bfreeze\b/gi, "Freeze"],
];

const ENDPOINTS: Array<[RegExp, string]> = [
  [/\bgolden[\s-]+brown\b/gi, "Golden brown"],
  [/\bfork[\s-]+tender\b/gi, "Fork tender"],
  [/\bal\s+dente\b/gi, "Al dente"],
  [/\bsoft\s+peaks\b/gi, "Soft peaks"],
  [/\bstiff\s+peaks\b/gi, "Stiff peaks"],
  [/\b(?:coats?\s+(?:the\s+back\s+of\s+)?(?:a\s+|the\s+)?spoon|nappe)\b/gi, "Coats spoon"],
  [/\bsmooth\b/gi, "Smooth"],
  [/\btranslucent\b/gi, "Translucent"],
  [/\bdoubled\s+in\s+(?:size|volume)\b/gi, "Doubled in size"],
];

function negated(text: string, index: number) {
  const clause = text.slice(0, index).split(/[.!?;,—]|\b(?:but|then)\b/i).at(-1) ?? "";
  return /\b(?:not|never|avoid|without|don't|don’t)\b/i.test(clause);
}

function actionContext(text: string, index: number) {
  const before = text.slice(0, index);
  // Commas/conjunctions can introduce ingredient nouns ("roast beef and
  // toast crumbs"), so only use clear instruction/clause starts here.
  return /(?:^|[.!?;:—]|\b(?:then|next))\s*(?:(?:gently|slowly|briefly|quickly|carefully)\s+)*$/i.test(before);
}

function normalizeTime(text: string) {
  return text.toLowerCase().replace(/\b(?:seconds?|secs?)\b/g, "sec")
    .replace(/\b(?:minutes?|mins?)\b/g, "min")
    .replace(/\b(?:hours?|hrs?)\b/g, "hr")
    .replace(/(\d|[¼½¾])\s*(sec|min|hr|day)/g, "$1 $2")
    .replace(/(?<=[\d¼½¾])\s*(?:[-–—]|\bto\b)\s*(?=\d|[¼½¾])/g, "–")
    .replace(/\s+/g, " ").trim().replace(/^overnight$/, "Overnight");
}

function normalizeTemperature(text: string) {
  return text.replace(/\s*(?:degrees?\s*(Fahrenheit|Celsius|[FC])|°\s*([FC]))/gi,
    (_, word: string | undefined, letter: string | undefined) => `°${(word ?? letter ?? "")[0].toUpperCase()}`)
    .replace(/(?<=[FC\d])\s*[-–—]\s*(?=\d)/g, "–").replace(/\s+/g, " ").trim();
}

// These are reading aids extracted from stored instructions, never inferred
// cooking targets. Keep numeric qualifiers, ignore negated techniques, and
// prefer times/temperatures if a step has more cues than the sheet can fit.
export function methodCues(step: string): MethodCue[] {
  const temperatures = [...step.matchAll(TEMPERATURE)].map(match => ({ kind: "temperature" as const, label: normalizeTemperature(match[0]) }));
  const times = [...step.matchAll(TIME)].map(match => ({ kind: "time" as const, label: normalizeTime(match[0]) }));
  const techniques = TECHNIQUES.flatMap(([pattern, label, anywhere]) => [...step.matchAll(pattern)]
    .filter(match => !negated(step, match.index) && (anywhere || actionContext(step, match.index)))
    .map(match => ({ kind: "technique" as const, label, index: match.index })))
    .sort((a, b) => a.index - b.index);
  const endpoints = ENDPOINTS.flatMap(([pattern, label]) => [...step.matchAll(pattern)]
    .filter(match => !negated(step, match.index) && /\b(?:until|to|forms?|forming|becomes?|reaches?)\b[^.!?;,—]{0,50}$/i.test(step.slice(0, match.index)))
    .map(match => ({ kind: "endpoint" as const, label, index: match.index })))
    .sort((a, b) => a.index - b.index);
  const unique = (cues: MethodCue[]) => [...new Map(cues.map(cue => [`${cue.kind}:${cue.label.toLowerCase()}`, { kind: cue.kind, label: cue.label }])).values()];
  const selected = [
    ...unique(temperatures).slice(0, 2), ...unique(times).slice(0, 2),
    ...unique(techniques).slice(0, 1), ...unique(endpoints).slice(0, 1),
    ...unique(techniques).slice(1, 2),
  ].slice(0, 4);
  const order: Record<MethodCueKind, number> = { technique: 0, time: 1, temperature: 2, endpoint: 3 };
  return selected.sort((a, b) => order[a.kind] - order[b.kind]);
}
