/** @vitest-environment jsdom */
// Undoing an import from the settings. The interesting case is the one where
// it must *not* simply go: a transaction an import wrote becomes an ordinary
// transaction, and a later sale may hold it as a lot.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import de from "@/lib/i18n/de";
import ImportBatches from "./ImportBatches";

const tx = (o: Partial<Transaction> & Pick<Transaction, "id">): Transaction => ({
  type: "buy",
  date: "2026-03-02T10:00:00.000Z",
  amountBtc: "0.5",
  pricePerBtcEur: "50000",
  totalFiatEur: "25000",
  note: "",
  ...o,
});

function load(transactions: Transaction[]): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  p.importBatches = [
    {
      id: "batch-1",
      importedAt: "2026-03-03T08:00:00.000Z",
      fileName: "exchange-2026.csv",
      fileHash: "abc",
      presetName: "Exchange",
      transactionCount: transactions.filter((t) => t.importBatchId).length,
      walletId: "w1",
      accountId: "a1",
    },
  ];
  useAppStore.setState({ portfolio: p, dirty: false });
  return p;
}

const view = () =>
  render(
    <I18nProvider locale="de">
      <ImportBatches />
    </I18nProvider>,
  );

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the imports list", () => {
  it("names the runs a file already carries", () => {
    load([tx({ id: "b1", importBatchId: "batch-1" })]);
    view();

    expect(screen.getByText("exchange-2026.csv")).toBeTruthy();
    expect(screen.getByText("Exchange")).toBeTruthy();
  });

  it("removes an import that nothing else depends on", () => {
    load([
      tx({ id: "b1", importBatchId: "batch-1" }),
      tx({ id: "b2", importBatchId: "batch-1" }),
      tx({ id: "manual" }),
    ]);
    view();

    fireEvent.click(screen.getByText(de.imports.undo));
    fireEvent.click(screen.getByText(de.imports.undoConfirm.replace("{count}", "2")));

    const p = useAppStore.getState().portfolio!;
    expect(p.wallets[0].accounts[0].transactions.map((t) => t.id)).toEqual(["manual"]);
    expect(p.importBatches).toBeUndefined();
  });

  it("warns instead of breaking a lot a later sale holds", () => {
    load([
      tx({ id: "imported-buy", importBatchId: "batch-1" }),
      tx({
        id: "later-sale",
        type: "sell",
        date: "2026-05-01T10:00:00.000Z",
        lotAllocations: [{ lotTransactionId: "imported-buy", amountBtc: "0.5" }],
      }),
    ]);
    view();

    fireEvent.click(screen.getByText(de.imports.undo));

    expect(screen.getByText(de.imports.blocked.allocatedByOther)).toBeTruthy();
    // Nothing may go, so the action is offered for zero transactions and off.
    const confirm = screen
      .getByText(de.imports.undoConfirm.replace("{count}", "0"))
      .closest("button") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    // …and the transaction is still there.
    expect(
      useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions,
    ).toHaveLength(2);
  });
});
