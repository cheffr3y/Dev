"use client";

import { useTransition, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_PRINT_SCALE, PRINT_SCALE_OPTIONS, validPrintScale } from "@/lib/printing/print-options";
import { PrintButton } from "./PrintButton";

export function PrintController({ children, className = "", allowScale = false, scale = 1, label = "Print / save PDF" }: {
  children: ReactNode;
  className?: string;
  allowScale?: boolean;
  scale?: number;
  label?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const compact = params.get("density") === "compact";
  const [pending, startTransition] = useTransition();
  const changeDensity = (value: boolean) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("density", "compact"); else url.searchParams.delete("density");
    window.history.replaceState(null, "", url);
  };
  const changeScale = (value: number) => {
    if (!validPrintScale(value) || value === scale) return;
    const url = new URL(window.location.href);
    url.searchParams.set("scale", String(value));
    url.searchParams.delete("print");
    startTransition(() => router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false }));
  };
  return <div className={`print-document ${compact ? "print-compact" : ""} ${className}`} data-print-scale={allowScale ? scale : undefined} aria-busy={pending}>
    <div className="print-controller no-print print:hidden" role="region" aria-label="Print controls">
      <fieldset className="print-control-group" disabled={pending}>
        <legend className="sr-only">Print density</legend>
        <button type="button" onClick={() => changeDensity(false)} aria-pressed={!compact}>Standard</button>
        <button type="button" onClick={() => changeDensity(true)} aria-pressed={compact}>1-Page Squeeze</button>
      </fieldset>
      {allowScale && <>
        <fieldset className="print-control-group" disabled={pending}>
          <legend className="sr-only">Batch scale</legend>
          {PRINT_SCALE_OPTIONS.map(value => <button key={value} type="button" aria-label={`${value} times standard batch`} aria-pressed={scale === value} onClick={() => changeScale(value)}>{value}×</button>)}
        </fieldset>
        <form key={scale} className="print-scale-form" onSubmit={event => {
          event.preventDefault();
          changeScale(Number(new FormData(event.currentTarget).get("scale")));
        }}>
          <label htmlFor="custom-print-scale">Custom ×</label>
          <input id="custom-print-scale" name="scale" type="number" min="0.001" max={MAX_PRINT_SCALE} step="any" defaultValue={scale} required disabled={pending} />
          <button type="submit" disabled={pending}>Apply</button>
        </form>
      </>}
      <PrintButton label={label} autoPrint={params.get("print") === "1"} disabled={pending} className="print-controller-submit" />
      <p className="print-controller-hint" role="status">{pending ? "Updating print quantities…" : allowScale ? "Scale changes this print copy’s planned quantities. Squeeze reduces spacing; long documents may still need multiple pages." : "Squeeze reduces spacing; long documents may still need multiple pages."}</p>
    </div>
    {children}
  </div>;
}

// Keep the packet's independent GET options from discarding scale/density.
export function PrintQueryFields() {
  const params = useSearchParams();
  return <>
    {params.get("scale") && <input type="hidden" name="scale" value={params.get("scale")!} />}
    {params.get("density") === "compact" && <input type="hidden" name="density" value="compact" />}
  </>;
}

export function PrintOptionLink({ href, ...props }: ComponentProps<typeof Link>) {
  const params = useSearchParams();
  if (typeof href !== "string") return <Link href={href} {...props} />;
  const url = new URL(href, "https://print.local");
  if (params.get("density") === "compact") url.searchParams.set("density", "compact");
  else url.searchParams.delete("density");
  return <Link {...props} href={`${url.pathname}${url.search}${url.hash}`} />;
}
