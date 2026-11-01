import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { publicOrigin } from "@/lib/production/production-job-options";

export async function ProductionJobQr({ href, label = "Scan to start / finish" }: { href: string; label?: string }) {
  const h = await headers();
  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  const configured = process.env.APP_BASE_URL || (authUrl ? new URL(authUrl).origin : undefined);
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || "localhost:3000";
  const protocol = h.get("x-forwarded-proto")?.split(",")[0].trim() === "http" || process.env.NODE_ENV !== "production" ? "http" : "https";
  const origin = publicOrigin(configured || `${protocol}://${host}`);
  const url = new URL(href, origin).toString();
  const code = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = code.modules.size, quiet = 4;
  const segments: string[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (code.modules.get(y, x)) segments.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
  }
  return <Link href={href} className="production-job-qr" aria-label={label}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${size + quiet * 2} ${size + quiet * 2}`} role="img" aria-label="Production project QR code" shapeRendering="crispEdges" data-qr-url={url}>
      <rect width="100%" height="100%" fill="#fff" /><path d={segments.join("")} fill="#000" />
    </svg>
    <span>{label}</span>
  </Link>;
}
