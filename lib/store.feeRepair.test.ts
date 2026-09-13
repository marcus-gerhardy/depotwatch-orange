/** @vitest-environment jsdom */
// The repair as the store runs it (§3.2 fee convention).
//
// The arithmetic is covered in feeAllocation.test.ts; what matters here is
// that the action derives its plan from the *live* portfolio, writes through
// the normal mutation path (so the change is recorded and the file is marked
// dirty), and refuses when the file is open read-only.

import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import { computeFifo } from "./fifo";
import { totalBalance } from "./portfolio";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "./types";

/** A buy of 1 BTC, of which 0.4 was sent away with an unassigned fee. */
function seed(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wA",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "aA",
          name: "Spot",
          transactions: [
            {
              id: "b1",
              type: "buy",
              date: "2026-01-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: "50000",
              note: "",
            },
            {
              id: "o1",
              type: "transfer_out",
              date: "2026-02-01T00:00:00.000Z",
              amountBtc: "0.4",
              pricePerBtcEur: null,
              feeBtc: "0.0001",
              lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

const state = () => useAppStore.getState();
const entries = () => flattenLedger(state().portfolio!.wallets);

beforeEach(() => {
  useAppStore.setState({
    portfolio: seed(),
    readOnly: false,
    dirty: false,
    fileName: "t.dwp",
    password: null,
  });
});

describe("repairFeeAllocations", () => {
  it("closes the gap and makes the engine agree with the ledger", () => {
    // Before: the allocation closed 0.4 of the buy, but 0.4001 left the
    // account, so the lots stand 0.0001 above the balance.
    expect(computeFifo(entries(), 365).openLotsBtc.toString()).toBe("0.6");
    expect(totalBalance(entries()).toString()).toBe("0.5999");

    expect(state().repairFeeAllocations()).toBe(1);

    expect(computeFifo(entries(), 365).openLotsBtc.toString()).toBe("0.5999");
    expect(totalBalance(entries()).toString()).toBe("0.5999");
  });

  it("records the change and marks the file as unsaved", () => {
    state().repairFeeAllocations();
    expect(state().dirty).toBe(true);
    const log = state().portfolio!.changeLog ?? [];
    expect(log[0].kind).toBe("update");
    expect(log[0].note).toBe("feeAllocations:1");
    expect(log[0].txIds).toContain("o1");
  });

  it("does nothing, twice", () => {
    expect(state().repairFeeAllocations()).toBe(1);
    const after = JSON.stringify(state().portfolio!.wallets);
    // The second run finds no gap, so it must not touch the file again.
    expect(state().repairFeeAllocations()).toBe(0);
    expect(JSON.stringify(state().portfolio!.wallets)).toBe(after);
  });

  it("writes nothing while the file is open read-only", () => {
    useAppStore.setState({ readOnly: true });
    state().repairFeeAllocations();
    expect(state().portfolio!.wallets[0].accounts[0].transactions[1].lotAllocations).toEqual([
      { lotTransactionId: "b1", amountBtc: "0.4" },
    ]);
  });
});
