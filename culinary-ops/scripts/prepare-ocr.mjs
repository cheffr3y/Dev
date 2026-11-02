import {
  mkdir,
  readdir,
  copyFile,
  writeFile,
  readFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Build-time copies only. Browser workers and language data never use a CDN.
const destination = "public/ocr";
for (const folder of [
  destination,
  `${destination}/core`,
  `${destination}/lang`,
])
  await mkdir(folder, { recursive: true });
const copies = [
  [
    "node_modules/tesseract.js/dist/worker.min.js",
    `${destination}/worker.min.js`,
  ],
  [
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    `${destination}/lang/eng.traineddata.gz`,
  ],
  [
    "node_modules/tesseract.js/LICENSE.md",
    `${destination}/TESSERACT-LICENSE.txt`,
  ],
  ["node_modules/tesseract.js-core/LICENSE", `${destination}/CORE-LICENSE.txt`],
  [
    "node_modules/@tesseract.js-data/eng/README.md",
    `${destination}/LANGUAGE-README.txt`,
  ],
];
for (const file of await readdir("node_modules/tesseract.js-core")) {
  if (/^tesseract-core.*\.(?:wasm|js)$/.test(file))
    copies.push([
      join("node_modules/tesseract.js-core", file),
      `${destination}/core/${file}`,
    ]);
}
const assets = [];
for (const [from, to] of copies) {
  await copyFile(from, to);
  const bytes = await readFile(to);
  assets.push({
    path: to.replace("public", ""),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  `${destination}/manifest.json`,
  JSON.stringify(
    {
      engine: "tesseract.js 7.0.0",
      language: "@tesseract.js-data/eng 1.0.0",
      assets,
    },
    null,
    2,
  ),
);
console.log(`Prepared ${assets.length} self-hosted OCR assets.`);
