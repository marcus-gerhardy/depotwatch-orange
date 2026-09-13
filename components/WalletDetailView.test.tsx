/** @vitest-environment jsdom */
// The wallet/account detail view (§2 of the holdings feature).
//
// What is worth pinning here is not the layout but the arithmetic reaching the
// screen: the quantity has to be the ledger's, the lots have to carry the
// resolved original purchase date rather than the day coins arrived, and an
// account has to show its own holding rather than its wallet's.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import WalletDetailView from "./WalletDetailView";

/** No network in a test: the spot price stays unavailable, which is a state. */
beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Two buys on the exchange, one of them swept into cold storage: the arrival
 * must keep the buy's date, not the transfer's.
 */
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
            {
              id: "out1",
              type: "transfer_out",
              date: "2022-01-15T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: null,
              counterpartyAccountId: "aVault",
              transferGroupId: "g1",
              lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.5" }],
              note: "",
            },
          ],
        },
        { id: "aSavings", name: "Savings", transactions: [] },
      ],
    },
    {
      id: "wCold",
      name: "Cold",
      type: "hardware",
      accounts: [
        {
          id: "aVault",
          name: "Vault",
          transactions: [
            {
              id: "in1",
              type: "transfer_in",
              date: "2022-01-15T01:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: null,
              counterpartyAccountId: "aSpot",
              transferGroupId: "g1",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

function load(p: PortfolioFile = seed()) {
  useAppStore.setState({ portfolio: p, readOnly: false, dirty: false, fileName: "t.dwp" });
}

const noop = () => {};

/** The table a section's header cell belongs to, so an assertion can be exact. */
function tableOf(headerKey: string) {
  return within(screen.getByText(headerKey).closest("table")!);
}

function show(walletId: string, accountId?: string) {
  return render(
    <WalletDetailView
      target={{ walletId, accountId }}
      onBack={noop}
      onOpenTarget={noop}
      onOpenTransactions={noop}
      onOpenWatchlist={noop}
    />,
  );
}

describe("the wallet detail view", () => {
  beforeEach(() => load());

  it("shows the wallet's own holding, not the portfolio's", () => {
    show("wCold");
    // 0.5 arrived in the vault; the 0.25 still on the exchange is not here.
    expect(screen.getAllByText("0,50000000").length).toBeGreaterThan(0);
    expect(screen.queryByText("0,75000000")).toBeNull();
  });

  it("dates a transferred lot by the original purchase, not by the arrival", () => {
    show("wCold");
    const lots = tableOf("holdings.lotsAcquired");
    // buy1 is from March 2021; the coins only arrived in January 2022, and the
    // arrival date belongs in the transaction list, never in the lot row.
    expect(lots.getByText("01.03.2021")).toBeTruthy();
    expect(lots.queryByText("15.01.2022")).toBeNull();
  });

  it("lists every account of the wallet, including the empty one", () => {
    show("wEx");
    const accounts = tableOf("holdings.txCount");
    expect(accounts.getByText("Spot")).toBeTruthy();
    expect(accounts.getByText("Savings")).toBeTruthy();
  });

  it("narrows to one account when one is chosen", () => {
    show("wEx", "aSavings");
    // An account with nothing in it says so rather than borrowing a figure.
    expect(screen.getAllByText("0,00000000").length).toBeGreaterThan(0);
    expect(screen.getByText("holdings.lotsEmpty")).toBeTruthy();
  });

  it("renames the account it is showing", () => {
    show("wEx", "aSpot");
    fireEvent.click(screen.getByRole("button", { name: "wallets.rename" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Trading" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const wallet = useAppStore.getState().portfolio!.wallets[0];
    expect(wallet.accounts[0].name).toBe("Trading");
  });

  it("adds an account to the wallet", () => {
    show("wEx");
    fireEvent.click(screen.getByRole("button", { name: /wallets.addAccount/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Earn" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(
      useAppStore.getState().portfolio!.wallets[0].accounts.map((a) => a.name),
    ).toContain("Earn");
  });

  it("keeps the addresses section out of the way while none are assigned", () => {
    show("wCold");
    expect(screen.getByText("holdings.addressesEmpty")).toBeTruthy();
    // Nothing to compare against, so no comparison is claimed.
    expect(screen.queryByText("holdings.onChainSection")).toBeNull();
  });

  it("reports an unassigned disposal as a gap instead of a smaller balance", () => {
    const p = seed();
    // The sweep loses its lot assignment: the ledger still knows 0.5 left the
    // exchange, the engine no longer knows which buy it closed.
    p.wallets[0].accounts[0].transactions[2].lotAllocations = [];
    load(p);
    show("wEx");

    // Ledger balance: 0.75 bought, 0.5 sent away.
    expect(screen.getAllByText("0,25000000").length).toBeGreaterThan(0);
    expect(screen.getByText(/holdings.unassignedGap/)).toBeTruthy();
  });
});

describe("the transactions section", () => {
  beforeEach(() => load());

  it("lists the account's latest entries", () => {
    show("wEx", "aSpot");
    const recent = screen.getByText("holdings.recentSection").closest("div")!;
    expect(within(recent.parentElement!).getByText("holdings.showTransactions →")).toBeTruthy();
    expect(screen.getByText("tx.types.transfer_out")).toBeTruthy();
  });
});
