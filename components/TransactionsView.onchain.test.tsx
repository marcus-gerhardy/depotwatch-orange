/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import TransactionsView from "./TransactionsView";

const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
const ADDRESS = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

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
              id: "out1",
              type: "transfer_out",
              date: "2024-02-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: null,
              totalFiatEur: null,
              txid: TXID,
              address: ADDRESS,
              note: "",
            },
            {
              id: "buy1",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: "40000",
              totalFiatEur: "40000",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

/** Turn on both on-chain columns via the column picker. */
function showOnChainColumns() {
  fireEvent.click(screen.getByRole("button", { name: "tx.columns" }));
  fireEvent.click(screen.getByLabelText("tx.txid"));
  fireEvent.click(screen.getByLabelText("tx.address"));
  fireEvent.click(document.body); // close the menu
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: seedPortfolio(),
    fileMode: "fallback",
    privacyMode: false,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TransactionsView: on-chain columns", () => {
  it("shows txid and address truncated, with the full value available", () => {
    render(<TransactionsView />);
    showOnChainColumns();

    // 8 leading + 8 trailing characters.
    expect(screen.getByText("4a5e1e4b…fdeda33b")).toBeTruthy();
    expect(screen.getByText("bc1qw508…7kv8f3t4")).toBeTruthy();

    // The full value is the tooltip label, rendered on hover only.
    fireEvent.mouseEnter(screen.getByText("4a5e1e4b…fdeda33b"));
    expect(document.body.textContent).toContain(TXID);
  });

  it("leaves the cells empty for non-transfer rows", () => {
    render(<TransactionsView />);
    showOnChainColumns();

    const headers = screen.getAllByRole("columnheader");
    const txidIndex = headers.findIndex((h) => h.textContent?.startsWith("tx.txid"));
    const buyRow = screen.getAllByRole("img", { name: "tx.types.buy" })[0].closest("tr")!;
    expect(within(buyRow).getAllByRole("cell")[txidIndex].textContent).toBe("—");
  });

  it("copies the full value to the clipboard without opening the row", () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<TransactionsView />);
    showOnChainColumns();

    fireEvent.click(screen.getAllByLabelText("tx.copyValue")[0]);

    expect(writeText).toHaveBeenCalledWith(TXID);
    // The edit modal must not have opened (row click was stopped).
    expect(screen.queryByText("tx.onChainSection")).toBeNull();
  });

  it("links to the configured explorer without fetching anything", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<TransactionsView />);
    showOnChainColumns();

    const links = screen.getAllByRole("link", { name: "tx.openInExplorer" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      `https://mempool.space/tx/${TXID}`,
      `https://mempool.space/address/${ADDRESS}`,
    ]);
    expect(links[0].getAttribute("rel")).toContain("noopener");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
