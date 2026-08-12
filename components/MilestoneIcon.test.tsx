/** @vitest-environment jsdom */
// The icon set (CLAUDE.md §5.2).
//
// Two things have to hold for a column of these to read as one set: every
// milestone has a drawing, and every drawing has the same geometry. Both are
// invisible failures — a missing icon is a blank space, a stray stroke width is
// one icon that looks bolder than its neighbours — so both are asserted here.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MILESTONES } from "@/lib/milestones";
import MilestoneIcon, { MILESTONE_ICON_IDS } from "./MilestoneIcon";

afterEach(cleanup);

describe("the milestone icons", () => {
  it("has one for every entry in the catalogue", () => {
    const missing = MILESTONES.filter((m) => !MILESTONE_ICON_IDS.has(m.id)).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it("draws none that no milestone asks for", () => {
    const ids = new Set(MILESTONES.map((m) => m.id));
    expect([...MILESTONE_ICON_IDS].filter((id) => !ids.has(id))).toEqual([]);
  });

  it("draws them all at the same size and weight", () => {
    for (const m of MILESTONES) {
      const { container } = render(<MilestoneIcon id={m.id} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("1.6");
      expect(svg.getAttribute("fill")).toBe("none");
      // Decoration next to a title that already names the milestone.
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      // No shape may bring a weight or a colour of its own — the only
      // permitted exception is a solid dot, which drops the stroke entirely.
      for (const shape of svg.querySelectorAll("path, circle, rect")) {
        expect(shape.getAttribute("stroke-width")).toBeNull();
        const fill = shape.getAttribute("fill");
        if (fill !== null) {
          expect(fill).toBe("currentColor");
          expect(shape.getAttribute("stroke")).toBe("none");
        }
      }
      cleanup();
    }
  });

  it("stays inside its box", () => {
    // A drawing that runs past the 24×24 viewBox is clipped on screen, which
    // looks like a broken icon rather than a wrong number.
    const coords = /-?\d+(\.\d+)?/g;
    for (const m of MILESTONES) {
      const { container } = render(<MilestoneIcon id={m.id} />);
      for (const path of container.querySelectorAll("path")) {
        for (const n of path.getAttribute("d")!.match(coords) ?? []) {
          expect(Math.abs(Number(n))).toBeLessThanOrEqual(24);
        }
      }
      cleanup();
    }
  });
});
