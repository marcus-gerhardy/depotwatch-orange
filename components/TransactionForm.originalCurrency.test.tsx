/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "@/lib/types";
import TransactionForm from "./TransactionForm";

function seedPortfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "walletA",
      name: "Exchange 2",
      type: "exchange",
      accounts: [{ id: "acctA", name: "Spot", transactions: [] }],
    },
  ];
  return p;
}

const txs = () => flattenLedger(useAppStore.getState().portfolio!.wallets);

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const save = () => fireEvent.click(screen.getByRole("button", { name: "common.save" }));

beforeEach(() => {
  useAppStore.setState({ portfolio: seedPortfolio(), dirty: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TransactionForm: settled in another currency", () => {
  it("keeps the section collapsed until it is opened", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    expect(screen.queryByLabelText("tx.originalCurrency")).toBeNull();
    fireEvent.click(screen.getByText("tx.originalSection"));
    expect(screen.getByLabelText("tx.originalCurrency")).toBeTruthy();
    expect(screen.getByText("tx.originalHint")).toBeTruthy();
  });

  it("stores the documentary fields without touching the EUR figures", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fill("tx.amountBtc", "0.1");
    fill("tx.priceEur", "30000");
    fireEvent.click(screen.getByText("tx.originalSection"));
    fill("tx.originalCurrency", " usdt ");
    fill("tx.originalAmount", "3200");
    fill("tx.originalPrice", "32000");
    save();

    const tx = txs()[0];
    expect(tx.originalCurrency).toBe("USDT");
    expect(tx.originalAmount).toBe("3200.00");
    expect(tx.originalPricePerBtc).toBe("32000.00");
    // EUR stays the valuation currency for every calculation.
    expect(tx.pricePerBtcEur).toBe("30000.00");
    expect(tx.totalFiatEur).toBe("3000.00");
    expect(tx.eurValuationSource).toBeUndefined();
  });

  it("fills the EUR value from the historical close and records the source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [[1704412800000, "0", "0", "0", "42000.00"]],
      })),
    );
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fill("tx.date", "2024-01-05T12:00");
    fill("tx.amountBtc", "0.5");
    fireEvent.click(screen.getByRole("button", { name: "tx.eurValuationRun" }));

    await waitFor(() =>
      expect(screen.getByText("tx.eurValuationDerived")).toBeTruthy(),
    );
    save();

    const tx = txs()[0];
    expect(tx.pricePerBtcEur).toBe("42000.00");
    expect(tx.totalFiatEur).toBe("21000.00");
    expect(tx.eurValuationSource).toBe("binance-klines");
  });

  it("marks the value as manual again when it is edited by hand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [[1704412800000, "0", "0", "0", "42000.00"]],
      })),
    );
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fill("tx.date", "2024-01-05T12:00");
    fill("tx.amountBtc", "0.5");
    fireEvent.click(screen.getByRole("button", { name: "tx.eurValuationRun" }));
    await waitFor(() =>
      expect(screen.getByText("tx.eurValuationDerived")).toBeTruthy(),
    );

    fill("tx.priceEur", "41000");
    expect(screen.queryByText("tx.eurValuationDerived")).toBeNull();
    save();

    expect(txs()[0].eurValuationSource).toBeUndefined();
  });

  it("reports when no price is available for that day", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fill("tx.amountBtc", "0.5");
    fireEvent.click(screen.getByRole("button", { name: "tx.eurValuationRun" }));

    await waitFor(() =>
      expect(screen.getByText("tx.eurValuationUnavailable")).toBeTruthy(),
    );
  });
});
