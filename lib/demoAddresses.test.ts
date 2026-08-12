/** @vitest-environment jsdom */
// The demo portfolio's addresses have to be real addresses.
//
// A fabricated one passes for a screenshot and fails everywhere it matters:
// the app's own add-address form would reject it, and every visitor who loads
// the demo sends the explorer a request that can only come back as an error.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isValidBitcoinAddress } from "./bitcoin";
import type { PortfolioFile } from "./types";

const files = ["public/demo-portfolio.json", "public/demo-portfolio.en.json"];

describe("the demo portfolio's addresses", () => {
  for (const file of files) {
    it(`are valid in ${file}`, () => {
      const p = JSON.parse(readFileSync(file, "utf8")) as PortfolioFile;
      const plain = p.watchedAddresses.filter((a) => a.type === "address");
      expect(plain.length).toBeGreaterThan(0);
      for (const a of plain) {
        expect(isValidBitcoinAddress(a.value), a.value).toBe(true);
      }
      // The on-chain addresses on transfer legs are shown as explorer links,
      // so they have to hold up too.
      for (const w of p.wallets) {
        for (const acc of w.accounts) {
          for (const t of acc.transactions) {
            if (!t.address) continue;
            expect(isValidBitcoinAddress(t.address), `${t.id}: ${t.address}`).toBe(true);
          }
        }
      }
    });
  }
});
