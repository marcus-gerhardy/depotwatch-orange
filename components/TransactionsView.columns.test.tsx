/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import TransactionsView, { colCls, type ColumnKey } from "./TransactionsView";

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
  it("hides the note column but shows the tax-status column", () => {
    render(<TransactionsView />);
    expect(screen.queryByText("tx.note")).toBeNull();
    expect(screen.queryByText("some note")).toBeNull();
    // The tax features are on, so the status column is part of the default set.
    expect(screen.getAllByText("tx.taxStatus").length).toBeGreaterThan(0);
  });

  it("offers no note option in the column picker, but the tax-status one", () => {
    render(<TransactionsView />);
    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    expect(screen.queryByText("tx.note")).toBeNull();
    // Header and picker entry, hence "all".
    expect(screen.getAllByText("tx.taxStatus").length).toBeGreaterThan(1);
  });

  it("offers the tax-free filter", () => {
    render(<TransactionsView />);
    expect(screen.getByText("tx.onlyTaxFree")).toBeTruthy();
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

describe("TransactionsView: column persistence", () => {
  it("takes the visible columns from the portfolio file", () => {
    const p = seedPortfolio();
    p.uiSettings = { transactionColumns: ["date", "amount", "txid"] };
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);
    expect(screen.getByText("tx.txid")).toBeTruthy();
    expect(screen.queryByText("tx.price")).toBeNull();
  });

  it("adopts a choice an older app version left in localStorage", () => {
    localStorage.setItem(
      "depotwatch.txColumns.v6",
      JSON.stringify(["date", "amount", "address"]),
    );
    render(<TransactionsView />);
    expect(screen.getByText("tx.address")).toBeTruthy();
    expect(screen.queryByText("tx.price")).toBeNull();
    // Adopting a device leftover must not mark the file as changed.
    expect(useAppStore.getState().dirty).toBe(false);
  });

  it("writes the choice back once, when the picker closes", () => {
    render(<TransactionsView />);
    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));

    fireEvent.click(screen.getByLabelText("tx.txid"));
    fireEvent.click(screen.getByLabelText("tx.address"));
    // Two clicks, still nothing written.
    expect(useAppStore.getState().portfolio?.uiSettings).toBeUndefined();
    expect(useAppStore.getState().dirty).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    const stored = useAppStore.getState().portfolio?.uiSettings?.transactionColumns;
    expect(stored).toContain("txid");
    expect(stored).toContain("address");
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it("leaves the file untouched when the picker is opened and closed again", () => {
    const { unmount } = render(<TransactionsView />);
    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
    unmount();
    expect(useAppStore.getState().dirty).toBe(false);
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

describe("TransactionsView: what a phone shows of a row", () => {
  // The columns are the user's choice (CLAUDE.md §3.5), but a screen 390 px
  // wide fits four of them, not eleven — so the table hides the rest below a
  // breakpoint rather than scrolling sideways behind a letterbox. Which four
  // survive is the decision worth pinning: they identify a row (when, what)
  // and say what it did (how much, what it was worth). The rest can wait for
  // a wider screen, because tapping the row opens the transaction with every
  // field in it.
  it("keeps the columns that say what a row is", () => {
    for (const key of ["date", "type", "amount", "value"] as ColumnKey[]) {
      expect(colCls(key), key).toBe("");
    }
  });

  it("defers the rest to a screen with room for them", () => {
    const deferred: ColumnKey[] = [
      "taxStatus",
      "walletAccount",
      "feeBtc",
      "price",
      "originalCurrency",
      "txid",
      "address",
    ];
    for (const key of deferred) {
      // Hidden first, then brought back at a named breakpoint — never hidden
      // outright, which would make the column picker a lie.
      expect(colCls(key), key).toMatch(/^hidden (sm|md|lg):table-cell$/);
    }
  });
});
