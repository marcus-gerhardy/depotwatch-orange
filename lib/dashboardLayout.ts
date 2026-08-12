// Layout model for the configurable widget dashboard.
//
// Position, size and choice of widgets live in the portfolio file
// (`uiSettings.dashboardLayout`, CLAUDE.md §3.5), so the arrangement travels
// with the file rather than with the browser. Writing is deliberately not
// per drag: the dashboard buffers changes and commits them once when the user
// leaves edit mode, so one editing session costs one save (and, for an
// encrypted file, one re-encryption).

import type { DashboardWidgetPlacement, UiSettings } from "./types";
import { TAX_FEATURES_ENABLED } from "./features";
import { legacyDashboardLayout } from "./legacyUiPrefs";

/** Grid geometry — shared by the grid itself and the free-cell overlay. */
export const DASHBOARD_COLS = 12;
export const DASHBOARD_ROW_HEIGHT = 40;
export const DASHBOARD_MARGIN: [number, number] = [12, 12];
export const DASHBOARD_PADDING: [number, number] = [0, 0];
/** Empty rows offered below the last widget, so there is always room to add. */
export const DASHBOARD_SPARE_ROWS = 3;

/** Re-exported under the name the dashboard code uses. */
export type WidgetPlacement = DashboardWidgetPlacement;

/**
 * One row band of the default layout: widgets side by side, and the height they
 * all share.
 *
 * The bands are what makes the default a **compaction fixed point** (§4.1). A
 * band is exactly `DASHBOARD_COLS` wide and every widget in it is equally tall,
 * so each band rests completely on the one above it and react-grid-layout can
 * float nothing upwards. Get either property wrong — a band 11 wide, or two
 * heights in one band — and the grid silently rearranges the layout on mount,
 * which marks the file as changed just for opening the dashboard.
 */
interface LayoutBand {
  /** Height of every widget in this band, in grid rows. */
  h: number;
  /** [widget id, width]; the widths must add up to DASHBOARD_COLS. */
  widgets: [string, number][];
  /** Dropped entirely when the tax features are off (§4). */
  taxOnly?: boolean;
}

/**
 * Default dashboard: **every** registered widget, in reading order — the
 * figures a portfolio owner looks at first (value, P/L, price), then the
 * holding, the charts, the ledger panels, the on-chain tiles, the data-quality
 * strip and finally the tax figures.
 *
 * Widths are chosen so each band fills the grid exactly; a widget's size here
 * always stays inside the min/max its registry entry declares, which a test
 * asserts against the registry.
 */
const DEFAULT_BANDS: LayoutBand[] = [
  // 1. What is it worth, right now. The three figures somebody opens the app
  //    for, and the only band that never needs scrolling to.
  { h: 4, widgets: [["portfolioValue", 4], ["pnl", 4], ["btcPrice", 4]] },
  // 2. What it is made of, what it cost, and whether it is actually yours.
  { h: 5, widgets: [["satsStack", 4], ["avgCost", 4], ["custody", 4]] },
  // 3. The value over time, with the scenario tool beside it: "and if the
  //    price were X" is the question that follows from looking at the curve.
  { h: 8, widgets: [["portfolioChart", 8], ["whatIf", 4]] },
  // 4. Own entries and exits in the market's context, next to the tax clock
  //    that decides what selling them would cost.
  { h: 8, widgets: [["priceEntries", 8], ["holdingPeriod", 4]] },
  // 5. Buying behaviour. The heatmap gets eight columns because a year of days
  //    is 53 week columns wide and only fits from there on.
  { h: 6, widgets: [["buyHeatmap", 8], ["dca", 4]] },
  // 6. The stack itself over time, and what it is composed of.
  { h: 7, widgets: [["stackHistory", 6], ["holdingComposition", 6]] },
  // 7. Where it sits, what it cost in fees, and whether the numbers above can
  //    be trusted at all.
  { h: 6, widgets: [["walletBreakdown", 6], ["feeBalance", 3], ["dataQuality", 3]] },
  // 8. Tax. Its own band, so switching the tax features off removes it whole
  //    and the bands above simply keep their positions (no hole to compact
  //    away) — a tax widget in a shared band would leave one.
  {
    h: 7,
    taxOnly: true,
    widgets: [["taxFreeProceeds", 6], ["exemptionLimit", 6]],
  },
  // 9. The watchlist: on-chain, and the only tiles that talk to the explorer
  //    about addresses.
  { h: 6, widgets: [["utxoOverview", 4], ["watchlistStatus", 4], ["blockClock", 4]] },
  // 10. The record of what the owner has decided so far: the milestones (§5.2)
  //     and the last completed year (§4.2). Both look backwards, so they read
  //     as one band rather than as two tiles among the ambient facts below.
  { h: 6, widgets: [["milestones", 6], ["yearInReview", 6]] },
  // 11. Ambient chain and portfolio facts. Interesting, rarely urgent.
  {
    h: 6,
    widgets: [
      ["networkFees", 4],
      ["halving", 4],
      ["timeInMarket", 4],
    ],
  },
];

export function defaultDashboard(): WidgetPlacement[] {
  const out: WidgetPlacement[] = [];
  let y = 0;
  for (const band of DEFAULT_BANDS) {
    if (band.taxOnly && !TAX_FEATURES_ENABLED) continue;
    let x = 0;
    for (const [widgetId, w] of band.widgets) {
      out.push({ i: `${widgetId}-1`, widgetId, x, y, w, h: band.h });
      x += w;
    }
    y += band.h;
  }
  return out;
}

function isPlacement(v: unknown): v is WidgetPlacement {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.i === "string" &&
    typeof p.widgetId === "string" &&
    ["x", "y", "w", "h"].every(
      (k) => typeof p[k] === "number" && Number.isFinite(p[k] as number),
    )
  );
}

/**
 * Turn a stored layout into one that can be rendered, dropping anything that
 * would not: unknown widget ids (a widget removed from the registry by an app
 * update) and duplicate instance ids. Returns null when there is nothing
 * usable, so the caller can tell "no layout stored" from "deliberately empty" —
 * a dashboard the user emptied on purpose must stay empty.
 */
export function sanitizeDashboard(
  stored: unknown,
  knownWidgetIds: Set<string>,
): WidgetPlacement[] | null {
  if (!Array.isArray(stored)) return null;
  const seen = new Set<string>();
  return stored.filter((w): w is WidgetPlacement => {
    if (!isPlacement(w) || !knownWidgetIds.has(w.widgetId) || seen.has(w.i)) {
      return false;
    }
    seen.add(w.i);
    return true;
  });
}

/**
 * The dashboard to render for a portfolio: its own stored layout, else the
 * layout a previous version of the app left in localStorage (adopted once, and
 * only until the user changes something), else the default.
 */
export function dashboardFor(
  uiSettings: UiSettings | undefined,
  knownWidgetIds: Set<string>,
): WidgetPlacement[] {
  return (
    sanitizeDashboard(uiSettings?.dashboardLayout, knownWidgetIds) ??
    sanitizeDashboard(legacyDashboardLayout(), knownWidgetIds) ??
    defaultDashboard()
  );
}

/** A free instance id for `widgetId`, so one widget can be placed twice. */
export function nextInstanceId(
  widgets: WidgetPlacement[],
  widgetId: string,
): string {
  const taken = new Set(widgets.map((w) => w.i));
  for (let n = 1; ; n++) {
    const id = `${widgetId}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Row below the lowest widget (0 for an empty dashboard). */
export function layoutBottom(widgets: WidgetPlacement[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
}

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The gaps in the layout, merged into as few rectangles as possible.
 *
 * react-grid-layout knows nothing about empty cells, so the "+" placeholders in
 * edit mode are computed here: mark every occupied cell, then walk the grid and
 * grow each free cell right and down as far as it stays free. Merging matters
 * for usability — a 12-column gap should offer one wide "+" button, not twelve
 * tiny ones.
 */
export function freeRects(
  widgets: WidgetPlacement[],
  cols = DASHBOARD_COLS,
  spareRows = DASHBOARD_SPARE_ROWS,
): FreeRect[] {
  const rows = layoutBottom(widgets) + spareRows;
  if (rows <= 0) return [];
  const occupied: boolean[][] = Array.from({ length: rows }, () =>
    Array<boolean>(cols).fill(false),
  );
  for (const w of widgets) {
    for (let y = Math.max(0, w.y); y < Math.min(rows, w.y + w.h); y++) {
      for (let x = Math.max(0, w.x); x < Math.min(cols, w.x + w.w); x++) {
        occupied[y][x] = true;
      }
    }
  }

  const taken: boolean[][] = Array.from({ length: rows }, () =>
    Array<boolean>(cols).fill(false),
  );
  const free = (y: number, x: number) => !occupied[y][x] && !taken[y][x];
  const rects: FreeRect[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!free(y, x)) continue;
      let w = 1;
      while (x + w < cols && free(y, x + w)) w++;
      let h = 1;
      while (
        y + h < rows &&
        Array.from({ length: w }, (_, k) => free(y + h, x + k)).every(Boolean)
      ) {
        h++;
      }
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) taken[y + dy][x + dx] = true;
      }
      rects.push({ x, y, w, h });
    }
  }
  return rects;
}

/**
 * Place a widget of `size` at the clicked cell. The clicked position is the
 * top-left corner; the size is clamped to the grid width and shifted left when
 * it would hang over the right edge, so a wide widget dropped into a narrow gap
 * still lands somewhere sensible (vertical compaction sorts out the rest).
 */
export function placeAt(
  cell: { x: number; y: number },
  size: { w: number; h: number },
  cols = DASHBOARD_COLS,
): { x: number; y: number; w: number; h: number } {
  const w = Math.min(size.w, cols);
  return {
    w,
    h: size.h,
    x: Math.max(0, Math.min(cell.x, cols - w)),
    y: Math.max(0, cell.y),
  };
}
