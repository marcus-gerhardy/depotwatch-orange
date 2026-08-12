#!/usr/bin/env node
// Screenshots for the help (CLAUDE.md §8): `npm run help:screenshots`.
//
// **Only ever the demo portfolio.** The one rule this script exists under is
// that no real portfolio may end up in the documentation, so it never opens a
// file: it clicks "load the demo portfolio" on the start screen and works from
// there. There is no code path in here that could reach a user's data.
//
// Everything else is about reproducibility, so that re-running after a UI
// change produces a comparable set rather than a different-looking one:
//
//  • fixed viewport, fixed theme, fixed language, seeded before the first paint;
//  • **the network is cut off** and the two external interfaces are answered
//    with fixed values instead. Screenshots that depend on today's bitcoin
//    price would differ every run, and a documentation build has no business
//    calling an exchange either way;
//  • animations disabled, so nothing is caught mid-transition.
//
// The app is served from the static export, which is what users actually get.
// Playwright drives whatever Chromium is available: the bundled one, or a
// system install via CHROMIUM_PATH.

import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "public", "help", "screenshots");
const EXPORT_DIR = join(ROOT, "out");
const PORT = 4321;

/** Fixed figures, so every run produces the same pictures. */
const SPOT_EUR = 92_500;
const SPOT_USD = 100_000;

const VIEWPORT = { width: 1280, height: 860 };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

function serveStatic(dir, port) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const candidates = [
      join(dir, url),
      join(dir, `${url}.html`),
      join(dir, url, "index.html"),
    ];
    const file = candidates.find((c) => existsSync(c) && extname(c) !== "");
    if (!file) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

/** Deterministic daily closes, so charts have a shape but not today's shape. */
function fakeKlines(count = 400) {
  const day = 86_400_000;
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: count }, (_, i) => {
    const price = 60_000 + Math.round(Math.sin(i / 26) * 12_000 + i * 70);
    return [start + i * day, String(price), String(price), String(price), String(price), "1"];
  });
}

async function main() {
  if (!existsSync(EXPORT_DIR)) {
    console.error("No static export found. Run `npm run build` first.");
    return 1;
  }
  await mkdir(OUT_DIR, { recursive: true });
  const server = await serveStatic(EXPORT_DIR, PORT);
  const base = `http://127.0.0.1:${PORT}`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });

  // Nothing leaves this machine. The two interfaces the app may call are
  // answered here with fixed values; anything else is refused outright, so a
  // forgotten request shows up as a failure rather than as a silent call.
  await context.route("https://api.binance.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("ticker/price")) {
      const price = url.includes("BTCUSDT") ? SPOT_USD : SPOT_EUR;
      return route.fulfill({ json: { price: String(price) } });
    }
    if (url.includes("klines")) return route.fulfill({ json: fakeKlines() });
    return route.fulfill({ json: {} });
  });
  await context.route("https://mempool.space/**", (route) => route.fulfill({ json: {} }));
  await context.route("https://blockstream.info/**", (route) => route.fulfill({ json: {} }));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());

  // Language and appearance before the first paint: the app reads both from
  // localStorage, and the boot script applies the theme before rendering.
  await context.addInitScript(() => {
    localStorage.setItem("depotwatch.locale", "de");
    localStorage.setItem(
      "depotwatch.appearance",
      JSON.stringify({ mode: "fixed", theme: "ocean", colorBlindSafe: false }),
    );
  });

  const page = await context.newPage();
  // Belt and braces on top of reducedMotion: a transition caught halfway makes
  // two runs differ for no reason.
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important}",
  }).catch(() => {});

  const shots = [];
  const shot = async (name, target = page) => {
    await page.waitForTimeout(400);
    await target.screenshot({ path: join(OUT_DIR, `${name}.png`) });
    shots.push(name);
    console.log(`  ✓ ${name}.png`);
  };

  console.log("opening the demo portfolio …");
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Testportfolio/i }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).waitFor();

  // The backup reminder is about this session, not about the data — in a
  // screenshot it would only document a banner.
  const reminder = page.getByRole("button", { name: /Backups öffnen/ });
  if (await reminder.isVisible().catch(() => false)) {
    await page.locator("button[aria-label='Schließen']").first().click().catch(() => {});
  }
  await page.waitForTimeout(1500); // widgets settle, prices arrive
  await shot("dashboard");

  await page.getByRole("button", { name: "Transaktionen", exact: true }).click();
  await shot("transactions");

  await page.getByRole("button", { name: /Transaktion erfassen/ }).click();
  await page.getByRole("dialog").waitFor();
  await shot("transaction-form", page.getByRole("dialog"));
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Steuer", exact: true }).click();
  await shot("tax");

  await page.getByRole("button", { name: "Watchlist", exact: true }).click();
  await shot("watchlist");

  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await shot("settings");
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await shot("settings-backups");

  // The help itself, as a page — useful in the "getting started" topic.
  await page.goto(`${base}/hilfe`, { waitUntil: "networkidle" });
  await shot("help");

  await browser.close();
  server.close();

  const written = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".png"));
  console.log(`\n${shots.length} screenshots in public/help/screenshots (${written.length} files)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
