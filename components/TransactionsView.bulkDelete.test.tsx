/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
              totalFiatEur: "20000",
              note: "",
            },
            {
              id: "buy2",
              type: "buy",
              date: "2024-02-01T00:00:00.000Z",
              amountBtc: "0.25",
              pricePerBtcEur: "42000",
              totalFiatEur: "10500",
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

describe("TransactionsView: bulk delete", () => {
  it("removes all selected transactions from the store after confirming", () => {
    render(<TransactionsView />);

    const rowSwitches = screen.getAllByLabelText("tx.selectRow");
    expect(rowSwitches).toHaveLength(2);
    fireEvent.click(rowSwitches[0]);
    fireEvent.click(rowSwitches[1]);

    expect(screen.getByText("tx.selectedCount")).toBeTruthy();

    // The toolbar's bulk-delete button and the two per-row icon-only delete
    // buttons all share the accessible name "common.delete" (raw i18n key in
    // this no-provider test setup) — the toolbar one renders first in DOM
    // order since the toolbar sits above the table.
    const deleteButtons = screen.getAllByRole("button", { name: "common.delete" });
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText("tx.bulkDeleteConfirm")).toBeTruthy();

    const confirmButtons = screen.getAllByRole("button", { name: "common.delete" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    const remaining = useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions;
    expect(remaining).toHaveLength(0);
    expect(screen.queryByText("tx.selectedCount")).toBeNull();
  });

  it("only deletes the transactions that were selected, not the whole account", () => {
    render(<TransactionsView />);

    // Default sort is by date descending, so the first row is buy2
    // (2024-02-01), the second is buy1 (2024-01-01).
    const rowSwitches = screen.getAllByLabelText("tx.selectRow");
    fireEvent.click(rowSwitches[0]);

    const deleteButtons = screen.getAllByRole("button", { name: "common.delete" });
    fireEvent.click(deleteButtons[0]);

    const confirmButtons = screen.getAllByRole("button", { name: "common.delete" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    const remaining = useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("buy1");
  });
});
