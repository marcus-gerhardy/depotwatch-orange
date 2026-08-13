import type { MetadataRoute } from "next";

// The web app manifest. Not a claim to be a full PWA — there is no service
// worker and nothing is cached beyond what the browser does anyway — but it is
// what an "add to home screen" reads, and without it the phone would take a
// screenshot of the page as the icon.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DepotWatch Orange",
    short_name: "DepotWatch",
    description:
      "Bitcoin-Portfolio verwalten ohne Konto und ohne Server: alle Daten in einer verschlüsselten Datei auf deinem Gerät.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    // The app's own background and accent, so the splash screen and the title
    // bar are the app's colours rather than the browser's default white.
    background_color: "#050b14",
    theme_color: "#050b14",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Cropped to whatever shape the launcher likes, so this one is drawn
      // full-bleed with its glyph inside the safe area (scripts/build-icons.mjs).
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
