/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DASHBOARD_COLS,
  dashboardFor,
  defaultDashboard,
  freeRects,
  layoutBottom,
  nextInstanceId,
  placeAt,
  sanitizeDashboard,
  type WidgetPlacement,
} from "./dashboardLayout";

const KNOWN = new Set(["a", "b", "portfolioValue"]);

const w = (
  i: string,
  x: number,
  y: number,
  width: number,
  h: number,
): WidgetPlacement => ({ i, widgetId: "a", x, y, w: width, h });

beforeEach(() => {
  localStorage.clear();
});

describe("freeRects", () => {
  it("merges a whole empty row into one rectangle", () => {
    // One 12-wide widget on row 0, three spare rows below it.
    const rects = freeRects([w("x", 0, 0, 12, 2)], 12, 2);
    expect(rects).toEqual([{ x: 0, y: 2, w: 12, h: 2 }]);
  });

  it("finds the gap beside a widget and merges it vertically", () => {
    const rects = freeRects([w("x", 0, 0, 6, 4)], 12, 0);
    expect(rects).toEqual([{ x: 6, y: 0, w: 6, h: 4 }]);
  });

  it("covers every free cell exactly once", () => {
    const widgets = [w("x", 0, 0, 4, 3), w("y", 8, 1, 4, 2)];
    const cols = 12;
    const spare = 2;
    const rects = freeRects(widgets, cols, spare);
    const rows = layoutBottom(widgets) + spare;
    const seen = new Set<string>();
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          expect(seen.has(`${x}:${y}`)).toBe(false); // no overlap
          seen.add(`${x}:${y}`);
        }
      }
    }
    const occupied = widgets.reduce((n, p) => n + p.w * p.h, 0);
    expect(seen.size).toBe(rows * cols - occupied);
  });

  it("returns nothing for a fully packed grid without spare rows", () => {
    expect(freeRects([w("x", 0, 0, 12, 3)], 12, 0)).toEqual([]);
  });
});

describe("placeAt", () => {
  it("keeps a widget inside the grid", () => {
    expect(placeAt({ x: 10, y: 4 }, { w: 6, h: 3 }, 12)).toEqual({
      x: 6,
      y: 4,
      w: 6,
      h: 3,
    });
  });

  it("clamps a widget wider than the grid", () => {
    expect(placeAt({ x: 0, y: 0 }, { w: 20, h: 2 }, 12)).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 2,
    });
  });
});

describe("sanitizeDashboard", () => {
  it("keeps a valid layout as it is", () => {
    const layout = [{ i: "a-1", widgetId: "a", x: 1, y: 2, w: 3, h: 4 }];
    expect(sanitizeDashboard(layout, KNOWN)).toEqual(layout);
  });

  it("tells a deliberately empty dashboard from a missing one", () => {
    expect(sanitizeDashboard([], KNOWN)).toEqual([]);
    expect(sanitizeDashboard(undefined, KNOWN)).toBeNull();
    expect(sanitizeDashboard("nonsense", KNOWN)).toBeNull();
  });

  it("drops widgets an app update removed from the registry", () => {
    const kept = sanitizeDashboard(
      [
        { i: "a-1", widgetId: "a", x: 0, y: 0, w: 2, h: 2 },
        { i: "gone-1", widgetId: "removedByUpdate", x: 2, y: 0, w: 2, h: 2 },
      ],
      KNOWN,
    );
    expect(kept?.map((p) => p.widgetId)).toEqual(["a"]);
  });

  it("drops entries with a duplicate instance id", () => {
    const kept = sanitizeDashboard(
      [
        { i: "a-1", widgetId: "a", x: 0, y: 0, w: 2, h: 2 },
        { i: "a-1", widgetId: "b", x: 2, y: 0, w: 2, h: 2 },
      ],
      KNOWN,
    );
    expect(kept).toHaveLength(1);
  });

  it("drops entries with a non-numeric position", () => {
    const kept = sanitizeDashboard(
      [{ i: "a-1", widgetId: "a", x: "0", y: 0, w: 2, h: 2 }],
      KNOWN,
    );
    expect(kept).toEqual([]);
  });
});

describe("dashboardFor", () => {
  it("uses the layout stored in the portfolio file", () => {
    const layout = [{ i: "a-1", widgetId: "a", x: 1, y: 2, w: 3, h: 4 }];
    expect(dashboardFor({ dashboardLayout: layout }, KNOWN)).toEqual(layout);
  });

  it("keeps a dashboard the user emptied on purpose empty", () => {
    expect(dashboardFor({ dashboardLayout: [] }, KNOWN)).toEqual([]);
  });

  it("falls back to the default for a file written before uiSettings existed", () => {
    expect(dashboardFor(undefined, KNOWN)).toEqual(defaultDashboard());
    expect(dashboardFor({}, KNOWN)).toEqual(defaultDashboard());
  });

  it("adopts a layout an older app version left in localStorage", () => {
    const legacy = [{ i: "b-1", widgetId: "b", x: 0, y: 0, w: 2, h: 2 }];
    localStorage.setItem(
      "depotwatch.dashboard.v1",
      JSON.stringify({ widgets: legacy }),
    );
    expect(dashboardFor(undefined, KNOWN)).toEqual(legacy);
  });

  it("lets the file win over the localStorage leftover", () => {
    localStorage.setItem(
      "depotwatch.dashboard.v1",
      JSON.stringify({ widgets: [{ i: "b-1", widgetId: "b", x: 0, y: 0, w: 2, h: 2 }] }),
    );
    const layout = [{ i: "a-1", widgetId: "a", x: 1, y: 1, w: 2, h: 2 }];
    expect(dashboardFor({ dashboardLayout: layout }, KNOWN)).toEqual(layout);
  });
});

describe("nextInstanceId", () => {
  it("does not collide with an existing instance", () => {
    const widgets = [w("a-1", 0, 0, 2, 2), w("a-2", 2, 0, 2, 2)];
    expect(nextInstanceId(widgets, "a")).toBe("a-3");
  });
});

describe("defaultDashboard", () => {
  // Both variants of the layout have to hold up: the complete one, and the one
  // a file gets that cannot fill a conditional widget (the savings goal, §4.4
  // — laid out through the band's `fallback` rather than as a hole the grid
  // would compact away, which would rewrite the file on mount).
  const variants: [string, WidgetPlacement[]][] = [
    ["complete", defaultDashboard()],
    ["without the savings goal", defaultDashboard((id) => id !== "savingsGoal")],
  ];

  it("leaves a widget out only where the file cannot fill it", () => {
    const [, withoutGoal] = variants[1];
    expect(defaultDashboard().map((p) => p.widgetId)).toContain("savingsGoal");
    expect(withoutGoal.map((p) => p.widgetId)).not.toContain("savingsGoal");
  });

  for (const [name, layout] of variants) {
    describe(name, () => {
      it("has no overlapping widgets", () => {
        const seen = new Set<string>();
        for (const p of layout) {
          for (let y = p.y; y < p.y + p.h; y++) {
            for (let x = p.x; x < p.x + p.w; x++) {
              expect(seen.has(`${x}:${y}`)).toBe(false);
              seen.add(`${x}:${y}`);
            }
          }
        }
      });

      it("uses unique instance ids", () => {
        const ids = layout.map((p) => p.i);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("fills every row of the grid completely", () => {
        // "Fits the grid perfectly" is this: no row is part empty, so there is
        // no ragged edge and no gap a widget could be pulled into.
        const perRow = new Map<number, number>();
        for (const p of layout) {
          for (let y = p.y; y < p.y + p.h; y++) {
            perRow.set(y, (perRow.get(y) ?? 0) + p.w);
          }
        }
        const bottom = Math.max(...layout.map((p) => p.y + p.h));
        for (let y = 0; y < bottom; y++) {
          expect(perRow.get(y), `row ${y} is not full`).toBe(DASHBOARD_COLS);
        }
      });

      it("is a compaction fixed point: nothing could float upwards", () => {
        // react-grid-layout compacts on mount and reports the result. If
        // anything could rise, merely opening the dashboard would rewrite the
        // file (§4.1). DashboardGrid.test.tsx asserts the same thing through
        // the real grid; this one states the property directly, so a broken
        // band says why.
        const occupied = new Set<string>();
        for (const p of layout) {
          for (let y = p.y; y < p.y + p.h; y++) {
            for (let x = p.x; x < p.x + p.w; x++) occupied.add(`${x}:${y}`);
          }
        }
        for (const p of layout) {
          if (p.y === 0) continue;
          const restsOnSomething = Array.from({ length: p.w }, (_, k) =>
            occupied.has(`${p.x + k}:${p.y - 1}`),
          ).some(Boolean);
          expect(restsOnSomething, `${p.widgetId} could float up`).toBe(true);
        }
      });
    });
  }
});
