/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, cleanup, fireEvent, act } from "@testing-library/react";
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
              id: "buy-full",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: "40000",
              totalFiatEur: null,
              note: "",
            },
            {
              id: "buy-partial",
              type: "buy",
              date: "2024-02-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: "40000",
              totalFiatEur: null,
              note: "",
            },
            {
              id: "transfer-out-full",
              type: "transfer_out",
              date: "2024-06-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: null,
              totalFiatEur: null,
              lotAllocations: [{ lotTransactionId: "buy-full", amountBtc: "0.5" }],
              counterpartyAccountId: "acctB",
              transferGroupId: "g1",
              note: "",
            },
            {
              id: "transfer-out-partial",
              type: "transfer_out",
              date: "2024-06-15T00:00:00.000Z",
              amountBtc: "0.2",
              pricePerBtcEur: null,
              totalFiatEur: null,
              lotAllocations: [{ lotTransactionId: "buy-partial", amountBtc: "0.2" }],
              counterpartyAccountId: "acctB",
              transferGroupId: "g2",
              note: "",
            },
          ],
        },
      ],
    },
    {
      id: "walletB",
      name: "Hardware wallet",
      type: "hardware",
      accounts: [
        {
          id: "acctB",
          name: "Cold",
          transactions: [
            {
              id: "transfer-in-full",
              type: "transfer_in",
              date: "2024-06-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: null,
              totalFiatEur: null,
              counterpartyAccountId: "acctA",
              transferGroupId: "g1",
              note: "",
            },
            {
              id: "transfer-in-partial",
              type: "transfer_in",
              date: "2024-06-15T00:00:00.000Z",
              amountBtc: "0.2",
              pricePerBtcEur: null,
              totalFiatEur: null,
              counterpartyAccountId: "acctA",
              transferGroupId: "g2",
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

describe("TransactionsView: fully-transferred lots fade + popover", () => {
  it("fades the fully-transferred buy row and shows the transfer target/amount in the popover on icon hover", () => {
    render(<TransactionsView />);

    const buyFullIcon = screen.getAllByRole("img", { name: "tx.types.buy" })[1]; // sorted desc by date: buy-partial (Feb) first, buy-full (Jan) second
    const row = buyFullIcon.closest("tr")!;
    expect(row.className).toContain("opacity-45");

    // The popover itself is portaled to document.body (so an ancestor's CSS
    // opacity on the faded row can't wash it out) and only mounts on hover
    // over the forward icon next to the wallet/account cell — fixed there,
    // not tied to the cursor.
    const forwardIcon = within(row).getByRole("img", { name: "tx.transferredAway" });
    fireEvent.mouseEnter(forwardIcon);
    expect(document.body.textContent).toContain("Hardware wallet");
    expect(document.body.textContent).toContain("Cold");
  });

  it("puts the transfer icon in the wallet/account cell, exactly once per row", () => {
    render(<TransactionsView />);

    const headers = screen.getAllByRole("columnheader");
    // Sortable headers carry a direction arrow (a placeholder when inactive),
    // so the label is matched as a prefix.
    const walletIndex = headers.findIndex((h) =>
      h.textContent?.trim().startsWith("tx.wallet / tx.account"),
    );

    const buyFullIcon = screen.getAllByRole("img", { name: "tx.types.buy" })[1];
    const row = buyFullIcon.closest("tr")!;
    expect(within(row).getAllByRole("img", { name: "tx.transferredAway" })).toHaveLength(1);
    const walletCell = within(row).getAllByRole("cell")[walletIndex];
    expect(
      within(walletCell).getByRole("img", { name: "tx.transferredAway" }),
    ).toBeTruthy();
  });

  it("does not fade a partially-transferred buy row and shows no forward icon", () => {
    render(<TransactionsView />);

    const buyPartialIcon = screen.getAllByRole("img", { name: "tx.types.buy" })[0];
    const row = buyPartialIcon.closest("tr")!;
    expect(row.className).not.toContain("opacity-45");
    expect(within(row).queryByRole("img", { name: "tx.transferredAway" })).toBeNull();
  });

  it("keeps the popover open while the pointer moves onto it, and closes it after the delay otherwise", () => {
    vi.useFakeTimers();
    try {
      render(<TransactionsView />);
      const buyFullIcon = screen.getAllByRole("img", { name: "tx.types.buy" })[1];
      const row = buyFullIcon.closest("tr")!;
      const forwardIcon = within(row).getByRole("img", { name: "tx.transferredAway" });

      fireEvent.mouseEnter(forwardIcon);
      expect(document.body.textContent).toContain("Hardware wallet");

      // Leaving the icon starts the close timer, but entering the popover
      // itself before it fires must cancel it (hover-bridging).
      fireEvent.mouseLeave(forwardIcon);
      const popover = screen.getByText("tx.transferredTarget").closest("div")!;
      fireEvent.mouseEnter(popover);
      act(() => vi.advanceTimersByTime(1000));
      expect(document.body.textContent).toContain("Hardware wallet");

      // Leaving the popover with nowhere else to go does close it, after the delay.
      fireEvent.mouseLeave(popover);
      act(() => vi.advanceTimersByTime(1000));
      expect(document.body.textContent).not.toContain("tx.transferredTarget");
    } finally {
      vi.useRealTimers();
    }
  });
});
