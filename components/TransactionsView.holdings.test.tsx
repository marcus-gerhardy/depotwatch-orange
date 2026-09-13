/** @vitest-environment jsdom */
// The summary above the transaction table (§4 of the holdings feature).
//
// The rule worth pinning: a holding belongs to a place. While the filters
// select one (a wallet, one of its accounts, or nothing at all), the summary
// states that holding. The moment a filter selects *transactions* instead — a
// type, a data-quality issue, a period — there is no balance to state, and the
// bar has to fall back to the sums of the rows on screen and say so.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import TransactionsView from "./TransactionsView";

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  useAppStore.setState({
    portfolio: seed(),
    readOnly: false,
    dirty: false,
    fileName: "t.dwp",
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function seed(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wEx",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "aSpot",
          name: "Spot",
          transactions: [
            {
              id: "buy1",
              type: "buy",
              date: "2021-03-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: "40000",
              note: "",
            },
            {
              id: "buy2",
              type: "buy",
              date: "2021-06-01T00:00:00.000Z",
              amountBtc: "0.25",
              pricePerBtcEur: "30000",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

/** wallet, account, type, issue — the order the filter row renders them in. */
const TYPE_FILTER = 2;

describe("the summary above the table", () => {
  it("states the whole portfolio's holding when nothing is filtered", () => {
    render(<TransactionsView />);
    expect(screen.getByText("holdings.summaryAll")).toBeTruthy();
    // 0.5 + 0.25, from the ledger.
    expect(screen.getAllByText("0,75000000").length).toBeGreaterThan(0);
  });

  it("names the wallet once the filter is a scope", () => {
    render(<TransactionsView initialFilter={{ walletId: "wEx" }} />);
    expect(screen.getByText(/holdings.summaryScope/)).toBeTruthy();
  });

  it("falls back to the row totals for a filter that is not a place", () => {
    render(<TransactionsView />);
    fireEvent.change(screen.getAllByRole("combobox")[TYPE_FILTER], {
      target: { value: "buy" },
    });

    // No holding is claimed for "all buys" — the sums of the rows are shown,
    // and the bar says that is what they are.
    expect(screen.queryByText("holdings.summaryAll")).toBeNull();
    expect(screen.getByText("holdings.summaryRows")).toBeTruthy();
    expect(screen.getByText("holdings.summaryRowsHint")).toBeTruthy();
  });

  it("still has a holding while only the account narrows it", () => {
    render(<TransactionsView initialFilter={{ walletId: "wEx", accountId: "aSpot" }} />);
    expect(screen.queryByText("holdings.summaryRows")).toBeNull();
    expect(screen.getByText(/holdings.summaryScope/)).toBeTruthy();
  });
});
