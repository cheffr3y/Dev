export type UploadProgress = { message: string; completed?: number; total?: number };
export type ReportProgress = (progress: UploadProgress) => void;

/** Optional streaming transport; ordinary API callers retain JSON and HTTP status codes. */
export function progressResponse(request: Request, work: (report: ReportProgress) => Promise<Response>) {
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) return work(() => {});
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      try {
        const response = await work(progress => send({ type: "progress", ...progress }));
        const result = await response.json();
        send(response.ok ? { type: "ready", ...result } : { type: "error", error: result.error ?? "Could not store document.", status: response.status });
      } catch {
        send({ type: "error", error: "Connection interrupted. Keep the file and retry to check the original result." });
      } finally {
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
