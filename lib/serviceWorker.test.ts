/** @vitest-environment jsdom */
// What the service worker is allowed to touch (CLAUDE.md §7.2).
//
// The rule the whole feature rests on: **no portfolio data, no decrypted
// content, and no response from an exchange or a block explorer may end up in
// a cache.** That is enforced by scope rather than by care — the worker only
// intercepts same-origin GET requests — so this test reads the worker's source
// and holds it to that shape. A behavioural test would need a service worker
// environment; what actually matters here is a property of the code.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SW = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

describe("the service worker", () => {
  it("leaves everything cross-origin alone", () => {
    // Prices and chain data go to third parties. Not intercepted means not
    // cached, not inspected, not touched — and it means a failing request
    // fails, which is what lets the UI say "offline" honestly.
    expect(SW).toContain("url.origin !== self.location.origin");
    expect(SW).toMatch(/url\.origin !== self\.location\.origin\)\s*return;/);
  });

  it("only ever handles GET", () => {
    expect(SW).toMatch(/request\.method !== "GET"\)\s*return;/);
  });

  it("never activates itself without being asked", () => {
    // Reloading somebody mid-edit to install an update would lose their work.
    // skipWaiting exists, but only behind a message from the page.
    const calls = [...SW.matchAll(/skipWaiting\(\)/g)];
    expect(calls).toHaveLength(1);
    expect(SW).toMatch(/addEventListener\("message"[\s\S]*skipWaiting\(\)/);
    // …and not in the install handler, which is where it would be automatic.
    const install = SW.slice(SW.indexOf('addEventListener("install"'), SW.indexOf('addEventListener("activate"'));
    expect(install).not.toContain("skipWaiting");
  });

  it("versions its cache, so an old shell can be retired", () => {
    expect(SW).toMatch(/const CACHE = "[^"]+-v\d+"/);
    expect(SW).toContain("caches.delete");
  });
});
