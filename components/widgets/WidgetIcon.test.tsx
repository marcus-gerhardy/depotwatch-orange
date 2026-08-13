/** @vitest-environment jsdom */
// The widget icons (CLAUDE.md §4.1).
//
// Same contract as the milestone set: every widget has exactly one drawing, no
// drawing exists for a widget that does not, and all of them share one
// geometry. A missing icon is a blank square in the picker and nothing else —
// the kind of gap that ships because nobody scrolled that far.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WIDGETS } from "./registry";
import WidgetIcon, { WIDGET_ICON_IDS } from "./WidgetIcon";
import { MILESTONE_ICON_IDS } from "../MilestoneIcon";
import MilestoneIcon from "../MilestoneIcon";

afterEach(cleanup);

describe("the widget icons", () => {
  it("has one for every registered widget", () => {
    const missing = WIDGETS.filter((w) => !WIDGET_ICON_IDS.has(w.id)).map((w) => w.id);
    expect(missing).toEqual([]);
  });

  it("draws none that no widget asks for", () => {
    const ids = new Set(WIDGETS.map((w) => w.id));
    expect([...WIDGET_ICON_IDS].filter((id) => !ids.has(id))).toEqual([]);
  });

  it("draws them all at the same size and weight", () => {
    for (const w of WIDGETS) {
      const { container } = render(<WidgetIcon id={w.id} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("1.6");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      for (const shape of svg.querySelectorAll("path, circle, rect, ellipse")) {
        expect(shape.getAttribute("stroke-width")).toBeNull();
        const fill = shape.getAttribute("fill");
        if (fill !== null) {
          // The one permitted exception, as in the milestone set: a solid dot.
          expect(fill).toBe("currentColor");
          expect(shape.getAttribute("stroke")).toBe("none");
        }
      }
      cleanup();
    }
  });

  it("stays inside its box", () => {
    const coords = /-?\d+(\.\d+)?/g;
    for (const w of WIDGETS) {
      const { container } = render(<WidgetIcon id={w.id} />);
      for (const path of container.querySelectorAll("path")) {
        for (const n of path.getAttribute("d")!.match(coords) ?? []) {
          expect(Math.abs(Number(n))).toBeLessThanOrEqual(24);
        }
      }
      cleanup();
    }
  });

  it("gives every widget a distinguishable drawing", () => {
    // Two widgets with the same picture are two rows in the picker that cannot
    // be told apart — which is how the year in review and the buy heatmap both
    // ended up as calendars.
    const seen = new Map<string, string>();
    for (const w of WIDGETS) {
      const { container } = render(<WidgetIcon id={w.id} />);
      const shape = container.querySelector("svg")!.innerHTML;
      expect(seen.get(shape), `${w.id} and ${seen.get(shape)}`).toBeUndefined();
      seen.set(shape, w.id);
      cleanup();
    }
  });
});

describe("both icon sets", () => {
  it("share one geometry, so they read as one family", () => {
    const geometry = (node: React.ReactElement) => {
      const { container } = render(node);
      const svg = container.querySelector("svg")!;
      const props = ["viewBox", "fill", "stroke", "stroke-width", "stroke-linecap"].map(
        (a) => svg.getAttribute(a),
      );
      cleanup();
      return props;
    };
    expect(geometry(<WidgetIcon id={WIDGETS[0].id} />)).toEqual(
      geometry(<MilestoneIcon id={[...MILESTONE_ICON_IDS][0]} />),
    );
  });
});
