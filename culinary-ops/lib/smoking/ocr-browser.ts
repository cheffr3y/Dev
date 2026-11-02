import type { Worker } from "tesseract.js";
import { parseSmokeOcr } from "./ocr-parser";
export async function recognizeSmokePhoto(
  file: Blob,
  progress: (message: string) => void,
  signal: AbortSignal,
) {
  let worker: Worker | undefined;
  let stopped = false;
  let rejectStopped: (reason: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  void interrupted.catch(() => {});
  function stop(reason: Error) {
    stopped = true;
    rejectStopped(reason);
    void worker?.terminate();
  }
  const cancel = () => stop(new DOMException("Cancelled", "AbortError"));
  const timer = setTimeout(
    () => stop(new Error("Recognition timed out. Enter manually or retry.")),
    120000,
  );
  signal.addEventListener("abort", cancel);
  const wait = <T>(task: Promise<T>) => Promise.race([task, interrupted]);
  const started = performance.now();
  try {
    if (!file.type.startsWith("image/"))
      throw new Error(
        "Local OCR accepts still images. Enter PDF and handwritten records manually.",
      );
    progress("Preparing image on this device…");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 60_000_000)
        throw new Error("Use a smaller image for local recognition.");
      const factor = Math.min(2, 3200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * factor);
      canvas.height = Math.round(bitmap.height * factor);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context)
        throw new Error(
          "Image processing is unavailable. Enter the summary manually.",
        );
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height),
        values = pixels.data;
      let total = 0,
        count = 0;
      // Border samples estimate the page background without relying on a device layout.
      for (let y = 0; y < canvas.height; y += 8)
        for (const x of [0, Math.max(0, canvas.width - 1)]) {
          const i = (y * canvas.width + x) * 4;
          total += (values[i] + values[i + 1] + values[i + 2]) / 3;
          count++;
        }
      const invert = total / count < 128;
      for (let i = 0; i < values.length; i += 4) {
        const gray =
          values[i] * 0.299 + values[i + 1] * 0.587 + values[i + 2] * 0.114;
        const value = invert ? 255 - gray : gray;
        values[i] = values[i + 1] = values[i + 2] = value;
      }
      context.putImageData(pixels, 0, 0);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const { createWorker, PSM } = await import("tesseract.js");
      const ready = await wait<Worker>(
        createWorker("eng", 1, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          workerBlobURL: false,
          errorHandler: () =>
            stop(
              new Error(
                "The local recognition engine could not read this image.",
              ),
            ),
          logger: (message) =>
            !stopped &&
            progress(
              `${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ""}`,
            ),
        }).then((created) => {
          if (stopped) void created.terminate();
          return created;
        }),
      );
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      worker = ready;
      await wait(
        ready.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }),
      );
      const result = await wait(ready.recognize(canvas, {}, { blocks: true }));
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const lines =
        result.data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines),
        ) ?? [];
      return {
        draft: parseSmokeOcr(lines),
        seconds: (performance.now() - started) / 1000,
      };
    } finally {
      bitmap.close();
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    if (worker) await worker.terminate().catch(() => {});
  }
}
