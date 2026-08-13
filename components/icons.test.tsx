/** @vitest-environment jsdom */
// The shared icon geometry, and the rule that keeps it the only one
// (CLAUDE.md §5).
//
// Two things are asserted here. The inline marks share the geometry of the two
// icon sets, so a warning triangle in a hint and a widget's icon beside it read
// as one family. And **no symbol character comes back**: the emoji and the
// dingbats were removed once, and nothing stops the next warning sign from
// being typed straight into a component except a test that looks. This file is
// scanned like any other — the first thing the guard caught was a symbol in
// this very comment, which is the argument against exempting test files.

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  EditIcon,
  FlaskIcon,
  KeyIcon,
  LockIcon,
  MenuIcon,
  PizzaIcon,
  StarIcon,
  TargetIcon,
  UnlockIcon,
  UploadIcon,
  WarnIcon,
} from "./icons";

afterEach(cleanup);

const INLINE_ICONS = {
  WarnIcon,
  CheckIcon,
  CloseIcon,
  MenuIcon,
  EditIcon,
  DownloadIcon,
  UploadIcon,
  LockIcon,
  UnlockIcon,
  FlaskIcon,
  KeyIcon,
  PizzaIcon,
  StarIcon,
  TargetIcon,
};

describe("the inline marks", () => {
  it("share the geometry of the drawn sets", () => {
    for (const [name, Icon] of Object.entries(INLINE_ICONS)) {
      const { container } = render(<Icon />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox"), name).toBe("0 0 24 24");
      expect(svg.getAttribute("stroke"), name).toBe("currentColor");
      expect(svg.getAttribute("stroke-width"), name).toBe("1.6");
      expect(svg.getAttribute("fill"), name).toBe("none");
      // Decoration beside text that already says what it is. An icon that
      // announced itself would read every warning twice.
      expect(svg.getAttribute("aria-hidden"), name).toBe("true");
      cleanup();
    }
  });

  it("are sized in em, so they follow the text they sit in", () => {
    for (const [name, Icon] of Object.entries(INLINE_ICONS)) {
      const cls = render(<Icon />).container.querySelector("svg")!.getAttribute("class")!;
      expect(cls, name).toContain("h-[1.15em]");
      expect(cls, name).toContain("w-[1.15em]");
      cleanup();
    }
  });

  it("keeps a caller's classes", () => {
    const cls = render(<WarnIcon className="text-loss" />)
      .container.querySelector("svg")!
      .getAttribute("class")!;
    expect(cls).toContain("text-loss");
  });

  it("stays inside its box", () => {
    const coords = /-?\d+(\.\d+)?/g;
    for (const [name, Icon] of Object.entries(INLINE_ICONS)) {
      const { container } = render(<Icon />);
      for (const path of container.querySelectorAll("path")) {
        for (const n of path.getAttribute("d")!.match(coords) ?? []) {
          expect(Math.abs(Number(n)), name).toBeLessThanOrEqual(24);
        }
      }
      cleanup();
    }
  });
});

// ---------------------------------------------------------------- the guard

const ROOT = resolve(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

/**
 * Pictographs, Miscellaneous Symbols and Dingbats, and the variation selector
 * that forces emoji presentation.
 *
 * Deliberately **not** listed: Arrows (U+2190–21FF) and Geometric Shapes
 * (U+25A0–25FF). Those are typography, not icons — the `→` between two
 * accounts, the `▸` of a disclosure, and the ▲/▼/• of `PnlValue`, which are
 * how a direction survives without colour (§5) and have to sit on the baseline
 * of the figure they belong to.
 */
const SYMBOLS =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2630}]/gu;

describe("an icon that is the whole button", () => {
  it("always has the button name it, so replacing a character kept it", () => {
    // The close buttons used to have a multiplication-sign character as their
    // content, which *was* their accessible name. A drawing is `aria-hidden`,
    // so the name has to come from the button — and losing it that way is
    // silent: the button still looks right and reads as nothing.
    const nameless: string[] = [];
    for (const dir of ["components", "app"]) {
      for (const file of sourceFiles(dir)) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/<(\w+Icon)\b[^>]*\/>\s*<\/button>/g)) {
          const open = src.lastIndexOf("<button", m.index);
          const head = open < 0 ? "" : src.slice(open, m.index);
          if (!/aria-label[=\s]/.test(head)) {
            const line = src.slice(0, m.index).split("\n").length;
            nameless.push(`${relative(ROOT, file)}:${line} ${m[1]}`);
          }
        }
      }
    }
    expect(nameless).toEqual([]);
  });
});

describe("no symbol characters in the source", () => {
  it("finds none outside the module that replaced them", () => {
    const offenders: string[] = [];
    for (const dir of ["components", "lib", "app"]) {
      for (const file of sourceFiles(dir)) {
        // The one exemption: `icons.tsx` names the characters it exists to
        // replace, in the comment explaining why.
        if (file.endsWith(join("components", "icons.tsx"))) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            for (const m of line.match(SYMBOLS) ?? []) {
              offenders.push(`${relative(ROOT, file)}:${i + 1} ${m}`);
            }
          });
      }
    }
    // Named in full rather than counted: the point of failing here is to say
    // which line to fix.
    expect(offenders).toEqual([]);
  });
});
