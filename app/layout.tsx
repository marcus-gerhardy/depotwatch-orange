import type { Metadata } from "next";
import localFont from "next/font/local";
import Footer from "@/components/Footer";
import ThemeEffect from "@/components/ThemeEffect";
import { THEME_BOOT_SCRIPT } from "@/lib/themeBoot";
import "./globals.css";

// Self-hosted, not pulled from Google — see app/fonts/README.md. One variable
// file per family covers every weight the UI uses.
const outfit = localFont({
  src: "./fonts/Outfit-Variable.woff2",
  variable: "--font-outfit",
  display: "swap",
  weight: "100 900",
  fallback: ["system-ui", "sans-serif"],
});

const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-Variable.woff2",
  variable: "--font-space-grotesk",
  display: "swap",
  weight: "300 700",
  fallback: ["system-ui", "sans-serif"],
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "DepotWatch Orange",
  description:
    "Local-first Bitcoin portfolio tracker — your data stays in one encrypted file on your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${outfit.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
      // The boot script below writes data-theme onto this very element before
      // React hydrates, so the server HTML and the DOM differ here by design —
      // which is exactly what this attribute is for. It reaches one level deep
      // (this element's own attributes), so a real mismatch anywhere inside the
      // app is still reported.
      suppressHydrationWarning
    >
      <head>
        {/* Sets the theme attributes from the remembered preference before the
            first paint, so nothing flashes in the wrong colours. It runs
            before React, and the static export cannot know the preference —
            it lives in the browser. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeEffect />
        {children}
        <Footer />
      </body>
    </html>
  );
}
