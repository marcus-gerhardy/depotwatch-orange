/** @vitest-environment jsdom */
// A widget that shows a change writes no sign of its own — the formatter does
// (see `signDisplay` in lib/decimal.ts). The cost-basis widget used to prefix a
// "−" in front of a figure Intl had already signed, so a price below the
// average cost read "−-10.000,00 €".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type Transaction } from "@/lib/types";
import { clearMarketDataCache } from "@/lib/marketData";
import Dashboard from "./../Dashboard";

const PRICE = 40_000;

function load(widgetId: string, transactions: Transaction[]) {
  const p = emptyPortfolio();
  p.uiSettings = {
    dashboardLayout: [{ i: `${widgetId}-1`, widgetId, x: 0, y: 0, w: 4, h: 4 }],
  };
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false });
}

const buy = (price: string): Transaction => ({
  id: "b1",
  type: "buy",
  date: "2026-01-01T00:00:00Z",
  amountBtc: "1",
  pricePerBtcEur: price,
  totalFiatEur: price,
  note: "",
});

beforeEach(() => {
  clearMarketDataCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => "900000",
      json: async () => ({ price: String(PRICE) }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("avgCost widget: the distance to the current price", () => {
  it("signs a price below the average cost exactly once", async () => {
    // Bought at 50 000, price at 40 000 → the distance is −10 000.
    load("avgCost", [buy("50000")]);

    const { container } = render(<Dashboard />);

    expect(await screen.findByText(/-10\.000,00/)).toBeTruthy();
    // Whatever the glyphs, no figure may carry two of them.
    expect(container.textContent).not.toMatch(/[-−]\s*[-−]/);
  });

  it("marks a price above the average cost with a plus", async () => {
    load("avgCost", [buy("30000")]);

    const { container } = render(<Dashboard />);

    expect(await screen.findByText(/\+10\.000,00/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\+\s*\+/);
  });
});
