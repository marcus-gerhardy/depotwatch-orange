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

import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "public", "help", "screenshots");
const EXPORT_DIR = join(ROOT, "out");
const PORT = 4321;

// The price history the demo portfolio was generated from (scripts/data), so
// the documentation shows the demo's buys and sells *on* the price line rather
// than somewhere above it. Committed data, so this is still offline and still
// the same picture every run.
const HISTORY = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "data", "btc-eur-daily.json"), "utf8"),
).closes;
const HISTORY_DAYS = Object.keys(HISTORY).sort();

/** What a euro is in dollars here — as in the demo generator. */
const USD_PER_EUR = 1.08;

/** Fixed figures, so every run produces the same pictures. */
const SPOT_EUR = Number(HISTORY[HISTORY_DAYS[HISTORY_DAYS.length - 1]]);
const SPOT_USD = Math.round(SPOT_EUR * USD_PER_EUR);

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

/**
 * Daily closes as klines, from the committed history the demo was built on.
 *
 * They used to be a sine wave, which gave the charts a shape and the demo's
 * own trades nothing to sit on: the markers of the price chart come from the
 * file and the line from here, so two different markets made a screenshot that
 * documented a bug that does not exist.
 */
function historyKlines(symbol) {
  const rate = symbol.includes("USDT") ? USD_PER_EUR : 1;
  return HISTORY_DAYS.map((day) => {
    const close = (Number(HISTORY[day]) * rate).toFixed(2);
    return [Date.parse(`${day}T00:00:00Z`), close, close, close, close, "1"];
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
  //
  // **The blanket refusal goes first.** Playwright uses the *last* matching
  // route it was given, so registering it last had it swallow the two handlers
  // below as well — which is why every screenshot in the documentation used to
  // say "price unavailable" and drew no chart at all.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  await context.route("https://api.binance.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("ticker/price")) {
      const price = url.includes("BTCUSDT") ? SPOT_USD : SPOT_EUR;
      return route.fulfill({ json: { price: String(price) } });
    }
    if (url.includes("klines")) {
      return route.fulfill({ json: historyKlines(url) });
    }
    return route.fulfill({ json: {} });
  });
  // The explorer, answered in the shapes it actually serves. An empty object
  // for everything is not "no data", it is malformed data: the watchlist reads
  // `chain_stats` off it and iterates the transaction list, and the page died
  // rather than showing an empty address.
  const explorer = (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/fees/recommended")) {
      return route.fulfill({
        json: { fastestFee: 12, halfHourFee: 8, hourFee: 5, economyFee: 3, minimumFee: 1 },
      });
    }
    if (path.endsWith("/blocks/tip/height")) {
      // Served as a bare number in the body, not as JSON (lib/esplora.ts).
      return route.fulfill({ body: "870000", contentType: "text/plain" });
    }
    if (path.endsWith("/utxo") || path.endsWith("/txs")) {
      return route.fulfill({ json: [] });
    }
    if (path.includes("/address/")) {
      const empty = {
        funded_txo_count: 0,
        funded_txo_sum: 0,
        spent_txo_count: 0,
        spent_txo_sum: 0,
        tx_count: 0,
      };
      return route.fulfill({
        json: { address: path.split("/").pop(), chain_stats: empty, mempool_stats: empty },
      });
    }
    return route.fulfill({ json: {} });
  };
  await context.route("https://mempool.space/**", explorer);
  await context.route("https://blockstream.info/**", explorer);

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
