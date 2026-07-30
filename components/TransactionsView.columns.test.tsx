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
              note: "some note",
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

describe("TransactionsView: column layout changes", () => {
  it("hides the note column and — while the tax features are off — the tax-status column", () => {
    render(<TransactionsView />);
    expect(screen.queryByText("tx.note")).toBeNull();
    expect(screen.queryByText("tx.taxStatus")).toBeNull();
    expect(screen.queryByText("some note")).toBeNull();
  });

  it("offers neither a note nor a tax-status option in the column picker", () => {
    render(<TransactionsView />);
    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    expect(screen.queryByText("tx.note")).toBeNull();
    expect(screen.queryByText("tx.taxStatus")).toBeNull();
  });

  it("does not offer the tax-free filter while the tax features are off", () => {
    render(<TransactionsView />);
    expect(screen.queryByText("tx.onlyTaxFree")).toBeNull();
  });

  it("hides the on-chain columns by default but offers them in the picker", () => {
    render(<TransactionsView />);
    expect(screen.queryByText("tx.txid")).toBeNull();
    expect(screen.queryByText("tx.address")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    expect(screen.getByText("tx.txid")).toBeTruthy();
    expect(screen.getByText("tx.address")).toBeTruthy();
  });

  it("does not insert/remove the action-bar spacer when a selection starts (no layout jump)", () => {
    render(<TransactionsView />);
    const spacerCountBefore = document.querySelectorAll(".h-16[aria-hidden]").length;
    expect(spacerCountBefore).toBe(1);

    fireEvent.click(screen.getByLabelText("tx.selectRow"));

    const spacerCountAfter = document.querySelectorAll(".h-16[aria-hidden]").length;
    expect(spacerCountAfter).toBe(1);
  });

  it("renders the select-row control as a checkbox styled like a toggle switch", () => {
    render(<TransactionsView />);
    const input = screen.getByLabelText("tx.selectRow") as HTMLInputElement;
    expect(input.type).toBe("checkbox");
    expect(input.className).toContain("sr-only");
    const track = input.closest("label")!;
    expect(track.className).toContain("rounded-full");

    expect(input.checked).toBe(false);
    fireEvent.click(input);
    expect(input.checked).toBe(true);
  });
});

describe("TransactionsView: value formatting", () => {
  it("shows BTC with 8 decimals and fiat without a currency symbol", () => {
    render(<TransactionsView />);

    // The seeded buy is 0.5 BTC at 40 000 EUR.
    expect(screen.getByText("0,50000000")).toBeTruthy();
    expect(screen.getByText("40.000,00")).toBeTruthy();
    expect(screen.getByText("20.000,00")).toBeTruthy();
    // The column headers name the currency, so no symbol in the cells.
    expect(document.body.textContent).not.toContain("€");
  });
});
