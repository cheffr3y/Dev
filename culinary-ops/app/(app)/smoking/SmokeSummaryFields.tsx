/* eslint-disable @next/next/no-img-element -- Authenticated source documents bypass public image optimization. */
"use client";
import { useEffect, useRef, useState } from "react";
import type { SmokeActual } from "@/lib/smoking/smoking";
import type { RunView } from "@/lib/smoking/view";
import { recognizeSmokePhoto } from "@/lib/smoking/ocr-browser";
import { str, num } from "./smoke-form-data";
export function MeasureFields({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: SmokeActual["raw"];
}) {
  return (
    <div className="smoke-pair">
      <label>
        {label} quantity
        <input
          name={`${name}Qty`}
          type="number"
          step="any"
          min={0}
          max={1e8}
          defaultValue={value?.quantity ?? ""}
        />
      </label>
      <label>
        {label} unit
        <input
          name={`${name}Unit`}
          defaultValue={value?.unit ?? ""}
          maxLength={40}
          placeholder="lb, oz, kg, each…"
        />
      </label>
    </div>
  );
}
export function SummaryFields({
  summary,
  photos,
}: {
  summary: SmokeActual["summary"];
  photos: RunView["photos"];
}) {
  const [draft, setDraft] = useState<
      Omit<NonNullable<SmokeActual["summary"]>, "confirmed"> & {
        confirmed: boolean;
      }
    >(
      summary ?? {
        sourceTitle: "",
        sourceDate: null,
        target: null,
        peak: null,
        temperatureUnit: null,
        durationMinutes: null,
        probeName: "",
        probeKind: "UNKNOWN",
        photoId: null,
        origin: "MANUAL",
        confirmed: false,
      },
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null),
    photo = photos.find((p) => p.id === draft.photoId);
  useEffect(() => () => controller.current?.abort(), []);
  async function recognize() {
    if (!photo || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setMessage("Loading source photo…");
    try {
      const response = await fetch(`/api/smoking/file?id=${photo.id}`, {
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Could not load the source photo.");
      const result = await recognizeSmokePhoto(
        await response.blob(),
        setMessage,
        abort.signal,
      );
      setDraft((d) => ({
        ...d,
        ...result.draft,
        origin: "LOCAL_OCR",
        confirmed: false,
      }));
      setMessage(
        `Local recognition took ${result.seconds.toFixed(1)} seconds. Check every field against the image; unclear values stay blank.`,
      );
    } catch (error) {
      setMessage(
        abort.signal.aborted
          ? "Recognition cancelled. Enter manually or retry."
          : error instanceof Error
            ? `${error.message} Enter manually or retry.`
            : "Recognition failed. Enter manually or retry.",
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  const update = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value, confirmed: false }));
  return (
    <details className="smoke-summary" open={!!summary}>
      <summary>Thermometer summary / local photo reading</summary>
      <p className="smoke-muted">
        Device titles and targets are source facts. Confirm the product and
        probe separately. The chart is retained as an image.
      </p>
      <div className="smoke-photo-summary">
        <div>
          <label>
            Source photo
            <select
              aria-label="Source photo"
              name="photoId"
              value={draft.photoId ?? ""}
              disabled={busy}
              onChange={(e) => update("photoId", e.target.value || null)}
            >
              <option value="">Manual entry / no photo</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.metadata.filename}
                </option>
              ))}
            </select>
          </label>
          <div className="smoke-actions">
            <button
              type="button"
              disabled={
                !photo || busy || photo.metadata.mime === "application/pdf"
              }
              onClick={recognize}
            >
              Read photo locally
            </button>
            {busy && (
              <button type="button" onClick={() => controller.current?.abort()}>
                Cancel recognition
              </button>
            )}
          </div>
          <p role="status">{message}</p>
          {photo && (
            <a
              href={`/api/smoking/file?id=${photo.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {photo.metadata.mime !== "application/pdf" ? (
                <img
                  className="smoke-source"
                  src={`/api/smoking/file?id=${photo.id}`}
                  alt="Selected thermometer source"
                />
              ) : (
                "Open source PDF"
              )}
            </a>
          )}
        </div>
        <div className="smoke-grid">
          <label>
            Device title / preset
            <input
              name="sourceTitle"
              value={draft.sourceTitle}
              onChange={(e) => update("sourceTitle", e.target.value)}
              maxLength={200}
            />
          </label>
          <label>
            Source date
            <input
              type="date"
              name="sourceDate"
              value={draft.sourceDate ?? ""}
              onChange={(e) => update("sourceDate", e.target.value || null)}
            />
          </label>
          {(["target", "peak", "durationMinutes"] as const).map((k) => (
            <label key={k}>
              {k === "target"
                ? "Displayed target"
                : k === "peak"
                  ? "Reported peak"
                  : "Reported cooking duration (minutes)"}
              <input
                type="number"
                name={k}
                step={k === "durationMinutes" ? "1" : "any"}
                value={draft[k] ?? ""}
                onChange={(e) =>
                  update(
                    k,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
          ))}
          <label>
            Reported temperature unit
            <select
              aria-label="Reported temperature unit"
              name="reportedUnit"
              value={draft.temperatureUnit ?? ""}
              onChange={(e) =>
                update("temperatureUnit", e.target.value || null)
              }
            >
              <option value="">Unknown</option>
              <option>F</option>
              <option>C</option>
            </select>
          </label>
          <label>
            Summary probe name
            <input
              name="summaryProbe"
              value={draft.probeName}
              onChange={(e) => update("probeName", e.target.value)}
              maxLength={80}
            />
          </label>
          <label>
            Summary probe type
            <select
              aria-label="Summary probe type"
              name="summaryProbeKind"
              value={draft.probeKind}
              onChange={(e) => update("probeKind", e.target.value)}
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="FOOD">Food</option>
              <option value="AMBIENT">Ambient</option>
            </select>
          </label>
          <input name="summaryOrigin" type="hidden" value={draft.origin} />
          <label className="smoke-check smoke-wide">
            <input
              type="checkbox"
              name="summaryConfirmed"
              checked={draft.confirmed}
              onChange={(e) =>
                setDraft((d) => ({ ...d, confirmed: e.target.checked }))
              }
            />
            I checked the transcription and its product / probe assignment
            against the source.
          </label>
          <label className="smoke-check smoke-wide">
            <input type="checkbox" name="clearSummary" />
            Clear the saved summary (source photos remain)
          </label>
        </div>
      </div>
    </details>
  );
}
export function summaryFrom(f: FormData) {
  if (f.has("clearSummary")) return null;
  const has = [
    "sourceTitle",
    "sourceDate",
    "target",
    "peak",
    "durationMinutes",
    "photoId",
    "summaryProbe",
  ].some((k) => str(f, k) !== "");
  if (!has) return null;
  return {
    sourceTitle: str(f, "sourceTitle"),
    sourceDate: str(f, "sourceDate") || null,
    target: num(f, "target"),
    peak: num(f, "peak"),
    temperatureUnit: str(f, "reportedUnit") || null,
    durationMinutes: num(f, "durationMinutes"),
    probeName: str(f, "summaryProbe"),
    probeKind: str(f, "summaryProbeKind"),
    photoId: str(f, "photoId") || null,
    origin: str(f, "summaryOrigin"),
    confirmed: f.has("summaryConfirmed"),
  };
}
