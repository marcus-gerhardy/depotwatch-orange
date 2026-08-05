import { describe, expect, it } from "vitest";
import { countIssues, hasIssue } from "./dataQuality";
import type { LedgerEntry, Transaction } from "./types";

const tx = (t: Partial<Transaction> & Pick<Transaction, "type">): Transaction => ({
  id: "t1",
  date: "2026-01-01T00:00:00Z",
  amountBtc: "1",
  pricePerBtcEur: "50000",
  note: "",
  ...t,
});

const entry = (t: Transaction): LedgerEntry => ({
  ...t,
  walletId: "w",
  walletName: "W",
  accountId: "a",
  accountName: "A",
});

describe("unlinkedTransfer", () => {
  it("flags a transfer leg without a transfer group", () => {
    expect(hasIssue(tx({ type: "transfer_out" }), "unlinkedTransfer")).toBe(true);
  });

  it("accepts a leg that is linked to its counterpart", () => {
    expect(
      hasIssue(tx({ type: "transfer_in", transferGroupId: "g1" }), "unlinkedTransfer"),
    ).toBe(false);
  });

  it("never flags a buy or a sell", () => {
    expect(hasIssue(tx({ type: "buy" }), "unlinkedTransfer")).toBe(false);
    expect(hasIssue(tx({ type: "sell" }), "unlinkedTransfer")).toBe(false);
  });
});

describe("missingTxid", () => {
  it("flags a transfer leg without an on-chain id", () => {
    expect(hasIssue(tx({ type: "transfer_out" }), "missingTxid")).toBe(true);
  });

  it("accepts a leg that carries one", () => {
    expect(hasIssue(tx({ type: "transfer_in", txid: "a".repeat(64) }), "missingTxid")).toBe(
      false,
    );
  });

  it("does not ask a spend for a txid (the form never offers one)", () => {
    expect(hasIssue(tx({ type: "spend" }), "missingTxid")).toBe(false);
  });
});

describe("missingEurValue", () => {
  it("flags a buy with neither a price nor a total", () => {
    expect(
      hasIssue(
        tx({ type: "buy", pricePerBtcEur: null, totalFiatEur: null }),
        "missingEurValue",
      ),
    ).toBe(true);
  });

  it("accepts a buy that only has a total", () => {
    expect(
      hasIssue(
        tx({ type: "buy", pricePerBtcEur: null, totalFiatEur: "45000" }),
        "missingEurValue",
      ),
    ).toBe(false);
  });

  it("does not ask a transfer for a EUR value", () => {
    // A transfer's value is traced from the lots it moves (CLAUDE.md §3.2).
    expect(
      hasIssue(
        tx({ type: "transfer_out", pricePerBtcEur: null, totalFiatEur: null }),
        "missingEurValue",
      ),
    ).toBe(false);
  });
});

describe("countIssues", () => {
  it("counts each issue independently", () => {
    const counts = countIssues([
      entry(tx({ type: "transfer_out", id: "1" })), // unlinked + no txid
      entry(tx({ type: "transfer_in", id: "2", transferGroupId: "g", txid: "b".repeat(64) })),
      entry(tx({ type: "buy", id: "3", pricePerBtcEur: null, totalFiatEur: null })),
    ]);
    expect(counts).toEqual({
      unlinkedTransfer: 1,
      // The linked arrival claims a group whose out-leg is missing, so its
      // coins still trace back to nothing.
      unresolvedOrigin: 1,
      missingTxid: 1,
      missingEurValue: 1,
    });
  });

  it("does not flag an arrival whose origin resolves", () => {
    const counts = countIssues([
      entry(tx({ type: "buy", id: "b", amountBtc: "1", pricePerBtcEur: "20000" })),
      entry(
        tx({
          type: "transfer_out",
          id: "o",
          amountBtc: "1",
          transferGroupId: "g",
          counterpartyAccountId: "a2",
          lotAllocations: [{ lotTransactionId: "b", amountBtc: "1" }],
        }),
      ),
      entry(
        tx({
          type: "transfer_in",
          id: "i",
          amountBtc: "1",
          transferGroupId: "g",
          counterpartyAccountId: "a1",
        }),
      ),
    ]);
    expect(counts.unresolvedOrigin).toBe(0);
  });
});
