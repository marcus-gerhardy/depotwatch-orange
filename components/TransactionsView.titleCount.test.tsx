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
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "acctA",
          name: "Spot",
          transactions: [
            {
              id: "buy1",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: "40000",
              totalFiatEur: null,
              note: "",
            },
            {
              id: "spend1",
              type: "spend",
              date: "2024-02-01T00:00:00.000Z",
              amountBtc: "0.1",
              pricePerBtcEur: null,
              totalFiatEur: null,
              lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.1" }],
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: seedPortfolio(),
    fileMode: "fallback",
    fileHandle: null,
    fileName: "test.dwp",
    password: null,
    encryptionEnabled: false,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    needsFileSetup: false,
    privacyMode: false,
  });
});

afterEach(cleanup);

describe("TransactionsView: title shows transaction count once filtered", () => {
  it("shows just the title, with no count, while unfiltered", () => {
    render(<TransactionsView />);
    expect(screen.getByRole("heading").textContent).toBe("tx.title");
  });

  it("appends '<filtered> of <total>' to the title once a filter narrows the list", () => {
    render(<TransactionsView />);

    const typeSelect = screen.getAllByRole("combobox")[2];
    fireEvent.change(typeSelect, { target: { value: "spend" } });

    expect(screen.getByRole("heading").textContent).toBe("tx.title · tx.titleCount");
  });

  it("drops the count again once the filter is cleared", () => {
    render(<TransactionsView />);

    const typeSelect = screen.getAllByRole("combobox")[2];
    fireEvent.change(typeSelect, { target: { value: "spend" } });
    fireEvent.change(typeSelect, { target: { value: "" } });

    expect(screen.getByRole("heading").textContent).toBe("tx.title");
  });
});
