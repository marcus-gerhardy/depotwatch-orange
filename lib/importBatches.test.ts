// Undoing a CSV import. The point of these tests is what the feature must
// *not* do: a transaction an import wrote is an ordinary transaction from the
// moment it exists, and removing one that a later sale allocates, or one leg
// of a linked transfer, would leave references pointing at nothing.

import { describe, expect, it } from "vitest";
import { analyzeBatchRemoval, batchForHash, removeBatchTransactions } from "./importBatches";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "./types";

const tx = (o: Partial<Transaction> & Pick<Transaction, "id">): Transaction => ({
  type: "buy",
  date: "2026-03-02T10:00:00.000Z",
  amountBtc: "0.5",
  pricePerBtcEur: "50000",
  totalFiatEur: "25000",
  note: "",
  ...o,
});

function portfolio(transactions: Transaction[], second: Transaction[] = []): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [
        { id: "a1", name: "Spot", transactions },
        { id: "a2", name: "Cold", transactions: second },
      ],
    },
  ];
  p.importBatches = [
    {
      id: "batch-1",
      importedAt: "2026-03-03T08:00:00.000Z",
      fileName: "exchange.csv",
      fileHash: "abc",
      presetName: "Exchange",
      transactionCount: transactions.filter((t) => t.importBatchId === "batch-1").length,
      walletId: "w1",
      accountId: "a1",
    },
  ];
  return p;
}

describe("analyzeBatchRemoval", () => {
  it("collects what the batch wrote", () => {
    const p = portfolio([
      tx({ id: "b1", importBatchId: "batch-1" }),
      tx({ id: "b2", importBatchId: "batch-1" }),
      tx({ id: "manual" }),
    ]);
    const removal = analyzeBatchRemoval(p, "batch-1");

    expect(removal.transactionIds.sort()).toEqual(["b1", "b2"]);
    expect(removal.blockers).toEqual([]);
    expect(removal.removableIds.sort()).toEqual(["b1", "b2"]);
  });

  it("refuses to pull a lot out from under a sale that closed it", () => {
    const p = portfolio([
      tx({ id: "imported-buy", importBatchId: "batch-1" }),
      tx({
        id: "later-sale",
        type: "sell",
        date: "2026-05-01T10:00:00.000Z",
        lotAllocations: [{ lotTransactionId: "imported-buy", amountBtc: "0.5" }],
      }),
    ]);
    const removal = analyzeBatchRemoval(p, "batch-1");

    expect(removal.blockers).toEqual([
      expect.objectContaining({
        transactionId: "imported-buy",
        reason: "allocatedByOther",
        otherId: "later-sale",
      }),
    ]);
    // Nothing of the batch may go, so nothing is offered.
    expect(removal.removableIds).toEqual([]);
  });

  it("refuses to orphan the other leg of a linked transfer", () => {
    const p = portfolio(
      [
        tx({
          id: "imported-out",
          type: "transfer_out",
          transferGroupId: "g1",
          importBatchId: "batch-1",
        }),
      ],
      [tx({ id: "manual-in", type: "transfer_in", transferGroupId: "g1" })],
    );
    const removal = analyzeBatchRemoval(p, "batch-1");

    expect(removal.blockers[0]).toMatchObject({
      transactionId: "imported-out",
      reason: "linkedTransfer",
      otherId: "manual-in",
    });
  });

  it("lets a transfer pair go when the whole pair came from the batch", () => {
    const p = portfolio(
      [tx({ id: "out", type: "transfer_out", transferGroupId: "g1", importBatchId: "batch-1" })],
      [tx({ id: "in", type: "transfer_in", transferGroupId: "g1", importBatchId: "batch-1" })],
    );
    const removal = analyzeBatchRemoval(p, "batch-1");

    expect(removal.blockers).toEqual([]);
    expect(removal.removableIds.sort()).toEqual(["in", "out"]);
  });

  it("refuses to re-open lots the batch's own disposal closed", () => {
    // Removing the sale would silently give the manual buy its balance back,
    // which changes the tax history of a transaction nobody asked to touch.
    const p = portfolio([
      tx({ id: "manual-buy" }),
      tx({
        id: "imported-sale",
        type: "sell",
        importBatchId: "batch-1",
        lotAllocations: [{ lotTransactionId: "manual-buy", amountBtc: "0.5" }],
      }),
    ]);
    const removal = analyzeBatchRemoval(p, "batch-1");

    expect(removal.blockers[0]).toMatchObject({
      transactionId: "imported-sale",
      reason: "allocatesOther",
      otherId: "manual-buy",
    });
  });
});

describe("removeBatchTransactions", () => {
  it("removes the transactions and the batch record", () => {
    const p = portfolio([
      tx({ id: "b1", importBatchId: "batch-1" }),
      tx({ id: "keep" }),
    ]);
    const after = removeBatchTransactions(p, "batch-1", ["b1"]);

    expect(after.wallets[0].accounts[0].transactions.map((t) => t.id)).toEqual(["keep"]);
    expect(after.importBatches).toBeUndefined();
  });

  it("keeps the record when part of the batch had to stay", () => {
    const p = portfolio([
      tx({ id: "b1", importBatchId: "batch-1" }),
      tx({ id: "b2", importBatchId: "batch-1" }),
    ]);
    const after = removeBatchTransactions(p, "batch-1", ["b1"]);

    // What is left is still traceable to where it came from.
    expect(after.importBatches).toHaveLength(1);
    expect(after.wallets[0].accounts[0].transactions.map((t) => t.id)).toEqual(["b2"]);
  });
});

describe("batchForHash", () => {
  it("recognises a file that was imported before", () => {
    const p = portfolio([tx({ id: "b1", importBatchId: "batch-1" })]);
    expect(batchForHash(p, "abc")?.fileName).toBe("exchange.csv");
    expect(batchForHash(p, "different")).toBeNull();
  });
});
