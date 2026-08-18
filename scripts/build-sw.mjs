#!/usr/bin/env node
// Writes the service worker's precache list from the finished export.
//
//     npm run sw:build        (runs as part of `npm run build`)
//
// The app is a static export with content-hashed file names, so the list of
// what makes up the shell is only known once the build has run. Registering a
// worker that caches "whatever gets requested" would leave the app *almost*
// offline-capable — everything the first visit happened to load — and "almost"
// is the one thing an offline mode may not be: it fails on the train, which is
// exactly where it was needed.
//
// So this walks the export and writes the real list into sw.js. What goes in is
// the app itself and its own static data:
//
//   • the HTML entry points, the JS and CSS chunks, the fonts, the icons,
//   • the demo portfolio (public sample data, no user's anything) and the
//     whitepaper, both of which the app promises are served from here.
//
// What never goes in: anything of the user's. There is nothing to exclude,
// because a portfolio file never travels over HTTP at all — it is read through
// the File System Access API or a file input.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const SW = join(OUT, "sw.js");

/** Files worth having offline, by extension. */
const KEEP = new Set([".html", ".js", ".css", ".woff2", ".png", ".svg", ".ico", ".json", ".webmanifest", ".pdf"]);

/** …minus the ones that would only bloat the install. */
const SKIP = [
  "/sw.js",
  // Build metadata, never requested by the running app.
  "/_next/static/chunks/polyfills",
  // 2.4 MB of documentation pictures, against 3 MB for the whole rest of the
  // app. The help is written to read without them — a missing screenshot
  // renders as its alt text (§8) — so they are fetched and cached when the
  // help is actually opened, rather than downloaded by everybody up front.
  "/help/screenshots/",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const urls = walk(OUT)
  .map((p) => "/" + relative(OUT, p).split("\\").join("/"))
  .filter((u) => KEEP.has(u.slice(u.lastIndexOf("."))))
  .filter((u) => !SKIP.some((s) => u.startsWith(s)))
  // "/index.html" is reached as "/", which is what a navigation asks for.
  .map((u) => (u === "/index.html" ? "/" : u))
  .sort();

const source = readFileSync(SW, "utf8");
const marker = "const PRECACHE = ";
const start = source.indexOf(marker);
if (start === -1) {
  console.error("sw.js has no PRECACHE list to fill in");
  process.exit(1);
}
const end = source.indexOf(";", source.indexOf("]", start)) + 1;
const list = `${marker}${JSON.stringify(urls, null, 2)};`;
writeFileSync(SW, source.slice(0, start) + list + source.slice(end));

const bytes = urls.reduce((sum, u) => {
  const path = join(OUT, u === "/" ? "index.html" : u);
  try {
    return sum + statSync(path).size;
  } catch {
    return sum;
  }
}, 0);
console.log(`sw.js: ${urls.length} files precached (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
