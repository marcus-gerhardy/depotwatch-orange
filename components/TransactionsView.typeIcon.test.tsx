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
      name: "Kraken",
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

describe("TransactionsView: type column icon + tooltip", () => {
  it("shows an icon instead of the text label, with the label available on hover", () => {
    render(<TransactionsView />);

    const icon = screen.getByRole("img", { name: "tx.types.buy" });
    const typeCell = icon.closest("td")!;
    // The full label text is not rendered directly in the cell...
    expect(typeCell.textContent).not.toContain("tx.types.buy");

    // The type filter dropdown already has one "tx.types.buy" text node
    // (its option); a portaled tooltip on hover adds a second, then removes
    // it again on mouseleave.
    expect(screen.getAllByText("tx.types.buy")).toHaveLength(1);
    fireEvent.mouseEnter(icon);
    expect(screen.getAllByText("tx.types.buy")).toHaveLength(2);
    fireEvent.mouseLeave(icon);
    expect(screen.getAllByText("tx.types.buy")).toHaveLength(1);
  });
});
