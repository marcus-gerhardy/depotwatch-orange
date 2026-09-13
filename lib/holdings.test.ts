import { describe, expect, it } from "vitest";
import {
  accountBalanceBtc,
  computeHolding,
  portfolioHoldings,
  rowTotals,
  type HoldingInput,
} from "./holdings";
import { computeFifo } from "./fifo";
import { indexLedger, resolveProvenance } from "./provenance";
import { dec } from "./decimal";
import {
  flattenLedger,
  type LedgerEntry,
  type TransactionType,
  type Wallet,
} from "./types";

const HOLDING_DAYS = 365;
/** Fixed "now", so a holding period is a fact of the test rather than of today. */
const NOW = new Date("2026-01-15T12:00:00Z");

let seq = 0;
function entry(
  type: TransactionType,
  amountBtc: string,
  extra: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    id: `tx-${++seq}`,
    type,
    date: "2024-01-01T00:00:00Z",
    amountBtc,
    pricePerBtcEur: null,
    note: "",
    walletId: "wA",
    walletName: "Exchange",
    accountId: "aA",
    accountName: "Spot",
    ...extra,
  };
}

const inB = {
  walletId: "wB",
  walletName: "Ledger",
  accountId: "aB",
  accountName: "Account 1",
};
const inC = {
  walletId: "wC",
  walletName: "Cold",
  accountId: "aC",
  accountName: "Vault",
};

function input(entries: LedgerEntry[], priceEur: number | null = 50_000): HoldingInput {
  return {
    entries,
    fifo: computeFifo(entries, HOLDING_DAYS),
    priceEur,
    now: NOW,
  };
}

describe("computeHolding", () => {
  it("takes the quantity from the ledger and the lots from the engine", () => {
    const b1 = entry("buy", "0.5", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const b2 = entry("buy", "0.25", { date: "2025-11-01T00:00:00Z", pricePerBtcEur: "60000" });
    const h = computeHolding(input([b1, b2]));

    expect(h.btc.toString()).toBe("0.75");
    expect(h.sats).toBe(75_000_000);
    expect(h.costBasisEur.toString()).toBe("25000"); // 0.5*20000 + 0.25*60000
    expect(h.basisBtc.toString()).toBe("0.75");
    expect(h.unknownBasisBtc.toString()).toBe("0");
    expect(h.valueEur!.toString()).toBe("37500");
    expect(h.unrealizedPnlEur!.toString()).toBe("12500");
    expect(h.avgCostPerBtcEur!.toString()).toBe(dec("25000").div("0.75").toString());
    expect(h.lots).toHaveLength(2);
    // Newest acquisition first.
    expect(h.lots[0].txId).toBe(b2.id);
  });

  it("splits the holding into tax-free, taxable and not judgeable", () => {
    const old = entry("buy", "1", { date: "2023-01-01T00:00:00Z", pricePerBtcEur: "20000" });
    const fresh = entry("buy", "0.5", { date: "2025-12-01T00:00:00Z", pricePerBtcEur: "80000" });
    // An arrival whose group has no out-leg: origin unresolved (§3.2).
    const orphan = entry("transfer_in", "0.25", {
      date: "2025-06-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "missing",
    });
    const h = computeHolding(input([old, fresh, orphan]));

    expect(h.taxFreeBtc.toString()).toBe("1");
    expect(h.taxableBtc.toString()).toBe("0.5");
    expect(h.unresolvedBtc.toString()).toBe("0.25");
    // The three buckets always add up to the open lots, never more, never less.
    expect(h.taxFreeBtc.plus(h.taxableBtc).plus(h.unresolvedBtc).toString()).toBe(
      h.openLotsBtc.toString(),
    );
    // The lot with no traceable origin is never dated from its arrival.
    expect(h.nextTaxFreeDate?.toISOString()).toBe(
      new Date("2026-12-02T00:00:00Z").toISOString(),
    );
  });

  it("values the cost basis over the BTC it covers, not the whole holding", () => {
    const bought = entry("buy", "0.5", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    // External arrival without a price: open, but no cost basis behind it.
    const gifted = entry("transfer_in", "0.5", { date: "2024-03-01T00:00:00Z" });
    const h = computeHolding(input([bought, gifted]));

    expect(h.btc.toString()).toBe("1");
    expect(h.basisBtc.toString()).toBe("0.5");
    expect(h.unknownBasisBtc.toString()).toBe("0.5");
    // 0.5 BTC valued at 50 000, cost 10 000 — the priceless half contributes
    // nothing to either side instead of being booked as pure profit.
    expect(h.unrealizedPnlEur!.toString()).toBe("15000");
  });

  it("keeps a part-consumed lot at its remaining amount", () => {
    const b = entry("buy", "1", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const sell = entry("sell", "0.4", {
      date: "2025-03-01T00:00:00Z",
      pricePerBtcEur: "60000",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.4" }],
    });
    const h = computeHolding(input(flattenLedger(wallets([b, sell]))));

    expect(h.btc.toString()).toBe("0.6");
    expect(h.lots).toHaveLength(1);
    expect(h.lots[0].amountBtc.toString()).toBe("0.6");
    expect(h.lots[0].costEur!.toString()).toBe("12000");
    expect(h.unassignedBtc.toString()).toBe("0");
  });

  it("reports a disposal nobody assigned as a gap, not as a bigger balance", () => {
    const b = entry("buy", "1", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const sell = entry("sell", "0.4", { date: "2025-03-01T00:00:00Z", pricePerBtcEur: "60000" });
    const h = computeHolding(input([b, sell]));

    // The ledger is the authority on the quantity (§11).
    expect(h.btc.toString()).toBe("0.6");
    // The engine could close nothing, so its lots still hold the whole buy.
    expect(h.openLotsBtc.toString()).toBe("1");
    expect(h.unassignedBtc.toString()).toBe("0.4");
  });

  it("follows a lot through two transfers and keeps its acquisition date", () => {
    const b = entry("buy", "1", { date: "2023-05-01T00:00:00Z", pricePerBtcEur: "25000" });
    const out1 = entry("transfer_out", "0.9", {
      date: "2024-01-10T00:00:00Z",
      feeBtc: "0.1",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "1" }],
    });
    const in1 = entry("transfer_in", "0.9", {
      date: "2024-01-10T01:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
      ...inB,
    });
    const out2 = entry("transfer_out", "0.8", {
      date: "2024-02-10T00:00:00Z",
      feeBtc: "0.1",
      counterpartyAccountId: "aC",
      transferGroupId: "g2",
      lotAllocations: [{ lotTransactionId: in1.id, amountBtc: "0.9" }],
      ...inB,
    });
    const in2 = entry("transfer_in", "0.8", {
      date: "2024-02-10T01:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g2",
      ...inC,
    });

    const entries = flattenLedger(wallets([b, out1, in1, out2, in2]));
    const all = input(entries);
    const cold = computeHolding(all, new Set(["aC"]));

    expect(cold.btc.toString()).toBe("0.8");
    expect(cold.lots).toHaveLength(1);
    // Two hops later the lot still knows when it was bought and what it cost.
    expect(cold.lots[0].acquiredDate).toBe("2023-05-01T00:00:00Z");
    expect(cold.lots[0].costPerBtcEur!.toString()).toBe("25000");
    expect(cold.taxFreeBtc.toString()).toBe("0.8");
    // The source accounts are empty afterwards; the network fees simply left.
    expect(computeHolding(all, new Set(["aA"])).btc.toString()).toBe("0");
    expect(computeHolding(all, new Set(["aB"])).btc.toString()).toBe("0");

    // The engine's lots and the origin resolver have to agree about that
    // acquisition — they read the same links, so a difference would mean the
    // detail page and the origin list contradict each other.
    const origins = resolveProvenance(
      entries.find((e) => e.id === in2.id)!,
      indexLedger(entries),
    ).origins;
    expect(origins).toHaveLength(1);
    expect(origins[0].acquiredDate).toBe(cold.lots[0].acquiredDate);
    expect(origins[0].lotTxId).toBe(b.id);
  });

  it("merges the parts of a bundled arrival that share an acquisition", () => {
    const b1 = entry("buy", "0.3", { date: "2023-05-01T00:00:00Z", pricePerBtcEur: "25000" });
    const b2 = entry("buy", "0.2", { date: "2023-09-01T00:00:00Z", pricePerBtcEur: "30000" });
    const out = entry("transfer_out", "0.5", {
      date: "2024-01-10T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [
        { lotTransactionId: b1.id, amountBtc: "0.3" },
        { lotTransactionId: b2.id, amountBtc: "0.2" },
      ],
    });
    const arrival = entry("transfer_in", "0.5", {
      date: "2024-01-10T01:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
      ...inB,
    });
    const h = computeHolding(
      input(flattenLedger(wallets([b1, b2, out, arrival]))),
      new Set(["aB"]),
    );

    // One arrival, two original acquisitions: two rows, not one and not four.
    expect(h.lots).toHaveLength(2);
    expect(h.lots.map((l) => l.acquiredDate)).toEqual([
      "2023-09-01T00:00:00Z",
      "2023-05-01T00:00:00Z",
    ]);
    expect(h.lots.reduce((s, l) => s.plus(l.amountBtc), dec("0")).toString()).toBe("0.5");
  });

  it("has no price and no market value without one", () => {
    const b = entry("buy", "1", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const h = computeHolding(input([b], null));
    expect(h.valueEur).toBeNull();
    expect(h.unrealizedPnlEur).toBeNull();
    expect(h.unrealizedPnlPct).toBeNull();
    expect(h.costBasisEur.toString()).toBe("20000");
  });
});

/** Wallet/account structure matching the ids the entries above use. */
function wallets(entries: LedgerEntry[]): Wallet[] {
  const byWallet = new Map<string, Wallet>();
  for (const e of entries) {
    let w = byWallet.get(e.walletId);
    if (!w) {
      w = { id: e.walletId, name: e.walletName, type: "exchange", accounts: [] };
      byWallet.set(e.walletId, w);
    }
    let a = w.accounts.find((acc) => acc.id === e.accountId);
    if (!a) {
      a = { id: e.accountId, name: e.accountName, transactions: [] };
      w.accounts.push(a);
    }
    a.transactions.push(e);
  }
  return [...byWallet.values()];
}

describe("portfolioHoldings", () => {
  it("covers every wallet and account, including the empty ones", () => {
    const b = entry("buy", "1", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const structure = wallets([b]);
    // An account nothing was ever booked in, plus a wallet with no accounts.
    structure[0].accounts.push({ id: "aEmpty", name: "Savings", transactions: [] });
    structure.push({ id: "wEmpty", name: "Paper", type: "paper", accounts: [] });

    const entries = flattenLedger(structure);
    const h = portfolioHoldings(input(entries), structure);

    expect(h.byAccount.get("aA")!.btc.toString()).toBe("1");
    const empty = h.byAccount.get("aEmpty")!;
    expect(empty.btc.toString()).toBe("0");
    expect(empty.sats).toBe(0);
    expect(empty.lots).toEqual([]);
    expect(empty.transactionCount).toBe(0);
    expect(empty.valueEur!.toString()).toBe("0");
    expect(h.byWallet.get("wEmpty")!.btc.toString()).toBe("0");
    expect(h.total.btc.toString()).toBe("1");
  });

  it("agrees with the single-scope computation", () => {
    const b1 = entry("buy", "0.4", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const out = entry("transfer_out", "0.3", {
      date: "2024-03-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b1.id, amountBtc: "0.3" }],
    });
    const arrival = entry("transfer_in", "0.3", {
      date: "2024-03-01T02:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
      ...inB,
    });
    const structure = wallets([b1, out, arrival]);
    const all = input(flattenLedger(structure));
    const h = portfolioHoldings(all, structure);

    for (const [accountId, holding] of h.byAccount) {
      const single = computeHolding(all, new Set([accountId]));
      expect(holding.btc.toString()).toBe(single.btc.toString());
      expect(holding.costBasisEur.toString()).toBe(single.costBasisEur.toString());
    }
    expect(h.byWallet.get("wB")!.btc.toString()).toBe("0.3");
  });
});

describe("accountBalanceBtc", () => {
  it("answers with and without one transaction", () => {
    const b = entry("buy", "1", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const out = entry("transfer_out", "0.4", { date: "2024-04-01T00:00:00Z", feeBtc: "0.01" });
    const entries = [b, out];

    expect(accountBalanceBtc(entries, "aA").toString()).toBe("0.59");
    // What the account held before that send: the figure a dialog needs to say
    // what is left after it.
    expect(accountBalanceBtc(entries, "aA", { excludeTxId: out.id }).toString()).toBe("1");
    expect(accountBalanceBtc(entries, "aB").toString()).toBe("0");
  });
});

describe("rowTotals", () => {
  it("sums what is shown, and says how much of it is valued", () => {
    const b1 = entry("buy", "0.5", { date: "2024-02-01T00:00:00Z", pricePerBtcEur: "20000" });
    const b2 = entry("buy", "0.5", { date: "2024-03-01T00:00:00Z", totalFiatEur: "15000" });
    const b3 = entry("buy", "0.1", { date: "2024-04-01T00:00:00Z" });
    const sell = entry("sell", "0.2", {
      date: "2025-01-01T00:00:00Z",
      pricePerBtcEur: "60000",
      feeBtc: "0.001",
      feeFiatEur: "5",
    });
    const totals = rowTotals([b1, b2, b3, sell]);

    expect(totals.count).toBe(4);
    expect(totals.inflowBtc.toString()).toBe("1.1");
    expect(totals.outflowBtc.toString()).toBe("0.201");
    expect(totals.netBtc.toString()).toBe("0.899");
    expect(totals.feeBtc.toString()).toBe("0.001");
    expect(totals.feeFiatEur.toString()).toBe("5");
    expect(totals.valueEur.toString()).toBe("37000"); // 10000 + 15000 + 12000
    expect(totals.valuedCount).toBe(3);
    expect(totals.unvaluedCount).toBe(1);
  });

  it("never counts a transfer leg's derived value as its own euros", () => {
    const b = entry("buy", "1", { date: "2024-02-01T00:00:00Z", totalFiatEur: "20000" });
    const out = entry("transfer_out", "1", {
      date: "2024-03-01T00:00:00Z",
      // The transfer dialog writes these for display (§3.2) — they are the
      // buy's euros, not a second set.
      pricePerBtcEur: "20000",
      totalFiatEur: "20000",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "1" }],
    });
    expect(rowTotals([b, out]).valueEur.toString()).toBe("20000");
  });
});
