import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Footer from "@/components/Footer";
import ThemeEffect from "@/components/ThemeEffect";
import { THEME_BOOT_SCRIPT } from "@/lib/themeBoot";
import { SITE_URL } from "@/lib/site";
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
  // Every canonical URL and the sitemap are resolved against this, so it has
  // to be the live domain rather than a preview URL.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "DepotWatch Orange — Bitcoin-Portfolio, lokal und verschlüsselt",
    template: "%s — DepotWatch Orange",
  },
  description:
    "Bitcoin-Portfolio verwalten ohne Konto und ohne Server: Alle Daten liegen in einer verschlüsselten Datei auf deinem Gerät. Mit FIFO-Auswertung, CSV-Import und Adress-Watchlist.",
  applicationName: "DepotWatch Orange",
  alternates: { canonical: "/", languages: { de: "/", en: "/" } },
  openGraph: {
    type: "website",
    siteName: "DepotWatch Orange",
    locale: "de_DE",
    url: "/",
    title: "DepotWatch Orange — Bitcoin-Portfolio, lokal und verschlüsselt",
    description:
      "Kein Konto, kein Server, keine Cloud: dein Bitcoin-Portfolio in einer verschlüsselten Datei auf deinem Gerät.",
  },
  // No Twitter card image and no verification tokens: both would be claims
  // about accounts that do not exist. They belong here once they do.
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
};

/** The colour behind the browser UI on mobile — the app's own background. */
export const viewport: Viewport = {
  themeColor: "#050b14",
  colorScheme: "dark light",
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
