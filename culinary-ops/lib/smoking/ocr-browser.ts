import { recognizeLocalCanvas } from "../ocr/browser";
import { parseSmokeOcr } from "./ocr-parser";
export async function recognizeSmokePhoto(file: Blob, progress: (message: string, fraction?: number) => void, signal: AbortSignal) {
  const started = performance.now();
  if (!file.type.startsWith("image/")) throw new Error("Local OCR accepts still images. Enter PDF and handwritten records manually.");
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
      const result = await recognizeLocalCanvas(canvas, "sparse", progress, signal);
      const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
      return { draft: parseSmokeOcr(lines), seconds: (performance.now() - started) / 1000 };
    } finally { bitmap.close(); }
}
