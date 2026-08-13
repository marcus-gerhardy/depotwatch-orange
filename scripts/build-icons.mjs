#!/usr/bin/env node
// Every icon the app ships, from one drawing: `npm run icons:build`.
//
// The source is `assets/icon.svg` and nothing else. Favicons rot the moment
// they are maintained by hand — the .ico says one thing, the touch icon another,
// and the manifest a third — so all of them are rasterised from the same file
// and regenerating is one command.
//
// Two things worth knowing about the output:
//
//  • **The .ico is written here**, because packing one is a 22-byte header plus
//    PNG payloads and that is cheaper than a dependency. Windows and old
//    browsers still ask for it; everything current takes the SVG.
//  • **The maskable icon is a different drawing**, not a resize. Android crops
//    launcher icons to whatever shape the device likes, so that variant is
//    full-bleed (the rounded corners would be cropped anyway) and its glyph is
//    smaller, inside the safe circle the spec guarantees.
//
// Rasterising uses Playwright with whatever Chromium is available — the same
// arrangement as the help screenshots (§8).

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = join(ROOT, "assets", "icon.svg");

/** name → [size, variant]; "app" files are picked up by Next's conventions. */
const TARGETS = [
  { file: "app/apple-icon.png", size: 180, variant: "default" },
  { file: "public/icon-192.png", size: 192, variant: "default" },
  { file: "public/icon-512.png", size: 512, variant: "default" },
  { file: "public/icon-maskable-512.png", size: 512, variant: "maskable" },
];

/** The sizes inside favicon.ico. 48 is for Windows' larger list views. */
const ICO_SIZES = [16, 32, 48];

/**
 * The launcher variant: no rounded corners (the platform applies its own mask)
 * and a smaller glyph, so nothing important sits outside the safe area.
 */
function maskableOf(svg) {
  const flat = svg.replace(/(<rect width="64" height="64" rx=")[\d.]+(")/, "$10$2");
  const shrunk = flat.replace(/scale\([\d.]+\)/, "scale(0.74)");
  // Both substitutions have to bite, or the variant would silently be a plain
  // copy — a rounded tile that the launcher then crops into, with the glyph
  // too close to the edge.
  if (flat === svg || shrunk === flat) {
    throw new Error("maskable variant: the source no longer matches the patterns");
  }
  return shrunk;
}

async function rasterise(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true });
}

/**
 * Pack PNGs into an .ico. The format is a 6-byte header, one 16-byte directory
 * entry per image, then the payloads; a size of 0 in an entry means 256.
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  const svg = readFileSync(SOURCE, "utf8");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  // The modern icon is the drawing itself: no rasterising, no size to pick.
  mkdirSync(join(ROOT, "app"), { recursive: true });
  copyFileSync(SOURCE, join(ROOT, "app", "icon.svg"));
  console.log("  ✓ app/icon.svg");

  for (const { file, size, variant } of TARGETS) {
    const png = await rasterise(page, variant === "maskable" ? maskableOf(svg) : svg, size);
    writeFileSync(join(ROOT, file), png);
    console.log(`  ✓ ${file} (${size}px${variant === "maskable" ? ", maskable" : ""})`);
  }

  const images = [];
  for (const size of ICO_SIZES) {
    images.push({ size, data: await rasterise(page, svg, size) });
  }
  writeFileSync(join(ROOT, "app", "favicon.ico"), packIco(images));
  console.log(`  ✓ app/favicon.ico (${ICO_SIZES.join(", ")})`);

  await browser.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
