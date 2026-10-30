import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Keep workspace and packet typography in the repo so builds never depend on
// Google Fonts responses. Sources and licenses are recorded in ./fonts/.
const serif = localFont({
  variable: "--font-serif",
  src: [
    { path: "./fonts/playfair-display-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/playfair-display-italic-400-700-latin.woff2", weight: "400 700", style: "italic" },
  ],
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

const sans = localFont({
  variable: "--font-sans-fallback",
  src: "./fonts/inter-normal-100-900-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const mono = localFont({
  variable: "--font-monospace",
  src: [
    { path: "./fonts/ibm-plex-mono-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-normal-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-normal-600-latin.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  fallback: ["monospace"],
  adjustFontFallback: false,
});

const atelierSerif = localFont({
  variable: "--font-atelier-serif",
  src: [
    { path: "./fonts/cormorant-garamond-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/cormorant-garamond-italic-400-700-latin.woff2", weight: "400 700", style: "italic" },
  ],
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});
const atelierMono = localFont({
  variable: "--font-atelier-mono",
  src: "./fonts/jetbrains-mono-normal-400-600-latin.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  fallback: ["monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Mise — Culinary Operations",
  description: "Recipes, inventory, order guides, and event planning across every venue.",
};

// viewport-fit=cover lets the mobile nav drawer pad itself with
// env(safe-area-inset-*) on notched phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable} ${atelierSerif.variable} ${atelierMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
