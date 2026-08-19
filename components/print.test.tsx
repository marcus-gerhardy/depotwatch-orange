/** @vitest-environment jsdom */
// What a page becomes on paper (CLAUDE.md §5.4).
//
// The print rules live in globals.css rather than in the components, because a
// component that has to remember `print:hidden` is a component that will
// forget. That makes them a property of one file — which is what this test
// reads. A rendering test would need a print-media layout engine; what
// actually matters here is that the rules exist and say the right thing.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const PRINT = CSS.slice(CSS.indexOf("@media print"));

describe("the print stylesheet", () => {
  it("sets a page size and margins", () => {
    // Without @page the browser's defaults apply, which differ per browser and
    // per locale — a report should not be a different document on somebody
    // else's machine.
    expect(CSS).toMatch(/@page\s*{[^}]*size:\s*A4/);
    expect(CSS).toMatch(/@page\s*{[^}]*margin:/);
  });

  it("drops the app's own chrome", () => {
    // Header, navigation, footer, and anything that was merely open at the
    // time: none of it is part of a report.
    for (const selector of ["nav", "footer", '[role="dialog"]', '[role="status"]']) {
      expect(PRINT).toContain(selector);
    }
    expect(PRINT).toMatch(/button[\s\S]*display:\s*none/);
  });

  it("repeats table headers and keeps rows whole", () => {
    // Both are the difference between a readable printed table and a puzzle.
    expect(PRINT).toContain("display: table-header-group");
    expect(PRINT).toMatch(/break-inside:\s*avoid/);
  });

  it("shows every column, whatever the width breakpoints say", () => {
    // An A4 page is ~794 px, so `lg:` never applies to it — which silently
    // dropped columns from the printed report until this rule existed.
    expect(PRINT).toMatch(/th,\s*\n\s*td\s*{\s*display:\s*table-cell\s*!important/);
    // …except the ones holding nothing but controls, which must still go.
    expect(PRINT).toMatch(/th\.print-hide[\s\S]*display:\s*none/);
  });

  it("uses one type family, not the paper theme's serif pairing", () => {
    expect(PRINT).toContain("--theme-font-heading");
  });
});
