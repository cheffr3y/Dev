import type { UploadProgress } from "./progress-response";
export type UploadTask = { key: string; file: File; fields: [string, string][] };
export type UploadState = UploadProgress & { key: string; filename: string; status: "queued" | "working" | "ready" | "error"; id?: string };

/** One bounded operation at a time; a failed file never blocks later files. */
export class DocumentQueue {
  private tasks = new Map<string, UploadTask>();
  private waiting: string[] = [];
  private running = false;
  private failed = new Set<string>();
  constructor(private process: (task: UploadTask, report: (progress: UploadProgress) => void) => Promise<string>, private changed: (state: UploadState) => void) {}
  add(task: UploadTask) {
    this.tasks.set(task.key, task);
    this.waiting.push(task.key);
    this.changed({ key: task.key, filename: task.file.name, status: "queued", message: "Queued" });
    void this.drain();
  }
  retry(key: string) {
    const task = this.tasks.get(key);
    if (task && this.failed.delete(key)) { this.tasks.delete(key); this.add(task); }
  }
  stop() {
    for (const key of this.waiting.splice(0)) {
      const task = this.tasks.get(key)!;
      this.failed.add(key);
      this.changed({ key, filename: task.file.name, status: "error", message: "Queue paused when you left this page. Retry this file." });
    }
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.waiting.length) {
        const task = this.tasks.get(this.waiting.shift()!)!;
        const base = { key: task.key, filename: task.file.name };
        this.changed({ ...base, status: "working", message: "Uploading" });
        try {
          const id = await this.process(task, progress => this.changed({ ...base, status: "working", ...progress }));
          this.tasks.delete(task.key);
          this.changed({ ...base, status: "ready", message: "Saved. Ready for review", id });
        } catch (error) {
          this.failed.add(task.key);
          this.changed({ ...base, status: "error", message: error instanceof Error ? error.message : "Upload failed. Retry this file." });
        }
      }
    } finally { this.running = false; }
  }
}

export async function uploadDocument(endpoint: string, task: UploadTask, report: (progress: UploadProgress) => void) {
  if (!task.file.size || task.file.size > 8 * 1024 * 1024) throw new Error("Choose a nonempty file under 8 MB.");
  const form = new FormData();
  for (const [key, value] of task.fields) form.append(key, value);
  form.set("file", task.file);
  const response = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(180000), headers: { Accept: "application/x-ndjson" } });
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not upload document.");
    if (typeof result.id !== "string") throw new Error("Upload response was incomplete. Retry this file.");
    return result.id;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Upload response was interrupted. Retry this file.");
  const decoder = new TextDecoder();
  let buffer = "", id: string | undefined;
  function line(text: string) {
    if (!text.trim()) return;
    const event = JSON.parse(text);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "progress") report(event);
    if (event.type === "ready" && typeof event.id === "string") id = event.id;
  }
  try {
    for (;;) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      const lines = buffer.split("\n"); buffer = lines.pop()!;
      lines.forEach(line);
      if (result.done) { line(buffer); break; }
    }
  } finally { reader.releaseLock(); }
  if (!id) throw new Error("Upload response was interrupted. Retry this file to check the original result.");
  return id;
}
