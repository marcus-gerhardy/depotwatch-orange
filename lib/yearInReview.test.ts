// The year in review. Three things matter more than the individual figures:
//
//  - an internal transfer must never look like stacking, not even when its two
//    legs sit on either side of New Year's Eve;
//  - holding periods come from the traced original buy, and a position whose
//    origin never resolved is reported as such rather than counted;
//  - the share image hides absolute amounts unless it is told not to.
//
// Each of those is a way of being quietly wrong that no screenshot would show.

import { describe, expect, it } from "vitest";
import { computeFifo } from "./fifo";
import { flattenLedger } from "./types";
import type { PortfolioFile, Transaction, Wallet, WalletType } from "./types";
import type { MilestoneRecord } from "./milestones";
import { computeYearReview, reviewableYears, type YearReview } from "./yearInReview";
import { hiddenStatCount, shareStats } from "./yearInReviewShare";

const tx = (
  o: Partial<Transaction> & Pick<Transaction, "id" | "type" | "date">,
): Transaction => ({
  amountBtc: "0.1",
  pricePerBtcEur: "50000",
  totalFiatEur: "5000",
  note: "",
  ...o,
});

function walletsOf(
  spec: {
    id: string;
    type: WalletType;
    accounts: { id: string; transactions: Transaction[] }[];
  }[],
): Wallet[] {
  return spec.map((w) => ({
    id: w.id,
    name: w.id,
    type: w.type,
    accounts: w.accounts.map((a) => ({ id: a.id, name: a.id, transactions: a.transactions })),
  }));
}

function review(
  wallets: Wallet[],
  o: {
    year?: number;
    now?: Date;
    closes?: Map<number, number>;
    milestones?: MilestoneRecord[];
    holdingPeriodDays?: number;
  } = {},
): YearReview {
  const entries = flattenLedger(wallets);
  return computeYearReview({
    year: o.year ?? 2025,
    entries,
    fifo: computeFifo(entries, o.holdingPeriodDays ?? 365),
    wallets,
    milestones: o.milestones ?? [],
    closeByDay: o.closes ?? new Map(),
    now: o.now ?? new Date("2026-02-01T12:00:00.000Z"),
  });
}

/** Two buys in 2025, one in 2024, so a year boundary is always in play. */
const simpleWallets = () =>
  walletsOf([
    {
      id: "exchange",
      type: "exchange",
      accounts: [
        {
          id: "spot",
          transactions: [
            tx({ id: "b0", type: "buy", date: "2024-11-04T10:00:00.000Z" }),
            tx({ id: "b1", type: "buy", date: "2025-03-03T10:00:00.000Z" }),
            tx({
              id: "b2",
              type: "buy",
              date: "2025-03-10T10:00:00.000Z",
              pricePerBtcEur: "70000",
              totalFiatEur: "7000",
            }),
          ],
        },
      ],
    },
  ]);

describe("what a year stacked", () => {
  it("counts the year's buys and nothing from other years", () => {
    const r = review(simpleWallets());
    expect(r.stacked.buyCount).toBe(2);
    expect(r.stacked.netBtc.toString()).toBe("0.2");
    // 0.2 on top of the 0.1 that was already there.
    expect(r.stacked.growth).toBeCloseTo(2, 10);
    expect(r.closing.btc.toString()).toBe("0.3");
    expect(r.closing.startBtc.toString()).toBe("0.1");
  });

  it("does not turn an internal transfer into a year's stacking", () => {
    // The classic shape: the send is booked on 31 December, the arrival is
    // stamped 2 January by the receiving wallet. Booked on their own days that
    // pair would show up as a whole year's worth of stacking in the new year.
    const wallets = walletsOf([
      {
        id: "exchange",
        type: "exchange",
        accounts: [
          {
            id: "spot",
            transactions: [
              tx({ id: "b1", type: "buy", date: "2024-06-01T10:00:00.000Z", amountBtc: "1" }),
              tx({
                id: "out",
                type: "transfer_out",
                date: "2024-12-31T23:00:00.000Z",
                amountBtc: "1",
                pricePerBtcEur: null,
                totalFiatEur: null,
                transferGroupId: "g1",
                counterpartyAccountId: "cold",
                lotAllocations: [{ lotTransactionId: "b1", amountBtc: "1" }],
              }),
            ],
          },
        ],
      },
      {
        id: "ledger",
        type: "hardware",
        accounts: [
          {
            id: "cold",
            transactions: [
              tx({
                id: "in",
                type: "transfer_in",
                date: "2025-01-02T09:00:00.000Z",
                amountBtc: "1",
                pricePerBtcEur: null,
                totalFiatEur: null,
                transferGroupId: "g1",
                counterpartyAccountId: "spot",
              }),
            ],
          },
        ],
      },
    ]);
    const r = review(wallets, { year: 2025 });
    expect(r.stacked.netBtc.toString()).toBe("0");
    expect(r.closing.btc.toString()).toBe("1");
    // 2024 grew by the buy and by nothing else: the transfer pair contributes
    // zero to the year it is booked in, rather than a coin to each year.
    expect(review(wallets, { year: 2024 }).stacked.netBtc.toString()).toBe("1");
  });
});

describe("prices and rhythm", () => {
  it("weights the average price by volume and compares it to the market", () => {
    const closes = new Map<number, number>();
    // A flat 2025 at 60 000, one close per day.
    for (let d = Date.UTC(2025, 0, 1); d <= Date.UTC(2025, 11, 31); d += 86_400_000) {
      closes.set(d, 60_000);
    }
    const r = review(simpleWallets(), { closes });
    expect(r.avgPrice!.yourAvgEur.toString()).toBe("60000");
    expect(r.avgPrice!.marketAvgEur!.toString()).toBe("60000");
    expect(r.avgPrice!.vsMarket).toBeCloseTo(0, 10);
    expect(r.priceRange!.lowEur.toString()).toBe("50000");
    expect(r.priceRange!.highEur.toString()).toBe("70000");
  });

  it("leaves the market comparison out when no closes are cached", () => {
    const r = review(simpleWallets());
    expect(r.avgPrice!.marketAvgEur).toBeNull();
    expect(r.avgPrice!.vsMarket).toBeNull();
    expect(r.cards).toContain("avgPrice");
  });

  it("finds the busiest month and the longest run of weeks", () => {
    const days = ["01-06", "01-13", "01-20", "01-27", "03-04"];
    const wallets = walletsOf([
      {
        id: "w",
        type: "exchange",
        accounts: [
          {
            id: "a",
            transactions: days.map((d, i) =>
              tx({ id: `b${i}`, type: "buy", date: `2025-${d}T12:00:00.000Z` }),
            ),
          },
        ],
      },
    ]);
    const r = review(wallets);
    expect(r.rhythm!.busiestMonth).toBe(0);
    expect(r.rhythm!.busiestMonthBuys).toBe(4);
    expect(r.streak).toEqual({ unit: "weeks", length: 4 });
  });
});

describe("tax figures", () => {
  it("reports what crossed the holding period this year, and not what has not", () => {
    const wallets = walletsOf([
      {
        id: "w",
        type: "exchange",
        accounts: [
          {
            id: "a",
            transactions: [
              // Crosses on 2025-06-02 (365 days + 1).
              tx({ id: "old", type: "buy", date: "2024-06-01T10:00:00.000Z" }),
              // Would only cross in 2026.
              tx({ id: "new", type: "buy", date: "2025-12-01T10:00:00.000Z" }),
            ],
          },
        ],
      },
    ]);
    const r = review(wallets, { year: 2025, now: new Date("2026-02-01T00:00:00.000Z") });
    expect(r.taxFree.lotCount).toBe(1);
    expect(r.taxFree.btc.toString()).toBe("0.1");
  });

  it("never counts a lot whose origin did not resolve", () => {
    // An arrival with no out-leg behind it: the engine keeps it as a lot of
    // unknown origin, and its acquisition date is an arrival, not a purchase.
    const wallets = walletsOf([
      {
        id: "cold",
        type: "hardware",
        accounts: [
          {
            id: "a",
            transactions: [
              tx({
                id: "in",
                type: "transfer_in",
                date: "2024-01-01T10:00:00.000Z",
                pricePerBtcEur: null,
                totalFiatEur: null,
                transferGroupId: "orphan",
                counterpartyAccountId: "gone",
              }),
            ],
          },
        ],
      },
    ]);
    const r = review(wallets, { year: 2025 });
    expect(r.taxFree.btc.toString()).toBe("0");
    expect(r.taxFree.unresolvedBtc.toString()).toBe("0.1");
  });
});

describe("which cards a year can fill", () => {
  it("says so plainly when a year holds nothing and nothing happened", () => {
    const r = review(simpleWallets(), { year: 2019 });
    expect(r.hasData).toBe(false);
    expect(r.transactionCount).toBe(0);
    expect(r.cards).not.toContain("invested");
    expect(r.cards).not.toContain("avgPrice");
  });

  it("skips the cards a thin year cannot support", () => {
    // One buy: no range (a single price is not a span), no streak.
    const wallets = walletsOf([
      {
        id: "w",
        type: "exchange",
        accounts: [{ id: "a", transactions: [tx({ id: "b", type: "buy", date: "2025-05-05T10:00:00.000Z" })] }],
      },
    ]);
    const r = review(wallets);
    expect(r.cards).toContain("stacked");
    expect(r.cards).toContain("avgPrice");
    expect(r.cards).not.toContain("priceRange");
    expect(r.cards).not.toContain("streak");
    expect(r.cards).not.toContain("realized");
  });

  it("offers completed years only, and no gaps in between", () => {
    // The running year is not among them: a review of a year that is still
    // going would change every week (§4.2).
    expect(
      reviewableYears(flattenLedger(simpleWallets()), new Date("2026-02-01T00:00:00.000Z")),
    ).toEqual([2025, 2024]);
    // A year in which nothing was traded is still offered: it has a holding at
    // its end, holding periods that ran out, milestones.
    expect(
      reviewableYears(flattenLedger(simpleWallets()), new Date("2028-02-01T00:00:00.000Z")),
    ).toEqual([2027, 2026, 2025, 2024]);
    // Nothing to review while the first transaction year is still running.
    expect(
      reviewableYears(flattenLedger(simpleWallets()), new Date("2024-06-01T00:00:00.000Z")),
    ).toEqual([]);
  });

  it("still has something to say about a year without transactions", () => {
    // Bought in 2024, held through 2025 and did nothing: the review reports the
    // holding rather than a friendly note.
    const r = review(simpleWallets(), { year: 2027, now: new Date("2028-02-01T00:00:00.000Z") });
    expect(r.transactionCount).toBe(0);
    expect(r.hasData).toBe(true);
    expect(r.cards).toContain("closing");
    expect(r.cards).not.toContain("invested");
  });
});

describe("the share image", () => {
  const t = ((key: string) => key) as never;
  const options = { t, loc: "de-DE", absolute: false, sats: false };

  it("states no absolute amount unless it is asked to", () => {
    const r = review(simpleWallets());
    const keys = shareStats(r, options).map((s) => s.key);
    // The figures that would say how much somebody owns.
    for (const forbidden of ["stacked", "invested", "fees", "closing", "taxFree", "realized"]) {
      expect(keys).not.toContain(forbidden);
    }
    // What is left still describes the year.
    expect(keys).toContain("buys");
    expect(keys).toContain("avgPrice");
    expect(keys).toContain("custody");
    expect(hiddenStatCount(r, options)).toBeGreaterThan(0);
  });

  it("adds them, and only them, when the switch is on", () => {
    const r = review(simpleWallets());
    const off = shareStats(r, options).map((s) => s.key);
    const on = shareStats(r, { ...options, absolute: true }).map((s) => s.key);
    expect(on).toEqual(expect.arrayContaining(off));
    expect(on).toContain("stacked");
    expect(on).toContain("closing");
    expect(on.length - off.length).toBe(hiddenStatCount(r, options));
  });

  it("prints no figure the review does not have", () => {
    // A year with nothing in it must not produce a card's worth of zeroes.
    const r = review(simpleWallets(), { year: 2019 });
    expect(shareStats(r, { ...options, absolute: true })).toEqual([]);
  });
});

/** Used above only to keep the fixture honest about the file shape. */
export const _fileShape: Partial<PortfolioFile> = {};
