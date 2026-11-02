import { smokeDate } from "./smoking";
export type OcrLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type OcrDraft = {
  sourceTitle: string;
  sourceDate: string | null;
  target: number | null;
  peak: number | null;
  temperatureUnit: "F" | "C" | null;
  durationMinutes: number | null;
};
const normalize = (text: string) =>
  text.replace(/[º˚]/g, "°").replace(/\s+/g, " ").trim();
export function parseSmokeOcr(input: OcrLine[]): OcrDraft {
  const lines = input
    .filter((line) => line.confidence >= 65)
    .map((line) => ({ ...line, text: normalize(line.text) }));
  function nearby(label: RegExp, value: RegExp) {
    const matches = lines.filter((line) => label.test(line.text));
    if (matches.length !== 1) return null;
    const anchor = matches[0],
      inline = anchor.text.replace(label, "").match(value);
    if (inline) return inline;
    const height = anchor.bbox.y1 - anchor.bbox.y0;
    const candidates = lines.filter(
      (line) =>
        line !== anchor &&
        line.bbox.y0 >= anchor.bbox.y1 - height / 4 &&
        line.bbox.y0 < anchor.bbox.y1 + height * 3.5 &&
        Math.abs(line.bbox.x0 - anchor.bbox.x0) <
          Math.max(height, (anchor.bbox.x1 - anchor.bbox.x0) * 0.45) &&
        value.test(line.text),
    );
    return candidates.length === 1 ? candidates[0].text.match(value) : null;
  }
  const temp = /(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([FC])\b/i;
  const target = nearby(/target\s*(?:temp(?:erature)?)\s*:?/i, temp),
    peak = nearby(/peak\s*(?:temp(?:erature)?)\s*:?/i, temp);
  const duration = nearby(
    /cooking\s*time\s*:?/i,
    /(?:(\d+)\s*(?:hours?|hrs?|h)\s*)?(?:(\d+)\s*(?:minutes?|mins?|m))\b/i,
  );
  const dateLines = lines
    .map(
      (line) =>
        line.text.match(
          /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i,
        ) ?? line.text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/),
    )
    .filter(Boolean);
  let sourceDate: string | null = null;
  if (dateLines.length === 1) {
    const d = dateLines[0]!;
    const month =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(d[1].slice(0, 3).toLowerCase()) + 1;
    const value = month
      ? `${d[3]}-${String(month).padStart(2, "0")}-${d[2].padStart(2, "0")}`
      : d[0];
    if (smokeDate.safeParse(value).success) sourceDate = value;
  }
  const device = lines.find((line) =>
    /wireless\s+thermometer/i.test(line.text),
  );
  const titles = device
    ? lines
        .filter(
          (line) =>
            line.bbox.y1 <= device.bbox.y0 &&
            device.bbox.y0 - line.bbox.y1 <
              (device.bbox.y1 - device.bbox.y0) * 5 &&
            /[a-z]{3}/i.test(line.text),
        )
        .sort((a, b) => b.bbox.y1 - a.bbox.y1)
    : [];
  const unit = (target?.[2] ?? peak?.[2])?.toUpperCase() as
    | "F"
    | "C"
    | undefined;
  const minutes = duration
    ? Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0)
    : null;
  return {
    sourceTitle: titles[0]?.text ?? "",
    sourceDate,
    target: target ? Number(target[1]) : null,
    peak:
      peak && (!target || peak[2].toUpperCase() === unit)
        ? Number(peak[1])
        : null,
    temperatureUnit: unit ?? null,
    durationMinutes: minutes !== null && minutes <= 43200 ? minutes : null,
  };
}
