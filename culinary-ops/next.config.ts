import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The development badge overlaps the collapsed sidebar's expand control.
  devIndicators: false,
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "pdf-lib", "sharp"],
  outputFileTracingIncludes: {"/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/pdfjs-dist/wasm/**/*"]},
};

export default nextConfig;
