import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, IBM_Plex_Mono, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// "The French Laundry" type pairing: a high-contrast serif for page titles
// and summary numbers, a clean sans for navigation, and true mono for measures.
const serif = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const sans = Inter({
  variable: "--font-sans-fallback",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-monospace",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const atelierSerif = Cormorant_Garamond({ variable: "--font-atelier-serif", subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const atelierMono = JetBrains_Mono({ variable: "--font-atelier-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

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
