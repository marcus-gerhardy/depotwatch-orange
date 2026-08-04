// Layout model for the configurable widget dashboard.
//
// Position, size and choice of widgets live in the portfolio file
// (`uiSettings.dashboardLayout`, CLAUDE.md §3.5), so the arrangement travels
// with the file rather than with the browser. Writing is deliberately not
// per drag: the dashboard buffers changes and commits them once when the user
// leaves edit mode, so one editing session costs one save (and, for an
// encrypted file, one re-encryption).

import type { DashboardWidgetPlacement, UiSettings } from "./types";
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
 * Default dashboard: the figures a portfolio owner looks at first (value, P/L,
 * price), the two charts, and the panels that explain where the number comes
 * from. Everything else is one click away in the widget picker.
 */
export function defaultDashboard(): WidgetPlacement[] {
  const at = (widgetId: string, x: number, y: number, w: number, h: number) => ({
    i: `${widgetId}-1`,
    widgetId,
    x,
    y,
    w,
    h,
  });
  return [
    at("portfolioValue", 0, 0, 4, 4),
    at("pnl", 4, 0, 4, 4),
    at("btcPrice", 8, 0, 4, 4),
    at("portfolioChart", 0, 4, 8, 8),
    at("satsStack", 8, 4, 4, 4),
    at("avgCost", 8, 8, 4, 4),
    at("priceEntries", 0, 12, 8, 8),
    at("custody", 8, 12, 4, 5),
    at("dataQuality", 8, 17, 4, 3),
    at("walletBreakdown", 0, 20, 6, 6),
    at("dca", 6, 20, 6, 6),
  ];
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
