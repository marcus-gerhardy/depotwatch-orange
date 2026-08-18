import type { MetadataRoute } from "next";

// The web app manifest: what "add to home screen" reads, and — together with
// public/sw.js — what makes this installable and startable without a network
// (CLAUDE.md §7.2). Without it the phone would take a screenshot of the page
// as the icon.
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
    // Every size a launcher may ask for, from the one drawing
    // (scripts/build-icons.mjs).
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Cropped to whatever shape the launcher likes, so this one is drawn
      // full-bleed with its glyph inside the safe area (scripts/build-icons.mjs).
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
