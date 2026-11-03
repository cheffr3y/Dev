import type { Worker } from "tesseract.js";
export async function recognizeLocalCanvas(canvas: HTMLCanvasElement, mode: "sparse" | "invoice", progress: (message: string, fraction?: number) => void, signal: AbortSignal) {
  let worker: Worker | undefined, stopped = false;
  let rejectStopped: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { rejectStopped = reject; });
  void interrupted.catch(() => {});
  const stop = (error: Error) => { stopped = true; rejectStopped(error); void worker?.terminate(); };
  const cancel = () => stop(new DOMException("Cancelled", "AbortError"));
  const timer = setTimeout(() => stop(new Error("Local recognition timed out. Retry or enter the line manually.")), 120000);
  signal.addEventListener("abort", cancel);
  const wait = <T>(task: Promise<T>) => Promise.race([task, interrupted]);
  try {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const { createWorker, PSM } = await import("tesseract.js");
    const ready: Worker = await wait(createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang", workerBlobURL: false,
      errorHandler: () => stop(new Error("The local OCR engine could not read this page.")),
      logger: message => { if (!stopped) progress(`${message.status}`, message.status === "recognizing text" ? message.progress : undefined); },
    }).then(created => { if (stopped) void created.terminate(); return created; }));
    worker=ready;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await wait(ready.setParameters({ tessedit_pageseg_mode: mode === "invoice" ? PSM.SINGLE_BLOCK : PSM.SPARSE_TEXT, ...(mode === "invoice" ? { preserve_interword_spaces: "1" } : {}) }));
    const result = await wait(ready.recognize(canvas, {}, { blocks: true }));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return result.data;
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); if (worker) await worker.terminate().catch(() => {}); }
}
