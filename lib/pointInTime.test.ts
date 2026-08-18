// The portfolio as it stood on a past date (§4.3).
//
// What has to hold: the same engine, the same answers — and the holding period
// judged against *that* day rather than today, which is the one thing a
// historical view exists for and the easiest to get wrong.

import { describe, expect, it } from "vitest";
import { portfolioAsOf, yearEndOptions } from "./pointInTime";
import { flattenLedger, type PortfolioFile, type Transaction } from "./types";

const HOLDING_DAYS = 365;

const tx = (o: Partial<Transaction> & Pick<Transaction, "id" | "type" | "date">): Transaction => ({
  amountBtc: "1",
  pricePerBtcEur: "20000",
  totalFiatEur: "20000",
  note: "",
  ...o,
});

function entriesOf(transactions: Transaction[], second: Transaction[] = []) {
  const p = {
    wallets: [
      {
        id: "w1",
        name: "Wallet",
        type: "software" as const,
        accounts: [
          { id: "a1", name: "One", transactions },
          { id: "a2", name: "Two", transactions: second },
        ],
      },
    ],
  } as unknown as PortfolioFile;
  return flattenLedger(p.wallets);
}

describe("the holding on a past date", () => {
  const entries = entriesOf([
    tx({ id: "b1", type: "buy", date: "2024-03-01T10:00:00.000Z" }),
    tx({ id: "b2", type: "buy", date: "2026-05-01T10:00:00.000Z" }),
  ]);

  it("counts only what had happened by then", () => {
    const at = portfolioAsOf(entries, new Date(2025, 11, 31), HOLDING_DAYS);
    expect(at.balanceBtc.toString()).toBe("1");
    expect(at.openLots).toHaveLength(1);
  });

  it("includes the chosen day itself, to its end", () => {
    // "As of 1 March" means the day is over — a buy at 10:00 that day counts.
    const at = portfolioAsOf(entries, new Date(2024, 2, 1), HOLDING_DAYS);
    expect(at.balanceBtc.toString()).toBe("1");
  });

  it("judges the holding period against that day, not against today", () => {
    // On 31.12.2024 the March buy is nine months old: taxable then, tax-free
    // now. A view that asked "is it tax-free today" would be a live view with
    // a date picker on it.
    const at = portfolioAsOf(entries, new Date(2024, 11, 31), HOLDING_DAYS);
    expect(at.lockedBtc.toString()).toBe("1");
    expect(at.taxFreeBtc.toString()).toBe("0");

    const later = portfolioAsOf(entries, new Date(2025, 11, 31), HOLDING_DAYS);
    expect(later.taxFreeBtc.toString()).toBe("1");
    expect(later.lockedBtc.toString()).toBe("0");
  });

  it("reports the cost basis of what was held then", () => {
    const at = portfolioAsOf(entries, new Date(2025, 11, 31), HOLDING_DAYS);
    expect(at.costBasisEur.toString()).toBe("20000");
    expect(at.basisBtc.toString()).toBe("1");
  });
});

describe("a transfer straddling the cut-off", () => {
  it("books the arrival on the day the send left, not on its own timestamp", () => {
    // The two legs regularly carry different timestamps (one wallet stamps it
    // on sight, the exchange when the withdrawal completes). Cut between them
    // and the coins would be in neither account — or, the other way round, in
    // both.
    const entries = entriesOf(
      [
        tx({ id: "b", type: "buy", date: "2024-01-01T10:00:00.000Z" }),
        tx({
          id: "out",
          type: "transfer_out",
          date: "2025-12-31T20:00:00.000Z",
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: "b", amountBtc: "1" }],
          pricePerBtcEur: null,
        }),
      ],
      [
        tx({
          id: "in",
          type: "transfer_in",
          date: "2026-01-01T09:00:00.000Z",
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          pricePerBtcEur: null,
        }),
      ],
    );

    const at = portfolioAsOf(entries, new Date(2025, 11, 31), HOLDING_DAYS);
    // One coin, held — not zero, and not two.
    expect(at.balanceBtc.toString()).toBe("1");
    expect(at.balances.find((b) => b.accountId === "a2")?.btc.toString()).toBe("1");
    expect(at.balances.find((b) => b.accountId === "a1")?.btc.toString()).toBe("0");
  });
});

describe("the year ends offered", () => {
  it("offers every year from the first transaction to the last completed one", () => {
    const entries = entriesOf([tx({ id: "b", type: "buy", date: "2023-06-01T00:00:00.000Z" })]);
    const years = yearEndOptions(entries, new Date(2026, 5, 1)).map((d) => d.getFullYear());
    // 2025, 2024, 2023 — and never the running year, whose "year end" has not
    // happened yet.
    expect(years).toEqual([2025, 2024, 2023]);
  });

  it("offers none before the first year is over", () => {
    const entries = entriesOf([tx({ id: "b", type: "buy", date: "2026-01-01T00:00:00.000Z" })]);
    expect(yearEndOptions(entries, new Date(2026, 5, 1))).toEqual([]);
  });
});
