/** @vitest-environment jsdom */
// The classic calendar strip: a year of days, weeks as columns. It has to say
// what one square is, label the months across and the weekdays down, and
// report the day under the pointer in full.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type Transaction } from "@/lib/types";
import { clearMarketDataCache } from "@/lib/marketData";
import Dashboard from "./Dashboard";

const buy = (date: string, amountBtc: string, price: string): Transaction => ({
  id: `b-${date}-${amountBtc}`,
  type: "buy",
  date,
  amountBtc,
  pricePerBtcEur: price,
  totalFiatEur: null,
  note: "",
});

/** A local date at noon, so no timezone can move it to another day. */
const localNoon = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 12, 0, 0).toISOString();

function load(transactions: Transaction[]) {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  p.uiSettings = {
    dashboardLayout: [
      { i: "buyHeatmap-1", widgetId: "buyHeatmap", x: 0, y: 0, w: 6, h: 6 },
    ],
  };
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false });
}

/**
 * Day squares that carry a buy: filled with the accent rather than the
 * surface. The legend swatches are filled the same way, so they are told apart
 * by their size class — the legend is not part of the grid.
 */
const filledCells = () =>
  [...document.querySelectorAll("span.rounded-\\[2px\\]")].filter(
    (el) =>
      (el as HTMLElement).style.background.includes("color-mix") &&
      el.parentElement?.className.includes("flex-col"),
  );

beforeEach(() => {
  clearMarketDataCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "0", json: async () => [] })),
  );
  // A fixed "today" so the window is the same on every run.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 11, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("buy heatmap", () => {
  it("says which time unit one square stands for", () => {
    load([buy(localNoon(2026, 3, 2), "0.01", "50000")]);
    render(<Dashboard />);

    expect(screen.getByText(/heatmapCell/)).toBeTruthy();
  });

  it("labels the columns with the months they cover", () => {
    load([buy(localNoon(2026, 3, 2), "0.01", "50000")]);
    render(<Dashboard />);

    // Locale month abbreviations across the top of the strip.
    for (const label of ["Sep", "Dez", "Jan", "Aug"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("labels the rows with weekdays", () => {
    load([buy(localNoon(2026, 3, 2), "0.01", "50000")]);
    render(<Dashboard />);

    // Monday, Wednesday, Friday — the three that fit at this cell size.
    for (const label of ["Mo", "Mi", "Fr"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("reports the day under the pointer: count, amount and price paid", () => {
    load([
      buy(localNoon(2026, 3, 2), "0.01", "50000"),
      buy(localNoon(2026, 3, 2), "0.03", "60000"),
    ]);
    render(<Dashboard />);

    // Before hovering, the tile carries the period's summary.
    expect(screen.getByText(/heatmapFooter/)).toBeTruthy();

    const busy = filledCells();
    expect(busy).toHaveLength(1);
    fireEvent.mouseEnter(busy[0]);

    expect(screen.getByText(/heatmapBuys/)).toBeTruthy();
    // 0.01 × 50 000 + 0.03 × 60 000 = 2 300 (which the headline shows too, as
    // the period's total), over 0.04 BTC gross = 57 500 per BTC.
    expect(screen.getAllByText(/2\.300,00/).length).toBeGreaterThan(1);
    expect(screen.getByText(/0,04000000/)).toBeTruthy();
    expect(screen.getByText(/57\.500,00/)).toBeTruthy();
  });
});
