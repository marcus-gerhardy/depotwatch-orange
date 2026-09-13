import { describe, expect, it } from "vitest";
import {
  applyFeeAllocationRepair,
  feeAllocationGaps,
  planFeeAllocationRepair,
} from "./feeAllocation";
import { computeFifo } from "./fifo";
import { balanceDelta, totalBalance } from "./portfolio";
import { dec } from "./decimal";
import { emptyPortfolio, flattenLedger, type PortfolioFile, type Transaction } from "./types";

function portfolio(txs: Transaction[], target: Transaction[] = []): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wA",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "aA", name: "Spot", transactions: txs }],
    },
    {
      id: "wB",
      name: "Cold",
      type: "hardware",
      accounts: [{ id: "aB", name: "Vault", transactions: target }],
    },
  ];
  return p;
}

const buy = (id: string, date: string, amountBtc: string): Transaction => ({
  id,
  type: "buy",
  date,
  amountBtc,
  pricePerBtcEur: "50000",
  totalFiatEur: null,
  note: "",
});

/** The defect: the assignment covers the amount, the fee is left over. */
const shortOut = (allocations: { lotTransactionId: string; amountBtc: string }[]): Transaction => ({
  id: "o1",
  type: "transfer_out",
  date: "2026-06-01T00:00:00.000Z",
  amountBtc: "0.4",
  pricePerBtcEur: null,
  totalFiatEur: null,
  feeBtc: "0.0001",
  counterpartyAccountId: "aB",
  transferGroupId: "g1",
  lotAllocations: allocations,
  note: "",
});

const entriesOf = (p: PortfolioFile) => flattenLedger(p.wallets);

/**
 * What the account's open lots exceed its ledger balance by: the ghost holding
 * an unassigned network fee leaves behind. Zero in a healthy file.
 */
function ghostIn(entries: ReturnType<typeof entriesOf>, accountId: string): string {
  const lots = computeFifo(entries, 365)
    .openLots.filter((l) => l.accountId === accountId)
    .reduce((s, l) => s.plus(l.remainingBtc), dec("0"));
  const ledger = entries
    .filter((e) => e.accountId === accountId)
    .reduce((s, e) => s.plus(balanceDelta(e)), dec("0"));
  return lots.minus(ledger).toString();
}

describe("feeAllocationGaps", () => {
  it("finds the assignment that stops short of the fee", () => {
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "1"),
      shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }]),
    ]);
    const [gap, ...rest] = feeAllocationGaps(entriesOf(p));

    expect(rest).toEqual([]);
    expect(gap.entry.id).toBe("o1");
    expect(gap.targetBtc.toString()).toBe("0.4001");
    expect(gap.missingBtc.toString()).toBe("0.0001");
    expect(gap.exactlyTheFee).toBe(true);
  });

  it("leaves a correct assignment alone", () => {
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "1"),
      shortOut([{ lotTransactionId: "b1", amountBtc: "0.4001" }]),
    ]);
    expect(feeAllocationGaps(entriesOf(p))).toEqual([]);
  });

  it("never touches a disposal nobody has assigned yet", () => {
    // Which buys this sold is the user's decision (§3.2). An empty assignment
    // is that question unanswered, not this defect.
    const p = portfolio([buy("b1", "2026-01-01T00:00:00.000Z", "1"), shortOut([])]);
    expect(feeAllocationGaps(entriesOf(p))).toEqual([]);
  });

  it("ignores an outgoing transaction without a BTC fee", () => {
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "1"),
      { ...shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }]), feeBtc: undefined },
    ]);
    expect(feeAllocationGaps(entriesOf(p))).toEqual([]);
  });
});

describe("planFeeAllocationRepair", () => {
  it("takes the fee from the lot the transfer already moved", () => {
    const p = portfolio(
      [buy("b1", "2026-01-01T00:00:00.000Z", "1"), shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }])],
      [
        {
          id: "i1",
          type: "transfer_in",
          date: "2026-06-01T01:00:00.000Z",
          amountBtc: "0.4",
          pricePerBtcEur: null,
          totalFiatEur: null,
          counterpartyAccountId: "aA",
          transferGroupId: "g1",
          note: "",
        },
      ],
    );
    const entries = entriesOf(p);
    const plan = planFeeAllocationRepair(entries);

    expect(plan.repairableCount).toBe(1);
    expect(plan.incompleteCount).toBe(0);
    expect(plan.items[0].additions).toHaveLength(1);
    expect(plan.items[0].additions[0]).toMatchObject({ lotTxId: "b1", sameLot: true });
    expect(plan.items[0].additions[0].amountBtc.toString()).toBe("0.0001");

    // Before: the ledger has paid the fee, the engine has not, so the source
    // account's lots stand above its balance by exactly the fee — the ghost.
    expect(totalBalance(entries).toString()).toBe("0.9999");
    expect(ghostIn(entries, "aA")).toBe("0.0001");

    // After: the two agree, in the account and in the portfolio.
    const fixed = applyFeeAllocationRepair(p, plan, entries);
    const next = entriesOf(fixed);
    expect(totalBalance(next).toString()).toBe("0.9999");
    expect(computeFifo(next, 365).openLotsBtc.toString()).toBe("0.9999");
    expect(ghostIn(next, "aA")).toBe("0");
  });

  it("falls back to the next-oldest lot when the named one is exhausted", () => {
    // The named lot is fully spoken for (0.4 moved, nothing left), so the fee
    // has to come from somewhere: the oldest lot with something free.
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "0.4"),
      buy("b2", "2026-02-01T00:00:00.000Z", "0.3"),
      buy("b3", "2026-03-01T00:00:00.000Z", "0.3"),
      shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }]),
    ]);
    const entries = entriesOf(p);
    const plan = planFeeAllocationRepair(entries);

    expect(plan.items[0].additions).toHaveLength(1);
    expect(plan.items[0].additions[0]).toMatchObject({ lotTxId: "b2", sameLot: false });
    expect(plan.items[0].shortfallBtc.toString()).toBe("0");

    const fixed = applyFeeAllocationRepair(p, plan, entries);
    const next = entriesOf(fixed);
    expect(totalBalance(next).toString()).toBe(
      computeFifo(next, 365).openLotsBtc.toString(),
    );
  });

  it("spreads the fee over several lots when the first cannot carry it", () => {
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "0.40005"),
      buy("b2", "2026-02-01T00:00:00.000Z", "0.5"),
      shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }]),
    ]);
    const plan = planFeeAllocationRepair(entriesOf(p));

    expect(plan.items[0].additions.map((a) => a.lotTxId)).toEqual(["b1", "b2"]);
    expect(plan.items[0].additions.map((a) => a.amountBtc.toString())).toEqual([
      "0.00005",
      "0.00005",
    ]);
  });

  it("reports what no lot can cover instead of over-allocating", () => {
    // Everything in the account is already claimed: the fee has nowhere to
    // come from, and inventing it would be a second wrong figure.
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "0.4"),
      shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }]),
    ]);
    const plan = planFeeAllocationRepair(entriesOf(p));

    expect(plan.items[0].additions).toEqual([]);
    expect(plan.items[0].shortfallBtc.toString()).toBe("0.0001");
    expect(plan.repairableCount).toBe(0);
    expect(plan.incompleteCount).toBe(1);
    // Nothing is written for such an item.
    expect(applyFeeAllocationRepair(p, plan, entriesOf(p))).toBe(p);
  });

  it("never hands the same satoshi to two transactions", () => {
    const out2: Transaction = {
      ...shortOut([{ lotTransactionId: "b1", amountBtc: "0.3" }]),
      id: "o2",
      date: "2026-07-01T00:00:00.000Z",
      amountBtc: "0.3",
      transferGroupId: "g2",
    };
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "0.70015"),
      shortOut([{ lotTransactionId: "b1", amountBtc: "0.4" }]),
      out2,
    ]);
    const entries = entriesOf(p);
    const plan = planFeeAllocationRepair(entries);

    // 0.70015 bought, 0.7 assigned, 0.00015 free — but two fees of 0.0001 want
    // 0.0002. The first is covered in full, the second only in part.
    expect(plan.items[0].shortfallBtc.toString()).toBe("0");
    expect(plan.items[1].coveredBtc.toString()).toBe("0.00005");
    expect(plan.items[1].shortfallBtc.toString()).toBe("0.00005");

    // And no lot is over-allocated afterwards.
    const fixed = applyFeeAllocationRepair(p, plan, entries);
    const assigned = flattenLedger(fixed.wallets)
      .flatMap((e) => e.lotAllocations ?? [])
      .filter((a) => a.lotTransactionId === "b1")
      .reduce((s, a) => s + Number(a.amountBtc), 0);
    expect(assigned).toBeLessThanOrEqual(0.70015);
  });

  it("keeps the allocations oldest lot first", () => {
    // The stored order decides which lot pays the network fee in the engine
    // (§3.2), so a repaired transaction has to look like a hand-made one.
    const p = portfolio([
      buy("b1", "2026-01-01T00:00:00.000Z", "0.2"),
      buy("b2", "2026-02-01T00:00:00.000Z", "0.5"),
      shortOut([
        { lotTransactionId: "b1", amountBtc: "0.2" },
        { lotTransactionId: "b2", amountBtc: "0.2" },
      ]),
    ]);
    const entries = entriesOf(p);
    const fixed = applyFeeAllocationRepair(p, planFeeAllocationRepair(entries), entries);
    const repaired = flattenLedger(fixed.wallets).find((e) => e.id === "o1")!;

    expect(repaired.lotAllocations!.map((a) => a.lotTransactionId)).toEqual(["b1", "b2"]);
    expect(repaired.lotAllocations!.map((a) => a.amountBtc)).toEqual(["0.20000000", "0.20010000"]);
  });
});
