/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import Dashboard from "./Dashboard";

const PRICE = 100_000;

function portfolioWith(transactions: Transaction[]): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "21bitcoin",
      type: "exchange",
      accounts: [{ id: "a1", name: "Main", transactions }],
    },
  ];
  return p;
}

function load(transactions: Transaction[]) {
  useAppStore.setState({ portfolio: portfolioWith(transactions), privacyMode: false });
}

const tx = (
  type: Transaction["type"],
  date: string,
  amountBtc: string,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `${type}-${date}-${amountBtc}`,
  type,
  date,
  amountBtc,
  pricePerBtcEur: "50000",
  totalFiatEur: null,
  note: "",
  ...extra,
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("ticker/price") ? { price: String(PRICE) } : [],
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dashboard: BTC holding", () => {
  it("shows buys + transfer_ins − sells − transfer_outs − spends", async () => {
    // Every disposal assigned, so the engine and the ledger agree and no gap
    // is reported (the app never assigns lots by itself, §3.2).
    const buy = tx("buy", "2026-01-01T00:00:00Z", "1");
    const received = tx("transfer_in", "2026-01-02T00:00:00Z", "0.5");
    const from = (id: string, amountBtc: string) => ({
      lotAllocations: [{ lotTransactionId: id, amountBtc }],
    });
    load([
      buy,
      received,
      tx("sell", "2026-01-03T00:00:00Z", "0.2", from(buy.id, "0.2")),
      tx("transfer_out", "2026-01-04T00:00:00Z", "0.3", from(buy.id, "0.3")),
      tx("spend", "2026-01-05T00:00:00Z", "0.1", from(received.id, "0.1")),
    ]);

    render(<Dashboard />);

    expect(await screen.findByText("0,90000000 BTC")).toBeTruthy();
    expect(screen.queryByText(/uncoveredHint/)).toBeNull();
  });

  it("regression: a sell without a covering buy no longer inflates the holding", () => {
    // The sold coins were bought before the imported period — the FIFO engine
    // cannot consume a lot for them, which used to leave the headline at 1 BTC
    // while the wallet breakdown below showed 0.7.
    load([
      tx("sell", "2026-02-01T00:00:00Z", "0.3"),
      tx("buy", "2026-03-01T00:00:00Z", "1"),
    ]);

    render(<Dashboard />);

    expect(screen.getByText("0,70000000 BTC")).toBeTruthy();
    // The wallet breakdown must agree with the headline.
    expect(screen.getAllByText("0,70000000").length).toBeGreaterThan(0);
    expect(screen.getByText(/uncoveredHint/)).toBeTruthy();
  });

  it("warns about a negative holding", () => {
    load([
      tx("buy", "2026-01-01T00:00:00Z", "0.5"),
      tx("sell", "2026-02-01T00:00:00Z", "0.8"),
    ]);

    render(<Dashboard />);

    expect(screen.getByText("-0,30000000 BTC")).toBeTruthy();
    expect(screen.getByText(/negativeBalanceHint/)).toBeTruthy();
  });
});
