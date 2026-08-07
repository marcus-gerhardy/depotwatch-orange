/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import TransactionsView from "./TransactionsView";

function seedPortfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "walletA",
      name: "Bitget",
      type: "exchange",
      accounts: [
        {
          id: "acctA",
          name: "Spot",
          transactions: [
            {
              id: "buy1",
              type: "buy",
              date: "2024-01-05T12:00:00.000Z",
              amountBtc: "0.1",
              pricePerBtcEur: "30000",
              totalFiatEur: "3000",
              feeBtc: "0.00001",
              originalCurrency: "USDT",
              originalAmount: "3200",
              originalPricePerBtc: "32000",
              eurValuationSource: "binance-klines",
              note: "",
            },
            {
              id: "buy2",
              type: "buy",
              date: "2024-02-05T12:00:00.000Z",
              amountBtc: "0.2",
              pricePerBtcEur: "40000",
              totalFiatEur: "8000",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

/** Header labels without the sort-direction arrow every sortable one carries. */
const headers = () =>
  [...document.querySelectorAll("thead th")].map((th) =>
    th.textContent?.trim().replace(/[↑↓]$/, ""),
  );

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ portfolio: seedPortfolio(), privacyMode: false });
});

afterEach(cleanup);

describe("TransactionsView: opt-in columns", () => {
  it("keeps the BTC fee column hidden until it is switched on", () => {
    render(<TransactionsView />);

    expect(headers().some((h) => h?.startsWith("tx.feeBtc"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    fireEvent.click(screen.getByLabelText("tx.feeBtc"));

    // Right after the amount column, and empty where no BTC fee was recorded.
    const shown = headers();
    expect(shown.indexOf("tx.feeBtc")).toBe(shown.indexOf("tx.amountBtc") + 1);
    expect(screen.getByText("0,00001000")).toBeTruthy();
  });
});

describe("TransactionsView: original currency column", () => {
  it("is hidden by default and can be switched on", () => {
    render(<TransactionsView />);

    expect(headers().some((h) => h?.startsWith("tx.originalCurrency"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    fireEvent.click(screen.getByLabelText("tx.originalCurrency"));

    expect(headers().some((h) => h?.startsWith("tx.originalCurrency"))).toBe(true);
    // Amount plus code for the row that has one, a dash for the row that has not.
    expect(screen.getByText("3.200,00 USDT")).toBeTruthy();
  });

  it("marks an EUR value that was derived from the historical price", () => {
    render(<TransactionsView />);

    const marks = screen.getAllByText("≈");
    expect(marks).toHaveLength(1);
    expect(
      marks[0].closest("tr")?.textContent?.includes("3.000,00"),
    ).toBe(true);
  });
});
