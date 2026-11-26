import { printTargetDate } from "@/lib/printing/print-options";

export function PrintPageRules({ landscape = false }: { landscape?: boolean }) {
  return <style>{`@media print {
    @page {
      size: letter ${landscape ? "landscape" : "portrait"};
      margin: 0.4in 0.4in 0.55in;
      @bottom-right {
        content: "Page " counter(page) " / " counter(pages);
        font: 8pt Arial, sans-serif;
        color: #333;
      }
    }
  }`}</style>;
}

export function PrintSpecHeader({ venue, title, targetDate, targetLabel, printedAt, landscape = false }: {
  venue: string;
  title: string;
  targetDate?: Date | string;
  targetLabel?: string;
  printedAt: Date;
  landscape?: boolean;
}) {
  const timestamp = printedAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Chicago", timeZoneName: "short",
  });
  return <>
    <PrintPageRules landscape={landscape} />
    <header className="print-spec-header" aria-label="Print document details">
      <div className="print-spec-identity"><span className="print-venue-badge">{venue}</span><p className="print-spec-title">{title}</p></div>
      <dl className="print-spec-meta">
        <div><dt>Target</dt><dd>{targetLabel ?? (targetDate ? printTargetDate(targetDate) : "Master reference")}</dd></div>
        <div><dt>Printed</dt><dd>{timestamp}</dd></div>
        <div><dt>Paper</dt><dd>US Letter · {landscape ? "Landscape" : "Portrait"}</dd></div>
      </dl>
    </header>
  </>;
}

// Scaled copies show final amounts only; the multiplier itself is not printed
// (event scales such as 2.4299…× mean nothing to a cook).
export function ScaledProductionBanner({ scale }: { scale: number }) {
  if (scale === 1) return null;
  return <p className="print-scaled-banner">SCALED PRODUCTION COPY — AMOUNTS ALREADY SCALED · DO NOT FILE IN MASTER BINDER</p>;
}
