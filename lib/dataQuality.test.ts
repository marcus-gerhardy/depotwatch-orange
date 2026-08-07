import { describe, expect, it } from "vitest";
import { countIssues, hasIssue, issueContext } from "./dataQuality";
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

describe("missingTxid", () => {
  const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

  it("is satisfied by the counterpart leg's txid", () => {
    // One transaction, one id: a hardware wallet's arrival carries it for the
    // exchange's send as well, so the pair is not a gap (§3.2).
    const entries = [
      entry(tx({ id: "o1", type: "transfer_out", transferGroupId: "g" })),
      entry(tx({ id: "in1", type: "transfer_in", transferGroupId: "g", txid: TXID })),
    ];
    const ctx = issueContext(entries);
    expect(hasIssue(entries[0], "missingTxid", ctx)).toBe(false);
    expect(countIssues(entries).missingTxid).toBe(0);
  });

  it("still reports a group where nobody recorded one", () => {
    const entries = [
      entry(tx({ id: "o1", type: "transfer_out", transferGroupId: "g" })),
      entry(tx({ id: "in1", type: "transfer_in", transferGroupId: "g" })),
    ];
    expect(countIssues(entries).missingTxid).toBe(2);
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
      // The arrival's group has no out-leg, and a group id whose counterpart
      // does not exist is not a link: it is as unlinked as the out-leg that
      // has no id at all.
      unlinkedTransfer: 2,
      // ... and its coins still trace back to nothing.
      unresolvedOrigin: 1,
      // The out-leg closes no lots at all.
      incompleteAllocation: 1,
      missingTxid: 1,
      missingEurValue: 1,
    });
  });

  it("counts an outgoing transfer whose allocations do not cover it", () => {
    const outLeg = (lotAllocations: { lotTransactionId: string; amountBtc: string }[]) =>
      entry(
        tx({
          type: "transfer_out",
          id: "o",
          amountBtc: "0.4999",
          feeBtc: "0.0001",
          transferGroupId: "g",
          lotAllocations,
        }),
      );
    // The target is amount + BTC fee: that is what left the account (§3.2).
    expect(
      countIssues([outLeg([{ lotTransactionId: "b", amountBtc: "0.5" }])])
        .incompleteAllocation,
    ).toBe(0);
    expect(
      countIssues([outLeg([{ lotTransactionId: "b", amountBtc: "0.4999" }])])
        .incompleteAllocation,
    ).toBe(1);
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
