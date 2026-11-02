/* eslint-disable @next/next/no-img-element -- Authenticated source documents must bypass public image optimization. */
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import type { AppUser } from "@/lib/auth/session";
import {
  CHECKPOINTS,
  SMOKE_PRODUCTS,
  emptyActual,
  emptyProcedure,
  newPlan,
  fmtMeasure,
  fmtSmokeTime,
  smokeTemperature,
  smokeYield,
  type SmokeActual,
  type SmokeProfileData,
} from "@/lib/smoking/smoking";
import type { SmokeChoices, RunView } from "@/lib/smoking/view";
import { recognizeSmokePhoto } from "@/lib/smoking/ocr-browser";

type Payload = Record<string, unknown>;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) =>
  str(f, k) === "" ? null : Number(str(f, k));
function measure(f: FormData, key: string) {
  const n = num(f, `${key}Qty`);
  return n === null ? null : { quantity: n, unit: str(f, `${key}Unit`) };
}
function useSave() {
  const router = useRouter(),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    request = useRef<{ key: string; id: string } | null>(null);
  async function save(
    payload: Payload | FormData,
    success?: (id: string) => void,
  ) {
    if (pending) return false;
    setPending(true);
    setMessage("");
    const key =
      payload instanceof FormData
        ? JSON.stringify(
            Array.from(payload.entries()).map(([k, v]) => [
              k,
              v instanceof File ? `${v.name}:${v.size}:${v.lastModified}` : v,
            ]),
          )
        : JSON.stringify(payload);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (payload instanceof FormData) {
        payload.set("operationId", request.current.id);
        body = payload;
      } else {
        body = JSON.stringify({ ...payload, operationId: request.current.id });
        headers = { "Content-Type": "application/json" };
      }
      const response = await fetch("/api/smoking", {
          method: "POST",
          body,
          headers,
        }),
        result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save.");
      request.current = null;
      setMessage("Saved.");
      router.refresh();
      success?.(result.id);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection interrupted. Your entries are retained; retry to check the same request.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  return { save, pending, message };
}
function SaveForm({
  label,
  children,
  onSave,
  button = "Save record",
  className = "",
}: {
  label: string;
  children: ReactNode;
  onSave: (form: FormData) => Payload;
  button?: string;
  className?: string;
}) {
  const { save, pending, message } = useSave();
  return (
    <form
      aria-label={label}
      className={`smoke-form ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await save(onSave(new FormData(form)));
      }}
    >
      <fieldset disabled={pending}>{children}</fieldset>
      <div className="smoke-actions">
        <button disabled={pending}>{pending ? "Saving…" : button}</button>
        <p role="status">{message}</p>
      </div>
    </form>
  );
}
function Reason({ required = false }: { required?: boolean }) {
  return (
    <label>
      Correction / review reason
      <input
        name="reason"
        maxLength={2000}
        required={required}
        placeholder={
          required ? "What changed, and why?" : "Optional for a new record"
        }
      />
    </label>
  );
}
function ProcedureFields({ value }: { value: Omit<SmokeProfileData, "name"> }) {
  return (
    <>
      <label>
        Product
        <input
          name="product"
          defaultValue={value.product}
          list="smoke-products"
          required
          maxLength={160}
        />
      </label>
      <label>
        Smoking method
        <select
          aria-label="Smoking method"
          name="mode"
          defaultValue={value.mode}
        >
          <option value="HOT">Hot smoking</option>
          <option value="COLD">Cold smoking</option>
        </select>
      </label>
      <label>
        Planned target temperature
        <input
          name="targetTemperature"
          type="number"
          step="any"
          min={-100}
          max={1000}
          defaultValue={value.targetTemperature ?? ""}
        />
      </label>
      <label>
        Temperature unit
        <select
          aria-label="Temperature unit"
          name="temperatureUnit"
          defaultValue={value.temperatureUnit}
        >
          <option>F</option>
          <option>C</option>
        </select>
      </label>
      <label>
        Smoker settings
        <input
          name="smokerSettings"
          defaultValue={value.smokerSettings}
          maxLength={1000}
        />
      </label>
      <label>
        Wood / fuel
        <input name="woodFuel" defaultValue={value.woodFuel} maxLength={500} />
      </label>
      <label>
        Seasoning / brine
        <input
          name="seasoning"
          defaultValue={value.seasoning}
          maxLength={1000}
        />
      </label>
      <label className="smoke-wide">
        Procedure
        <textarea
          name="procedure"
          rows={3}
          defaultValue={value.procedure}
          maxLength={5000}
        />
      </label>
    </>
  );
}
function procedure(f: FormData) {
  return {
    product: str(f, "product"),
    mode: str(f, "mode"),
    targetTemperature: num(f, "targetTemperature"),
    temperatureUnit: str(f, "temperatureUnit"),
    smokerSettings: str(f, "smokerSettings"),
    woodFuel: str(f, "woodFuel"),
    seasoning: str(f, "seasoning"),
    procedure: str(f, "procedure"),
  };
}
function ProductOptions() {
  return (
    <datalist id="smoke-products">
      {SMOKE_PRODUCTS.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}
export function RunForm({
  venues,
  cookName,
  copyId = null,
}: {
  venues: SmokeChoices["venues"];
  cookName: string;
  copyId?: string | null;
}) {
  const router = useRouter(),
    { save, pending, message } = useSave();
  return (
    <form
      aria-label={copyId ? "Repeat smoker setup" : "New smoker run"}
      className="smoke-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save(
          {
            action: "createRun",
            date: str(f, "date"),
            venueId: str(f, "venueId"),
            copyId,
            data: {
              name: str(f, "name"),
              smoker: str(f, "smoker"),
              cookName: str(f, "cookName"),
              notes: str(f, "notes"),
            },
          },
          (id) => router.push(`/smoking/${id}`),
        );
      }}
    >
      <fieldset disabled={pending} className="smoke-grid">
        <label>
          Run name
          <input name="name" required maxLength={160} />
        </label>
        <label>
          Run date
          <input
            name="date"
            type="date"
            defaultValue={new Date().toLocaleDateString("en-CA", {
              timeZone: "America/Chicago",
            })}
            required
          />
        </label>
        <label>
          Venue
          <select aria-label="Venue" name="venueId" required>
            <option value="">Choose venue</option>
            {venues.map((v) => (
              <option value={v.id} key={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Smoker / equipment
          <input name="smoker" required maxLength={160} />
        </label>
        <label>
          Responsible cook
          <input
            name="cookName"
            defaultValue={cookName}
            required
            maxLength={160}
          />
        </label>
        <label className="smoke-wide">
          Run notes
          <textarea name="notes" maxLength={5000} />
        </label>
      </fieldset>
      {copyId && (
        <p>
          Copies planned procedures and captured recipes. Readings, yields,
          photos, project links and review are cleared. Copied lots are assigned
          to you.
        </p>
      )}
      {!venues.length && (
        <p>Ask a manager to assign your home venue before creating a run.</p>
      )}
      <button disabled={pending || !venues.length}>
        {pending
          ? "Creating…"
          : copyId
            ? "Create from this setup"
            : "Create smoker run"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function ProfileManager({
  manager,
  profiles,
}: {
  manager: boolean;
  profiles: SmokeChoices["profiles"];
}) {
  const [selected, setSelected] = useState(""),
    profile = profiles.find((p) => p.id === selected),
    value = profile?.data ?? { ...emptyProcedure(), name: "" };
  return (
    <details className="smoke-card">
      <summary>Reusable product procedures ({profiles.length})</summary>
      {manager ? (
        <>
          <label>
            Procedure to edit
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">New procedure</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.data.name} · {p.data.mode}
                </option>
              ))}
            </select>
          </label>
          <SaveForm
            key={selected + String(profile?.revision)}
            label="Reusable smoking procedure"
            button="Save reusable procedure"
            onSave={(f) => ({
              action: "profile",
              profileId: profile?.id ?? null,
              revision: profile?.revision ?? null,
              data: { ...procedure(f), name: str(f, "name") },
              reason: str(f, "reason"),
            })}
          >
            <div className="smoke-grid">
              <label>
                Procedure name
                <input
                  name="name"
                  defaultValue={value.name}
                  required
                  maxLength={160}
                />
              </label>
              <ProcedureFields value={value} />
            </div>
            <Reason required={!!profile} />
          </SaveForm>
        </>
      ) : (
        profiles.map((p) => (
          <article key={p.id}>
            <h3>
              {p.data.name} · {p.data.mode}
            </h3>
            <p>{p.data.procedure}</p>
          </article>
        ))
      )}
      <p className="smoke-muted">
        Targets are configured by your kitchen. Applying a procedure copies its
        current settings into a lot; later template edits leave that lot
        unchanged.
      </p>
      <ProductOptions />
    </details>
  );
}
function MeasureFields({
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
function SummaryFields({
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
function summaryFrom(f: FormData) {
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
function LotForm({
  run,
  lot,
  user,
  choices,
}: {
  run: RunView;
  lot?: RunView["lots"][number];
  user: AppUser;
  choices: SmokeChoices;
}) {
  const initial = lot?.data.plan ?? newPlan(user.name, user.id),
    actual = lot?.data.actual ?? emptyActual(),
    [plan, setPlan] = useState(initial),
    [templateKey, setTemplateKey] = useState(0);
  return (
    <SaveForm
      label={lot ? `Edit ${lot.data.plan.label}` : "New product lot"}
      button={lot ? "Save lot correction" : "Add product lot"}
      onSave={(f) => ({
        action: "saveLot",
        runId: run.id,
        lotId: lot?.id ?? null,
        revision: lot?.revision ?? null,
        reason: str(f, "reason"),
        plan: {
          ...procedure(f),
          label: str(f, "label"),
          cookName: str(f, "cookName"),
          assignedUserId: str(f, "assignedUserId") || null,
          recipeId: str(f, "recipeId") || null,
          projectId: str(f, "projectId") || null,
          profileId: plan.profileId,
          profileRevision: plan.profileRevision,
          targetYield: measure(f, "planned"),
          probes: Array.from(
            { length: Math.max(6, plan.probes.length) },
            (_, i) => ({
              name: str(f, `probe${i}`),
              kind: str(f, `probeKind${i}`),
            }),
          ).filter((p) => p.name),
        },
        actual: {
          handsOnMinutes: num(f, "handsOnMinutes"),
          raw: measure(f, "raw"),
          trimmed: measure(f, "trimmed"),
          finished: measure(f, "finished"),
          wasteNotes: str(f, "wasteNotes"),
          qualityNotes: str(f, "qualityNotes"),
          summary: summaryFrom(f),
        },
      })}
    >
      <label>
        Apply reusable procedure
        <select
          defaultValue=""
          onChange={(e) => {
            const p = choices.profiles.find((p) => p.id === e.target.value);
            if (p) {
              setPlan({
                ...plan,
                ...p.data,
                profileId: p.id,
                profileRevision: p.revision,
              });
              setTemplateKey((k) => k + 1);
            }
          }}
        >
          <option value="">Choose a procedure to copy</option>
          {choices.profiles.map((p) => (
            <option value={p.id} key={p.id}>
              {p.data.name} · {p.data.mode}
            </option>
          ))}
        </select>
      </label>
      <div className="smoke-grid" key={templateKey}>
        <label>
          Lot label
          <input
            name="label"
            defaultValue={plan.label}
            required
            maxLength={160}
          />
        </label>
        <ProcedureFields value={plan} />
        <label>
          Lot cook
          <input
            name="cookName"
            defaultValue={plan.cookName}
            required
            maxLength={160}
          />
        </label>
        <label>
          Assigned cook
          <select
            aria-label="Assigned cook"
            name="assignedUserId"
            defaultValue={plan.assignedUserId ?? ""}
            disabled={user.role === "STAFF"}
          >
            <option value="">Unassigned</option>
            {choices.users.map((u) => (
              <option value={u.id} key={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {user.role === "STAFF" && (
            <input
              type="hidden"
              name="assignedUserId"
              value={plan.assignedUserId ?? ""}
            />
          )}
        </label>
        <label>
          Recipe
          <select
            aria-label="Recipe"
            name="recipeId"
            defaultValue={plan.recipeId ?? ""}
          >
            <option value="">No recipe link</option>
            {plan.recipeId &&
              !choices.recipes.some((r) => r.id === plan.recipeId) && (
                <option value={plan.recipeId}>
                  {lot?.data.recipe?.name ?? "Captured recipe"}
                </option>
              )}
            {choices.recipes.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name} · v{r.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Existing production project
          <select
            aria-label="Existing production project"
            name="projectId"
            defaultValue={plan.projectId ?? ""}
          >
            <option value="">No project link</option>
            {plan.projectId &&
              !choices.projects.some((p) => p.id === plan.projectId) && (
                <option value={plan.projectId}>
                  {lot?.data.project?.contextLabel ?? plan.projectId}
                </option>
              )}
            {choices.projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.recipeName} · {p.contextLabel}
              </option>
            ))}
          </select>
        </label>
        <MeasureFields
          name="planned"
          label="Planned output"
          value={plan.targetYield}
        />
        {Array.from({ length: Math.max(6, plan.probes.length) }, (_, i) => (
          <div className="smoke-pair" key={i}>
            <label>
              Probe {i + 1} name
              <input
                name={`probe${i}`}
                defaultValue={plan.probes[i]?.name ?? ""}
                maxLength={80}
              />
            </label>
            <label>
              Probe {i + 1} type
              <select
                aria-label={`Probe ${i + 1} type`}
                name={`probeKind${i}`}
                defaultValue={plan.probes[i]?.kind ?? "UNKNOWN"}
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="FOOD">Food</option>
                <option value="AMBIENT">Ambient</option>
              </select>
            </label>
          </div>
        ))}
      </div>
      <h3>Actual output</h3>
      <div className="smoke-grid">
        <label>
          Hands-on labor (minutes, if recorded)
          <input
            name="handsOnMinutes"
            type="number"
            min={0}
            max={43200}
            step={1}
            defaultValue={actual.handsOnMinutes ?? ""}
          />
        </label>
        <MeasureFields name="raw" label="Raw" value={actual.raw} />
        <MeasureFields name="trimmed" label="Trimmed" value={actual.trimmed} />
        <MeasureFields
          name="finished"
          label="Finished usable"
          value={actual.finished}
        />
        <label>
          Trim / waste notes
          <textarea
            name="wasteNotes"
            defaultValue={actual.wasteNotes}
            maxLength={1000}
          />
        </label>
        <label className="smoke-wide">
          Quality / process notes
          <textarea
            name="qualityNotes"
            defaultValue={actual.qualityNotes}
            maxLength={5000}
          />
        </label>
      </div>
      <SummaryFields summary={actual.summary} photos={run.photos} />
      <Reason required={!!lot} />
    </SaveForm>
  );
}
function localTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function ReadingForm({
  runId,
  lot,
  reading,
}: {
  runId: string;
  lot: RunView["lots"][number];
  reading?: RunView["lots"][number]["readings"][number];
}) {
  const [at, setAt] = useState("");
  useEffect(() => {
    if (reading) {
      const value = localTime(reading.data.at);
      queueMicrotask(() => setAt(value));
    }
  }, [reading]);
  const d = reading?.data;
  return (
    <SaveForm
      label={reading ? "Correct checkpoint" : "Add checkpoint"}
      button={reading ? "Save checkpoint correction" : "Record checkpoint"}
      onSave={(f) => ({
        action: "reading",
        runId,
        lotId: lot.id,
        revision: lot.revision,
        readingId: reading?.id ?? null,
        readingRevision: reading?.revision ?? null,
        reason: str(f, "reason"),
        data: {
          kind: str(f, "kind"),
          at:
            reading && str(f, "at") === localTime(reading.data.at)
              ? reading.data.at
              : new Date(str(f, "at")).toISOString(),
          temperature: num(f, "readingTemperature"),
          temperatureUnit: str(f, "readingUnit"),
          probeName: str(f, "readingProbe"),
          probeKind: str(f, "readingProbeKind"),
          notes: str(f, "readingNotes"),
          voided: f.has("voided"),
        },
      })}
    >
      <div className="smoke-grid">
        <label>
          Checkpoint
          <select
            aria-label="Checkpoint"
            name="kind"
            defaultValue={d?.kind ?? "CHECK"}
          >
            {CHECKPOINTS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Time (your device time)
          <input
            name="at"
            type="datetime-local"
            required
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setAt(localTime(new Date().toISOString()))}
          >
            Use current time
          </button>
        </label>
        <label>
          Reading temperature
          <input
            name="readingTemperature"
            type="number"
            step="any"
            min={-100}
            max={1000}
            defaultValue={d?.temperature ?? ""}
          />
        </label>
        <label>
          Reading unit
          <select
            aria-label="Reading unit"
            name="readingUnit"
            defaultValue={d?.temperatureUnit ?? lot.data.plan.temperatureUnit}
          >
            <option>F</option>
            <option>C</option>
          </select>
        </label>
        <label>
          Reading probe
          <input
            name="readingProbe"
            defaultValue={d?.probeName ?? ""}
            maxLength={80}
          />
        </label>
        <label>
          Reading probe type
          <select
            aria-label="Reading probe type"
            name="readingProbeKind"
            defaultValue={d?.probeKind ?? "UNKNOWN"}
          >
            <option value="UNKNOWN">Unknown</option>
            <option value="FOOD">Food</option>
            <option value="AMBIENT">Ambient</option>
          </select>
        </label>
        <label className="smoke-wide">
          Checkpoint notes
          <textarea
            name="readingNotes"
            defaultValue={d?.notes ?? ""}
            maxLength={2000}
          />
        </label>
        {reading && (
          <label className="smoke-check">
            <input type="checkbox" name="voided" defaultChecked={d?.voided} />
            Void this reading (retain history)
          </label>
        )}
      </div>
      <Reason required />
    </SaveForm>
  );
}
function Upload({
  run,
  lotId = null,
}: {
  run: RunView;
  lotId?: string | null;
}) {
  const { save, pending, message } = useSave();
  return (
    <form
      aria-label="Attach smoking photo"
      className="smoke-form"
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        f.set("runId", run.id);
        f.set("lotId", lotId ?? "");
        if (await save(f)) form.reset();
      }}
    >
      <label>
        Photo / supporting PDF (under 8 MB)
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,application/pdf"
          required
          disabled={pending}
        />
      </label>
      <button disabled={pending}>
        {pending ? "Storing…" : "Attach source document"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function SmokeRunWorkspace({
  run,
  user,
  choices,
}: {
  run: RunView;
  user: AppUser;
  choices: SmokeChoices;
}) {
  const manager = user.role !== "STAFF";
  useEffect(() => {
    const lotId = new URLSearchParams(window.location.search).get("lot");
    if (lotId)
      document
        .getElementById(`lot-${lotId}`)
        ?.scrollIntoView({ block: "start" });
  }, [run.id]);
  return (
    <main className="smoking">
      <Link href="/smoking">← All smoker runs</Link>
      <header>
        <p className="smoke-eyebrow">
          {run.businessDate.slice(0, 10)} · {run.venue.name}
        </p>
        <h1>{run.data.name}</h1>
        <p>
          {run.data.smoker} · {run.data.cookName}
        </p>
        <p className="smoke-prewrap">{run.data.notes}</p>
        <div className="smoke-actions">
          <Link
            className="smoke-link-button"
            href={`/smoking/${run.id}/print`}
            target="_blank"
          >
            Print smoke sheets
          </Link>
          <span>{run.lots.length} product lots</span>
        </div>
      </header>
      <details className="smoke-card">
        <summary>Repeat this setup</summary>
        <RunForm venues={choices.venues} cookName={user.name} copyId={run.id} />
      </details>
      {(manager || run.createdById === user.id) && (
        <details className="smoke-card">
          <summary>Edit run details</summary>
          <SaveForm
            key={run.revision}
            label="Edit smoker run"
            onSave={(f) => ({
              action: "editRun",
              runId: run.id,
              revision: run.revision,
              reason: str(f, "reason"),
              data: {
                name: str(f, "name"),
                smoker: str(f, "smoker"),
                cookName: str(f, "cookName"),
                notes: str(f, "notes"),
              },
            })}
          >
            <div className="smoke-grid">
              <label>
                Run name
                <input
                  name="name"
                  defaultValue={run.data.name}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Smoker / equipment
                <input
                  name="smoker"
                  defaultValue={run.data.smoker}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Responsible cook
                <input
                  name="cookName"
                  defaultValue={run.data.cookName}
                  required
                  maxLength={160}
                />
              </label>
              <label className="smoke-wide">
                Run notes
                <textarea
                  name="notes"
                  defaultValue={run.data.notes}
                  maxLength={5000}
                />
              </label>
            </div>
            <Reason required />
          </SaveForm>
        </details>
      )}
      <details className="smoke-card">
        <summary>Add product lot</summary>
        <LotForm
          key={run.lots.length}
          run={run}
          user={user}
          choices={choices}
        />
      </details>
      {!run.lots.length && (
        <p className="smoke-card">
          Add a product lot to begin. Keep each product and its probes in its
          own lot.
        </p>
      )}
      {run.lots.map((lot) => {
        const d = lot.data,
          editable =
            manager ||
            lot.createdById === user.id ||
            d.plan.assignedUserId === user.id,
          y = smokeYield(d.actual.raw, d.actual.finished),
          planned = smokeYield(d.plan.targetYield, d.actual.finished),
          done = new Set(
            lot.readings.filter((r) => !r.data.voided).map((r) => r.data.kind),
          );
        return (
          <section
            className="smoke-card smoke-lot"
            key={lot.id}
            id={`lot-${lot.id}`}
          >
            <div className="smoke-lot-heading">
              <div>
                <p className="smoke-eyebrow">
                  {d.plan.product} ·{" "}
                  {d.plan.mode === "COLD" ? "Cold smoke" : "Hot smoke"}
                </p>
                <h2>{d.plan.label}</h2>
                <p>
                  Cook: {d.plan.cookName} · <strong>{d.status}</strong>
                </p>
              </div>
              <Link
                href={`/smoking/${run.id}/print?lot=${lot.id}`}
                target="_blank"
              >
                Print this lot
              </Link>
            </div>
            <div className="smoke-metrics">
              <div>
                <span>Raw</span>
                <strong>{fmtMeasure(d.actual.raw)}</strong>
              </div>
              <div>
                <span>Finished usable</span>
                <strong>{fmtMeasure(d.actual.finished)}</strong>
              </div>
              <div>
                <span>Actual yield / shrink</span>
                <strong>
                  {y
                    ? `${y.percent.toFixed(1)}% / ${y.shrinkPercent.toFixed(1)}%`
                    : "Not comparable yet"}
                </strong>
              </div>
              <div>
                <span>Planned output</span>
                <strong>{fmtMeasure(d.plan.targetYield)}</strong>
              </div>
            </div>
            <p>
              Output against plan:{" "}
              {planned
                ? `${planned.percent.toFixed(1)}% of planned usable quantity`
                : d.plan.targetYield
                  ? "Not comparable yet"
                  : "No planned output recorded"}{" "}
              · Hands-on labor:{" "}
              {d.actual.handsOnMinutes == null
                ? "Not recorded"
                : `${d.actual.handsOnMinutes} min`}
            </p>
            <p>
              Planned target:{" "}
              {smokeTemperature(
                d.plan.targetTemperature,
                d.plan.temperatureUnit,
              )}{" "}
              · {d.plan.smokerSettings || "Smoker settings unrecorded"} ·{" "}
              {d.plan.woodFuel || "Fuel unrecorded"}
            </p>
            <p className="smoke-prewrap">{d.plan.procedure}</p>
            <p>
              Probes:{" "}
              {d.plan.probes
                .map((p) => `${p.name} (${p.kind.toLowerCase()})`)
                .join(", ") || "Unassigned"}
            </p>
            {d.recipe && (
              <details>
                <summary>
                  Captured recipe: {d.recipe.name} · v{d.recipe.version}
                </summary>
                <p className="smoke-prewrap">{d.recipe.instructions}</p>
                <Link href={`/recipes/${d.recipe.id}`}>
                  Open current recipe
                </Link>
              </details>
            )}
            {d.project && (
              <p>
                <Link href={`/prep-orders/closeout/scan?job=${d.project.id}`}>
                  Existing production project: {d.project.recipeName} ·{" "}
                  {d.project.contextLabel}
                </Link>
              </p>
            )}
            {d.actual.summary && (
              <div className="smoke-source-facts">
                <h3>
                  Confirmed source transcription ·{" "}
                  {d.actual.summary.origin === "LOCAL_OCR"
                    ? "local OCR + user confirmation"
                    : "manual entry"}
                </h3>
                <p>
                  {d.actual.summary.sourceTitle || "Untitled device record"} ·{" "}
                  {d.actual.summary.sourceDate ?? "Source date unknown"} ·{" "}
                  {d.actual.summary.durationMinutes ?? "Unknown"} minutes
                  reported
                </p>
                <p>
                  Displayed target{" "}
                  {smokeTemperature(
                    d.actual.summary.target,
                    d.actual.summary.temperatureUnit,
                  )}{" "}
                  · reported peak{" "}
                  {smokeTemperature(
                    d.actual.summary.peak,
                    d.actual.summary.temperatureUnit,
                  )}{" "}
                  · {d.actual.summary.probeName || "Unnamed probe"} (
                  {d.actual.summary.probeKind.toLowerCase()})
                </p>
                {d.actual.summary.photoId && (
                  <a
                    href={`/api/smoking/file?id=${d.actual.summary.photoId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View summary source
                  </a>
                )}
              </div>
            )}
            <p className="smoke-prewrap">{d.actual.qualityNotes}</p>
            {d.actual.wasteNotes && <p>Trim / waste: {d.actual.wasteNotes}</p>}
            <h3>Checkpoints</h3>
            <p className="smoke-muted">
              Recorded:{" "}
              {CHECKPOINTS.filter((k) => done.has(k)).join(", ") || "None"}. Not
              recorded:{" "}
              {CHECKPOINTS.filter((k) => !done.has(k)).join(", ") || "None"}.
              Checkpoint applicability follows your configured procedure.
            </p>
            {lot.readings.map((r) => (
              <article
                className={`smoke-reading ${r.data.voided ? "smoke-void" : ""}`}
                key={r.id}
              >
                <p>
                  <strong>
                    {r.data.kind}
                    {r.data.voided ? " · VOID" : ""}
                  </strong>{" "}
                  · {fmtSmokeTime(r.data.at)} CT ·{" "}
                  {smokeTemperature(r.data.temperature, r.data.temperatureUnit)}{" "}
                  · {r.data.probeName || "Unnamed probe"} (
                  {r.data.probeKind.toLowerCase()})
                </p>
                <p>{r.data.notes}</p>
                {editable && (
                  <details>
                    <summary>Correct / void checkpoint</summary>
                    <ReadingForm
                      key={`${r.id}-${r.revision}-${lot.revision}`}
                      runId={run.id}
                      lot={lot}
                      reading={r}
                    />
                  </details>
                )}
              </article>
            ))}
            {editable && (
              <>
                <details>
                  <summary>Add timestamped checkpoint</summary>
                  <ReadingForm key={lot.revision} runId={run.id} lot={lot} />
                </details>
                <details>
                  <summary>Edit lot / enter summary and actuals</summary>
                  <LotForm
                    key={lot.revision}
                    run={run}
                    lot={lot}
                    user={user}
                    choices={choices}
                  />
                </details>
                <details>
                  <summary>Attach lot photo / sheet</summary>
                  <Upload run={run} lotId={lot.id} />
                </details>
                <details>
                  <summary>Submit / review / reopen</summary>
                  <p>
                    Submission and manager review are explicit record checks.
                    Presets, target temperatures and timers never approve a
                    cook.
                  </p>
                  <SaveForm
                    key={`state-${lot.revision}`}
                    label={`Review ${d.plan.label}`}
                    button="Update lot status"
                    onSave={(f) => ({
                      action: "state",
                      runId: run.id,
                      lotId: lot.id,
                      revision: lot.revision,
                      status: str(f, "status"),
                      reason: str(f, "reason"),
                    })}
                  >
                    <label>
                      Lot status
                      <select
                        aria-label="Lot status"
                        name="status"
                        defaultValue={d.status}
                      >
                        <option value="OPEN">Open / reopened</option>
                        <option value="SUBMITTED">Submit for review</option>
                        {manager && (
                          <option value="REVIEWED">Manager reviewed</option>
                        )}
                        <option value="VOID">Void lot (retain record)</option>
                      </select>
                    </label>
                    <Reason required />
                  </SaveForm>
                </details>
              </>
            )}
            {d.review && (
              <p className="smoke-source-facts">
                Reviewed by {d.review.actorName} · {fmtSmokeTime(d.review.at)}{" "}
                CT · {d.review.note}
              </p>
            )}
          </section>
        );
      })}
      <section className="smoke-card">
        <h2>Source photos & sheets</h2>
        {(manager || run.createdById === user.id) && <Upload run={run} />}
        <div className="smoke-gallery">
          {run.photos.map((p) => (
            <article key={p.id}>
              <a
                href={`/api/smoking/file?id=${p.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {}
                <img
                  src={`/api/smoking/file?id=${p.id}&preview=1`}
                  alt={`Preview of ${p.metadata.filename}`}
                  loading="lazy"
                />
              </a>
              <p>{p.metadata.filename}</p>
              <p className="smoke-muted">
                {p.lotId
                  ? run.lots.find((l) => l.id === p.lotId)?.data.plan.label
                  : "Run attachment"}{" "}
                · {p.metadata.uploadedBy} · {fmtSmokeTime(p.createdAt)} CT
              </p>
              <a href={`/api/smoking/file?id=${p.id}&download=1`}>
                Download source
              </a>
            </article>
          ))}
        </div>
        {!run.photos.length && <p>No source documents yet.</p>}
      </section>
      <details className="smoke-card">
        <summary>Correction & review history ({run.history.length})</summary>
        <p>
          Original values are retained below. All displayed times use Central
          Time.
        </p>
        {run.history.map((h) => (
          <details key={h.id} className="smoke-audit">
            <summary>
              {h.entityType} · revision {h.revision} · {h.actorName} ·{" "}
              {fmtSmokeTime(h.createdAt)} CT
            </summary>
            <p>{h.reason}</p>
            <p>Record {h.entityId}</p>
            <div className="smoke-grid">
              <div>
                Before<pre>{JSON.stringify(h.before, null, 2)}</pre>
              </div>
              <div>
                After<pre>{JSON.stringify(h.after, null, 2)}</pre>
              </div>
            </div>
          </details>
        ))}
      </details>
      <ProductOptions />
    </main>
  );
}
