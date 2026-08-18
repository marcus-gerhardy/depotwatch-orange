// Coins that arrived without being bought, and coins given away (§3.2).
//
// Each of these has a way of being quietly wrong that no screenshot would
// show. A gift dated from its arrival invents a holding period, and invents
// the most favourable one there is. Income booked as a purchase hides taxable
// income. A gift given away booked as a sale at zero proceeds reports the
// whole cost basis as a realised loss. All three are pinned here.

import { describe, expect, it } from "vitest";
import { computeFifo } from "./fifo";
import { flattenLedger, type PortfolioFile, type Transaction } from "./types";

const HOLDING_DAYS = 365;

function ledger(transactions: Transaction[]) {
  const p = {
    wallets: [
      {
        id: "w1",
        name: "Wallet",
        type: "software" as const,
        accounts: [{ id: "a1", name: "Main", transactions }],
      },
    ],
  } as unknown as PortfolioFile;
  return computeFifo(flattenLedger(p.wallets), HOLDING_DAYS);
}

const tx = (o: Partial<Transaction> & Pick<Transaction, "id" | "type" | "date">): Transaction => ({
  amountBtc: "1",
  pricePerBtcEur: null,
  note: "",
  ...o,
});

describe("a gift received", () => {
  it("keeps the giver's acquisition date, not the day it arrived", () => {
    // "Fußstapfentheorie": the recipient steps into the giver's shoes, so a
    // gift of coins bought years ago is past the holding period on arrival.
    const fifo = ledger([
      tx({
        id: "g",
        type: "gift_in",
        date: "2026-01-01T00:00:00.000Z",
        inheritedAcquisitionDate: "2020-06-01T00:00:00.000Z",
        inheritedCostBasisEur: "8000",
      }),
    ]);

    const lot = fifo.openLots[0];
    expect(lot.acquiredDate).toBe("2020-06-01T00:00:00.000Z");
    expect(lot.taxFreeDate.getUTCFullYear()).toBe(2021);
    expect(lot.originUnresolved).toBeUndefined();
    // The giver's cost travels with the coins.
    expect(lot.costPerBtcEur?.toString()).toBe("8000");
  });

  it("says so rather than dating an unknown acquisition from the arrival", () => {
    // The arrival date would be an assumption, and the one that happens to
    // start the holding period as late as possible — i.e. the answer least
    // likely to be right and most likely to be believed.
    const fifo = ledger([tx({ id: "g", type: "gift_in", date: "2026-01-01T00:00:00.000Z" })]);

    const lot = fifo.openLots[0];
    expect(lot.originUnresolved).toBe(true);
    expect(lot.costPerBtcEur).toBeNull();
  });
});

describe("coins received as income", () => {
  it("is an acquisition at the market value of the day, and starts its own holding period", () => {
    const fifo = ledger([
      tx({
        id: "i",
        type: "income",
        date: "2026-03-01T00:00:00.000Z",
        pricePerBtcEur: "50000",
        totalFiatEur: "50000",
      }),
    ]);

    expect(fifo.openLots[0].acquiredDate).toBe("2026-03-01T00:00:00.000Z");
    expect(fifo.openLots[0].costPerBtcEur?.toString()).toBe("50000");
  });

  it("is reported as income and never as a realised gain", () => {
    // It is taxed on receipt, outside private disposals — mixing it into the
    // realised figures would tax it a second time, under the wrong heading.
    const fifo = ledger([
      tx({
        id: "i",
        type: "income",
        date: "2026-03-01T00:00:00.000Z",
        pricePerBtcEur: "50000",
        totalFiatEur: "50000",
      }),
    ]);

    expect(fifo.incomeReceipts).toHaveLength(1);
    expect(fifo.incomeReceipts[0].valueEur?.toString()).toBe("50000");
    expect(fifo.disposals).toEqual([]);
    expect(fifo.realizedGainEur.toString()).toBe("0");
  });
});

describe("coins given away", () => {
  const entries = [
    tx({
      id: "b",
      type: "buy",
      date: "2026-01-01T00:00:00.000Z",
      pricePerBtcEur: "40000",
      totalFiatEur: "40000",
    }),
    tx({
      id: "g",
      type: "gift_out",
      date: "2026-06-01T00:00:00.000Z",
      lotAllocations: [{ lotTransactionId: "b", amountBtc: "1" }],
    }),
  ];

  it("closes the lots it names, like a sale does", () => {
    const fifo = ledger(entries);
    expect(fifo.openLotsBtc.toString()).toBe("0");
    expect(fifo.giftsOut).toHaveLength(1);
    expect(fifo.giftsOut[0].costBasisEur.toString()).toBe("40000");
  });

  it("is not a disposal, so it books no gain and no loss", () => {
    // At zero proceeds a sale would report the entire cost basis as a
    // realised loss — a number nobody may put in a tax return.
    const fifo = ledger(entries);
    expect(fifo.disposals).toEqual([]);
    expect(fifo.realizedGainEur.toString()).toBe("0");
    expect(fifo.realizedTaxableGainEur.toString()).toBe("0");
  });

  it("reports what no lot covered instead of inventing a basis", () => {
    const fifo = ledger([
      tx({ id: "g", type: "gift_out", date: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(fifo.giftsOut[0].uncoveredBtc.toString()).toBe("1");
    expect(fifo.giftsOut[0].costBasisEur.toString()).toBe("0");
  });
});

describe("selling coins that were a gift", () => {
  it("measures the holding period from the giver's acquisition", () => {
    const fifo = ledger([
      tx({
        id: "g",
        type: "gift_in",
        date: "2026-01-01T00:00:00.000Z",
        inheritedAcquisitionDate: "2020-06-01T00:00:00.000Z",
        inheritedCostBasisEur: "8000",
      }),
      tx({
        id: "s",
        type: "sell",
        date: "2026-02-01T00:00:00.000Z",
        pricePerBtcEur: "60000",
        totalFiatEur: "60000",
        lotAllocations: [{ lotTransactionId: "g", amountBtc: "1" }],
      }),
    ]);

    // Held (by the giver) for years: the gain is tax-free, and it is measured
    // against what the giver paid.
    const d = fifo.disposals[0];
    expect(d.taxFreeGainEur.toString()).toBe("52000");
    expect(d.taxableGainEur.toString()).toBe("0");
  });
});
