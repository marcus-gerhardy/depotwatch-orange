// The dashboard's derived figures. Each one is a pure function over data the
// engine already produced, and each one has a way of being subtly wrong that a
// screenshot would not reveal — a lot with an unresolved origin counted as
// tax-free, a fee valued at today's price instead of the day it was paid, a
// drawdown measured against the price rather than against the portfolio.

import { describe, expect, it } from "vitest";
import { dec } from "./decimal";
import { computeFifo, taxFreeDateOf, type OpenLot } from "./fifo";
import type { LedgerEntry, Transaction } from "./types";
import {
  bucketStart,
  buyHeatmap,
  feeTotals,
  maxDrawdown,
  realizedInYear,
  taxFreeRealizable,
  timeInMarket,
  tradeMarkers,
  tradeMarkersFor,
  whatIf,
} from "./dashboardStats";

const HOLDING_DAYS = 365;

function lot(over: Partial<OpenLot> & { txId: string; acquiredDate: string }): OpenLot {
  return {
    accountId: "a1",
    walletName: "Exchange",
    accountName: "Spot",
    originalAmountBtc: dec("1"),
    remainingBtc: dec("1"),
    costPerBtcEur: dec("20000"),
    taxFreeDate: taxFreeDateOf(over.acquiredDate, HOLDING_DAYS),
    note: "",
    ...over,
  };
}

const entry = (
  t: Partial<Transaction> & Pick<Transaction, "id" | "type" | "date">,
): LedgerEntry => ({
  amountBtc: "1",
  pricePerBtcEur: "20000",
  note: "",
  walletId: "w1",
  walletName: "Exchange",
  accountId: "a1",
  accountName: "Spot",
  ...t,
});

describe("taxFreeRealizable", () => {
  const now = new Date("2026-08-11T12:00:00.000Z");

  it("separates what is out of the holding period from what is not", () => {
    const summary = taxFreeRealizable(
      [
        lot({ txId: "old", acquiredDate: "2024-01-01T00:00:00.000Z" }),
        lot({
          txId: "recent",
          acquiredDate: "2026-06-01T00:00:00.000Z",
          remainingBtc: dec("0.5"),
        }),
      ],
      now,
    );

    expect(summary.btc.toString()).toBe("1");
    expect(summary.lotCount).toBe(1);
    expect(summary.lockedBtc.toString()).toBe("0.5");
  });

  it("never counts a lot of unknown origin as tax-free", () => {
    // Its acquisition date is an arrival, not an acquisition (§3.2) — old
    // enough on paper, but the date is an assumption, so it is reported apart.
    const summary = taxFreeRealizable(
      [
        lot({
          txId: "arrived",
          acquiredDate: "2020-01-01T00:00:00.000Z",
          originUnresolved: true,
        }),
      ],
      now,
    );

    expect(summary.btc.toString()).toBe("0");
    expect(summary.lotCount).toBe(0);
    expect(summary.unresolvedBtc.toString()).toBe("1");
    expect(summary.unresolvedLotCount).toBe(1);
  });

  it("ignores lots that have nothing left", () => {
    const summary = taxFreeRealizable(
      [lot({ txId: "spent", acquiredDate: "2020-01-01T00:00:00.000Z", remainingBtc: dec(0) })],
      now,
    );
    expect(summary.lotCount).toBe(0);
  });
});

describe("realizedInYear", () => {
  /** One sale a year apart from its buy, and one inside the holding period. */
  const entries: LedgerEntry[] = [
    entry({ id: "b1", type: "buy", date: "2024-01-10T00:00:00.000Z", pricePerBtcEur: "20000" }),
    entry({ id: "b2", type: "buy", date: "2026-01-10T00:00:00.000Z", pricePerBtcEur: "30000" }),
    entry({
      id: "s1",
      type: "sell",
      date: "2026-03-01T00:00:00.000Z",
      pricePerBtcEur: "50000",
      lotAllocations: [{ lotTransactionId: "b1", amountBtc: "1" }],
    }),
    entry({
      id: "s2",
      type: "sell",
      date: "2026-04-01T00:00:00.000Z",
      pricePerBtcEur: "40000",
      lotAllocations: [{ lotTransactionId: "b2", amountBtc: "1" }],
    }),
  ];

  it("sums the year's taxable gains and keeps the tax-free ones apart", () => {
    const fifo = computeFifo(entries, HOLDING_DAYS);
    const year = realizedInYear(fifo.disposals, 2026);

    expect(year.disposalCount).toBe(2);
    // s2 sold a lot bought two months earlier: 40 000 − 30 000.
    expect(year.taxableGainEur.toString()).toBe("10000");
    // s1 sold a lot held over two years: 50 000 − 20 000, and tax-free.
    expect(year.taxFreeGainEur.toString()).toBe("30000");
  });

  it("counts only the year asked for", () => {
    const fifo = computeFifo(entries, HOLDING_DAYS);
    expect(realizedInYear(fifo.disposals, 2025).disposalCount).toBe(0);
  });

  it("nets losses against gains rather than clamping them away", () => {
    const withLoss: LedgerEntry[] = [
      entry({ id: "b", type: "buy", date: "2026-01-01T00:00:00.000Z", pricePerBtcEur: "50000" }),
      entry({
        id: "s",
        type: "sell",
        date: "2026-02-01T00:00:00.000Z",
        pricePerBtcEur: "40000",
        lotAllocations: [{ lotTransactionId: "b", amountBtc: "1" }],
      }),
    ];
    const fifo = computeFifo(withLoss, HOLDING_DAYS);
    expect(realizedInYear(fifo.disposals, 2026).taxableGainEur.toString()).toBe("-10000");
  });
});

describe("feeTotals", () => {
  const closes = new Map<number, number>([
    [Date.UTC(2026, 0, 10), 40000],
    [Date.UTC(2026, 1, 10), 50000],
  ]);

  const entries: LedgerEntry[] = [
    entry({
      id: "b1",
      type: "buy",
      date: "2026-01-10T09:00:00.000Z",
      totalFiatEur: "20000",
      feeFiatEur: "25",
    }),
    entry({
      id: "t1",
      type: "transfer_out",
      date: "2026-02-10T09:00:00.000Z",
      amountBtc: "0.5",
      feeBtc: "0.0001",
      pricePerBtcEur: null,
    }),
  ];

  it("splits venue fees from miner fees and values BTC at its own day", () => {
    const totals = feeTotals(entries, closes);

    expect(totals.tradingEur.toString()).toBe("25");
    // 0.0001 BTC on a day worth 50 000 — not at any later price.
    expect(totals.networkEur.toString()).toBe("5");
    expect(totals.totalEur.toString()).toBe("30");
    expect(totals.totalBtc.toString()).toBe("0.0001");
    // 20 000 paid plus the 25 fee.
    expect(totals.investedEur.toString()).toBe("20025");
    expect(totals.shareOfInvested).toBeCloseTo(30 / 20025, 10);
  });

  it("reports a BTC fee it has no price for instead of dropping it", () => {
    const totals = feeTotals(entries, new Map());
    expect(totals.networkEur.toString()).toBe("0");
    expect(totals.unvaluedBtc.toString()).toBe("0.0001");
    // The BTC is still counted as BTC — only its EUR value is unknown.
    expect(totals.totalBtc.toString()).toBe("0.0001");
  });
});

describe("buyHeatmap", () => {
  const now = new Date(2026, 7, 11, 12, 0, 0);

  it("puts every buy on its local day and leaves the rest empty", () => {
    const local = (y: number, m: number, d: number) =>
      new Date(y, m, d, 10, 0, 0).toISOString();
    const map = buyHeatmap(
      [
        entry({ id: "b1", type: "buy", date: local(2026, 7, 1), totalFiatEur: "100" }),
        entry({ id: "b2", type: "buy", date: local(2026, 7, 1), totalFiatEur: "50" }),
        entry({ id: "b3", type: "buy", date: local(2026, 6, 1), totalFiatEur: "400" }),
        // Outside the window and therefore not in it.
        entry({ id: "old", type: "buy", date: local(2024, 1, 1), totalFiatEur: "999" }),
        // Not a buy.
        entry({ id: "s", type: "sell", date: local(2026, 7, 2) }),
      ],
      12,
      now,
    );

    expect(map.totalBuys).toBe(3);
    expect(map.maxEur.toString()).toBe("400");
    const busiest = map.days.find((d) => d.buyCount === 2);
    expect(busiest?.eur.toString()).toBe("150");
    // A dense series: one cell per day of the window, gaps included.
    expect(map.days.length).toBeGreaterThan(360);
    expect(map.days.every((d) => d.buyCount >= 0)).toBe(true);
  });
});

describe("tradeMarkers", () => {
  const at = (iso: string, over: Partial<Parameters<typeof entry>[0]> = {}) =>
    entry({ id: `b-${iso}-${JSON.stringify(over)}`, type: "buy", date: iso, ...over });

  it("places a trade at the price it was executed at", () => {
    // The bug this replaces: markers sat on the *market's* close of that day,
    // which is a price the user never traded at.
    const markers = tradeMarkers(
      [at("2026-03-02T10:00:00.000Z", { pricePerBtcEur: "58400" })],
      0,
      "day",
    );
    expect(markers.buys[0].priceEur.toString()).toBe("58400");
  });

  it("derives the price from the total when no rate was recorded", () => {
    const markers = tradeMarkers(
      [
        at("2026-03-02T10:00:00.000Z", {
          pricePerBtcEur: null,
          amountBtc: "0.5",
          totalFiatEur: "30000",
        }),
      ],
      0,
      "day",
    );
    expect(markers.buys[0].priceEur.toString()).toBe("60000");
  });

  it("weights a bucket's price by volume, not by trade count", () => {
    const markers = tradeMarkers(
      [
        at("2026-03-02T10:00:00.000Z", { amountBtc: "0.1", pricePerBtcEur: "50000" }),
        at("2026-03-03T10:00:00.000Z", { amountBtc: "0.9", pricePerBtcEur: "60000" }),
      ],
      0,
      "month",
    );
    // Volume-weighted: 59 000, not the 55 000 a plain average would give.
    expect(markers.buys).toHaveLength(1);
    expect(markers.buys[0].priceEur.toString()).toBe("59000");
    expect(markers.buys[0].count).toBe(2);
    expect(markers.buys[0].btc.toString()).toBe("1");
  });

  it("keeps entries and exits apart and ignores transfers", () => {
    const markers = tradeMarkers(
      [
        at("2026-03-02T10:00:00.000Z"),
        entry({ id: "s", type: "sell", date: "2026-03-02T11:00:00.000Z" }),
        entry({ id: "sp", type: "spend", date: "2026-03-02T12:00:00.000Z" }),
        entry({ id: "t", type: "transfer_out", date: "2026-03-02T13:00:00.000Z" }),
      ],
      0,
      "day",
    );
    expect(markers.buys).toHaveLength(1);
    // A spend is an exit too; a transfer is neither.
    expect(markers.sells[0].count).toBe(2);
    expect(markers.tradeCount).toBe(3);
  });

  it("reports a trade with no price instead of placing it at zero", () => {
    const markers = tradeMarkers(
      [at("2026-03-02T10:00:00.000Z", { pricePerBtcEur: null, totalFiatEur: null })],
      0,
      "day",
    );
    expect(markers.buys).toHaveLength(0);
    expect(markers.withoutPrice).toBe(1);
  });

  it("buckets weeks from Monday and months from the first", () => {
    // 2026-03-04 is a Wednesday; its week starts on Monday the 2nd.
    expect(bucketStart(Date.parse("2026-03-04T23:00:00.000Z"), "week")).toBe(
      Date.UTC(2026, 2, 2),
    );
    expect(bucketStart(Date.parse("2026-03-04T23:00:00.000Z"), "month")).toBe(
      Date.UTC(2026, 2, 1),
    );
  });
});

describe("tradeMarkersFor", () => {
  it("keeps a daily DCA readable by folding it into coarser buckets", () => {
    // 400 daily buys would be 400 dots, which is a band and not information.
    const daily = Array.from({ length: 400 }, (_, i) =>
      entry({
        id: `b${i}`,
        type: "buy",
        date: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString(),
        amountBtc: "0.001",
      }),
    );
    const markers = tradeMarkersFor(daily, 0);

    expect(markers.bucket).toBe("month");
    expect(markers.buys.length).toBeLessThanOrEqual(45);
    expect(markers.tradeCount).toBe(400);
    // Nothing is lost by aggregating: the BTC still adds up.
    expect(
      markers.buys.reduce((s, m) => s.plus(m.btc), dec(0)).toString(),
    ).toBe("0.4");
  });

  it("leaves a handful of trades at daily resolution", () => {
    const few = Array.from({ length: 5 }, (_, i) =>
      entry({
        id: `b${i}`,
        type: "buy",
        date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }),
    );
    expect(tradeMarkersFor(few, 0).bucket).toBe("day");
  });
});

describe("maxDrawdown", () => {
  it("measures the deepest fall from a previous peak", () => {
    const series = [
      { time: 1, value: 100 },
      { time: 2, value: 150 },
      { time: 3, value: 75 },
      { time: 4, value: 120 },
      { time: 5, value: 60 },
    ];
    const dd = maxDrawdown(series);

    // The fall from 150 to 60 is 60 %, deeper than 150 → 75.
    expect(dd.maxDrawdown).toBeCloseTo(0.6, 10);
    expect(dd.peakValue).toBe(150);
    expect(dd.troughValue).toBe(60);
    expect(dd.troughTime).toBe(5);
  });

  it("is zero for a series that only ever rises", () => {
    expect(
      maxDrawdown([
        { time: 1, value: 10 },
        { time: 2, value: 20 },
      ]).maxDrawdown,
    ).toBe(0);
  });
});

describe("timeInMarket", () => {
  it("counts from the first buy, not from the first transaction", () => {
    const now = new Date("2026-08-11T00:00:00.000Z");
    const result = timeInMarket(
      [
        entry({ id: "in", type: "transfer_in", date: "2024-01-01T00:00:00.000Z" }),
        entry({ id: "b1", type: "buy", date: "2025-08-11T00:00:00.000Z" }),
        entry({ id: "b2", type: "buy", date: "2026-01-01T00:00:00.000Z" }),
      ],
      now,
    );

    expect(result.firstBuyDate).toBe("2025-08-11T00:00:00.000Z");
    expect(result.days).toBe(365);
    expect(result.buysPerYear).toBeCloseTo(2, 10);
  });

  it("says nothing rather than zero when there is no buy", () => {
    expect(timeInMarket([]).firstBuyDate).toBeNull();
  });
});

describe("whatIf", () => {
  const entries: LedgerEntry[] = [
    entry({ id: "b1", type: "buy", date: "2026-01-01T00:00:00.000Z", pricePerBtcEur: "20000" }),
    // No EUR figure: part of the holding, but it carries no cost basis.
    entry({
      id: "in",
      type: "transfer_in",
      date: "2026-02-01T00:00:00.000Z",
      pricePerBtcEur: null,
    }),
  ];

  it("values only the coins that have a cost basis", () => {
    const fifo = computeFifo(entries, HOLDING_DAYS);
    const result = whatIf(fifo, 60000, 30000);

    // One BTC with a basis, not the two the portfolio holds — otherwise the
    // coins of unknown cost would show up as pure profit (§4.1).
    expect(result.valueEur.toString()).toBe("60000");
    expect(result.pnlEur?.toString()).toBe("40000");
    expect(result.pnlPct).toBeCloseTo(2, 10);
    expect(result.multiple).toBeCloseTo(2, 10);
  });
});
