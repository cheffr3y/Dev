import type { Metadata } from "next";
import { Inter, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

// Cohere system fallbacks: CohereText -> Space Grotesk, Unica77 -> Inter,
// CohereMono -> a true mono to keep the technical-label cadence.
const display = Space_Grotesk({
  variable: "--font-cohere-display",
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-unica-fallback",
  subsets: ["latin"],
});

const mono = Space_Mono({
  variable: "--font-cohere-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mise — Culinary Operations",
  description: "Recipes, inventory, order guides, and event planning across every venue.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
