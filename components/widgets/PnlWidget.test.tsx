/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type Transaction } from "@/lib/types";
import { computeFifo } from "@/lib/fifo";
import { flattenLedger } from "@/lib/types";
import { clearMarketDataCache } from "@/lib/marketData";
import Dashboard from "./../Dashboard";

const PRICE = 40_000;

function load(transactions: Transaction[]) {
  const p = emptyPortfolio();
  p.uiSettings = {
    dashboardLayout: [{ i: "pnl-1", widgetId: "pnl", x: 0, y: 0, w: 4, h: 4 }],
  };
  p.wallets = [
    {
      id: "w1",
      name: "Kraken",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false });
  return p;
}

const tx = (t: Partial<Transaction> & Pick<Transaction, "type" | "id">): Transaction => ({
  date: "2026-01-01T00:00:00Z",
  amountBtc: "1",
  pricePerBtcEur: null,
  totalFiatEur: null,
  note: "",
  ...t,
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

describe("unrealized P/L", () => {
  it("reports a loss when the price is below the average cost, even with unpriced coins", async () => {
    // 1 BTC bought at 50 000 plus 1 BTC received from outside without a price.
    // The cost basis (50 000) only covers the first BTC; valuing both against
    // it used to report +30 000 "profit" at a price of 40 000, i.e. a gain
    // while the price sits 10 000 below the average cost.
    load([
      tx({ id: "b1", type: "buy", pricePerBtcEur: "50000", totalFiatEur: "50000" }),
      tx({ id: "in1", type: "transfer_in", date: "2026-02-01T00:00:00Z" }),
    ]);

    render(<Dashboard />);

    // 1 BTC × 40 000 − 50 000 = −10 000, not +30 000.
    expect(await screen.findByText("-10.000,00 €")).toBeTruthy();
    expect(screen.queryByText("30.000,00 €")).toBeNull();
    // The BTC left out of the figure is named rather than silently valued.
    expect(screen.getByText(/pnlWithoutBasisHint/)).toBeTruthy();
  });

  it("has no hint and covers the whole holding when every lot has a price", async () => {
    load([
      tx({ id: "b1", type: "buy", pricePerBtcEur: "50000", totalFiatEur: "50000" }),
      tx({
        id: "b2",
        type: "buy",
        date: "2026-02-01T00:00:00Z",
        pricePerBtcEur: "30000",
        totalFiatEur: "30000",
      }),
    ]);

    render(<Dashboard />);

    // 2 BTC × 40 000 − 80 000 = 0. The widget also lists realized and
    // tax-free gains, which are 0 here too, hence "all".
    expect((await screen.findAllByText("0,00 €")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/pnlWithoutBasisHint/)).toBeNull();
  });
});

describe("computeFifo: openBasisBtc", () => {
  it("counts only the open lots the cost basis actually covers", () => {
    const p = load([
      tx({ id: "b1", type: "buy", pricePerBtcEur: "50000", totalFiatEur: "50000" }),
      tx({ id: "in1", type: "transfer_in", date: "2026-02-01T00:00:00Z" }),
    ]);
    const fifo = computeFifo(flattenLedger(p.wallets), 365);

    expect(fifo.openLotsBtc.toString()).toBe("2");
    expect(fifo.openBasisBtc.toString()).toBe("1");
    expect(fifo.openCostBasisEur.toString()).toBe("50000");
    // The average cost stays the average of what has a basis, unchanged.
    expect(fifo.avgCostPerBtcEur?.toString()).toBe("50000");
  });
});
