import { describe, it, expect } from "vitest";
import {
  derivedTransferValues,
  indexLedger,
  provenanceValue,
  resolveProvenance,
  unresolvedOriginIds,
  type Provenance,
} from "./provenance";
import { computeFifo } from "./fifo";
import { dec } from "./decimal";
import { flattenLedger, type LedgerEntry, type Transaction, type TransactionType } from "./types";

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

/** Wallet B (hardware) context for the receiving side. */
const inB = {
  walletId: "wB",
  walletName: "Ledger",
  accountId: "aB",
  accountName: "Account 1",
};
const inC = {
  walletId: "wC",
  walletName: "Hardware wallet",
  accountId: "aC",
  accountName: "Vault",
};

function buy(date: string, amount: string, price: string): LedgerEntry {
  return entry("buy", amount, { date, pricePerBtcEur: price });
}

function resolve(entries: LedgerEntry[], txId: string): Provenance {
  const index = indexLedger(entries);
  const target = entries.find((e) => e.id === txId)!;
  return resolveProvenance(target, index);
}

const sum = (p: Provenance) => p.origins.reduce((s, o) => s.plus(o.amountBtc), dec("0"));

describe("resolveProvenance", () => {
  it("resolves a single lot moved in full", () => {
    const b = buy("2023-01-10T10:00:00Z", "0.5", "20000");
    const out = entry("transfer_out", "0.5", {
      date: "2023-06-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.5" }],
    });
    const inLeg = entry("transfer_in", "0.5", {
      ...inB,
      date: "2023-06-01T00:10:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });

    const p = resolve([b, out, inLeg], inLeg.id);
    expect(p.status).toBe("resolved");
    expect(p.origins).toHaveLength(1);
    expect(p.origins[0].lotTxId).toBe(b.id);
    expect(p.origins[0].acquiredDate).toBe("2023-01-10T10:00:00Z");
    expect(p.origins[0].amountBtc.toString()).toBe("0.5");
    expect(p.origins[0].pricePerBtcEur!.toString()).toBe("20000");
    expect(p.origins[0].walletName).toBe("Exchange");
    expect(p.unresolvedBtc.toString()).toBe("0");
  });

  // The scenario from the spec: five buys in wallet A, bundled into one UTXO
  // that arrives in wallet B as a single transfer_in.
  it("unbundles five buys batched into one incoming transfer", () => {
    const buys = [
      buy("2022-02-01T00:00:00Z", "0.1", "30000"),
      buy("2022-05-01T00:00:00Z", "0.2", "28000"),
      buy("2022-08-01T00:00:00Z", "0.3", "20000"),
      buy("2023-01-01T00:00:00Z", "0.15", "16000"),
      buy("2023-04-01T00:00:00Z", "0.25", "25000"),
    ];
    // 1.0 BTC of lots leave, 0.9999 arrives — the network fee is on top.
    const out = entry("transfer_out", "0.9999", {
      date: "2023-07-01T00:00:00Z",
      feeBtc: "0.0001",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: buys.map((b) => ({
        lotTransactionId: b.id,
        amountBtc: b.amountBtc,
      })),
    });
    const inLeg = entry("transfer_in", "0.9999", {
      ...inB,
      date: "2023-07-01T00:30:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });

    const p = resolve([...buys, out, inLeg], inLeg.id);
    expect(p.status).toBe("resolved");
    expect(p.origins).toHaveLength(5);
    // Oldest acquisition first, each with its own original date and price.
    expect(p.origins.map((o) => o.acquiredDate)).toEqual(
      buys.map((b) => b.date),
    );
    expect(p.origins.map((o) => o.pricePerBtcEur!.toString())).toEqual([
      "30000",
      "28000",
      "20000",
      "16000",
      "25000",
    ]);
    // The shares add up to exactly the amount that arrived: the fee is borne
    // proportionally by the five lots, not by one of them.
    expect(sum(p).toString()).toBe("0.9999");
    expect(p.origins[0].amountBtc.toString()).toBe("0.09999");
    expect(p.unresolvedBtc.toString()).toBe("0");
  });

  it("tracks partial amounts when only part of a lot is transferred", () => {
    const b = buy("2023-01-10T00:00:00Z", "1", "20000");
    const out = entry("transfer_out", "0.4", {
      date: "2023-06-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.4" }],
    });
    const inLeg = entry("transfer_in", "0.4", {
      ...inB,
      date: "2023-06-01T01:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });

    const p = resolve([b, out, inLeg], inLeg.id);
    expect(p.status).toBe("resolved");
    expect(p.origins[0].amountBtc.toString()).toBe("0.4");
    expect(p.origins[0].costEur!.toString()).toBe("8000");
  });

  it("passes shares down proportionally across multiple hops (A → B → C)", () => {
    const b1 = buy("2022-01-01T00:00:00Z", "0.6", "10000");
    const b2 = buy("2022-06-01T00:00:00Z", "0.4", "20000");
    const outAB = entry("transfer_out", "1", {
      date: "2023-01-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [
        { lotTransactionId: b1.id, amountBtc: "0.6" },
        { lotTransactionId: b2.id, amountBtc: "0.4" },
      ],
    });
    const inB1 = entry("transfer_in", "1", {
      ...inB,
      date: "2023-01-01T01:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    // Half of the bundled arrival moves on to wallet C.
    const outBC = entry("transfer_out", "0.5", {
      ...inB,
      date: "2023-03-01T00:00:00Z",
      counterpartyAccountId: "aC",
      transferGroupId: "g2",
      lotAllocations: [{ lotTransactionId: inB1.id, amountBtc: "0.5" }],
    });
    const inC1 = entry("transfer_in", "0.5", {
      ...inC,
      date: "2023-03-01T01:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g2",
    });

    const p = resolve([b1, b2, outAB, inB1, outBC, inC1], inC1.id);
    expect(p.status).toBe("resolved");
    expect(p.origins).toHaveLength(2);
    // Half of each original lot, with the original dates intact two hops back.
    expect(p.origins[0].acquiredDate).toBe("2022-01-01T00:00:00Z");
    expect(p.origins[0].amountBtc.toString()).toBe("0.3");
    expect(p.origins[0].hops).toBe(2);
    expect(p.origins[1].acquiredDate).toBe("2022-06-01T00:00:00Z");
    expect(p.origins[1].amountBtc.toString()).toBe("0.2");
    expect(sum(p).toString()).toBe("0.5");
  });

  it("reports an unlinked incoming leg instead of inventing an origin", () => {
    const inLeg = entry("transfer_in", "0.25", {
      ...inB,
      date: "2023-06-01T00:00:00Z",
      counterpartyAccountId: "aA", // internal, but no transferGroupId
    });

    const p = resolve([inLeg], inLeg.id);
    expect(p.status).toBe("unlinked");
    expect(p.origins).toHaveLength(0);
    expect(p.unresolvedBtc.toString()).toBe("0.25");
  });

  it("treats an external receive as an origin of its own", () => {
    const inLeg = entry("transfer_in", "0.25", {
      ...inB,
      date: "2023-06-01T00:00:00Z",
      pricePerBtcEur: "25000",
    });

    const p = resolve([inLeg], inLeg.id);
    expect(p.status).toBe("origin");
    expect(p.origins).toHaveLength(1);
    expect(p.origins[0].lotTxId).toBe(inLeg.id);
    expect(p.origins[0].acquiredDate).toBe("2023-06-01T00:00:00Z");
  });

  it("reports the untraceable share when a referenced lot is gone", () => {
    const b = buy("2023-01-01T00:00:00Z", "0.5", "20000");
    const out = entry("transfer_out", "1", {
      date: "2023-06-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [
        { lotTransactionId: b.id, amountBtc: "0.5" },
        { lotTransactionId: "deleted-tx", amountBtc: "0.5" },
      ],
    });
    const inLeg = entry("transfer_in", "1", {
      ...inB,
      date: "2023-06-01T01:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });

    const p = resolve([b, out, inLeg], inLeg.id);
    expect(p.status).toBe("partial");
    expect(p.origins).toHaveLength(1);
    expect(p.resolvedBtc.toString()).toBe("0.5");
    expect(p.unresolvedBtc.toString()).toBe("0.5");
  });

  it("stops on a circular link instead of recursing forever", () => {
    // Two groups pointing at each other's in-leg — only possible with corrupt
    // data, and exactly what the path guard is for.
    const inOne = entry("transfer_in", "1", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    const inTwo = entry("transfer_in", "1", {
      counterpartyAccountId: "aB",
      transferGroupId: "g2",
    });
    const outOne = entry("transfer_out", "1", {
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: inTwo.id, amountBtc: "1" }],
    });
    const outTwo = entry("transfer_out", "1", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "g2",
      lotAllocations: [{ lotTransactionId: inOne.id, amountBtc: "1" }],
    });

    const p = resolve([inOne, inTwo, outOne, outTwo], inOne.id);
    expect(p.truncated).toBe(true);
    expect(p.unresolvedBtc.toString()).toBe("1");
  });

  it("resolves a sell through its own lot allocations", () => {
    const b1 = buy("2022-01-01T00:00:00Z", "0.5", "10000");
    const b2 = buy("2023-01-01T00:00:00Z", "0.5", "30000");
    const sell = entry("sell", "0.6", {
      date: "2024-01-01T00:00:00Z",
      pricePerBtcEur: "40000",
      lotAllocations: [
        { lotTransactionId: b1.id, amountBtc: "0.5" },
        { lotTransactionId: b2.id, amountBtc: "0.1" },
      ],
    });

    const p = resolve([b1, b2, sell], sell.id);
    expect(p.status).toBe("resolved");
    expect(p.origins.map((o) => o.amountBtc.toString())).toEqual(["0.5", "0.1"]);
  });
});

describe("the shares add up exactly", () => {
  /** One bundled transfer of `lots` with a network fee on top. */
  function bundledArrival(lots: string[], fee: string) {
    const buys = lots.map((l) => entry("buy", l, { pricePerBtcEur: "20000" }));
    const total = lots.reduce((s, l) => s.plus(dec(l)), dec("0"));
    const net = total.minus(dec(fee));
    const out = entry("transfer_out", net.toString(), {
      feeBtc: fee,
      counterpartyAccountId: "aB",
      transferGroupId: `g-${seq}`,
      lotAllocations: buys.map((b) => ({
        lotTransactionId: b.id,
        amountBtc: b.amountBtc,
      })),
    });
    const inLeg = entry("transfer_in", net.toString(), {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: out.transferGroupId,
    });
    return resolve([...buys, out, inLeg], inLeg.id);
  }

  it("leaves no rounding remainder on a proportional split", () => {
    // Proportional shares are ratios and mostly do not terminate in decimal, so
    // summing the rounded parts used to miss the total by ~1e-29. That is
    // invisible in any BTC figure but enough to report a "deviation of
    // 0,00000000" — the shares have to add up exactly, not almost.
    const p = bundledArrival(["0.1", "0.2"], "0.00001");
    expect(p.resolvedBtc.eq(p.amountBtc)).toBe(true);
    expect(p.resolvedBtc.minus(p.amountBtc).toString()).toBe("0");
  });

  it("holds for arbitrary lot sizes (fuzz)", () => {
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const lots = Array.from({ length: 2 + (i % 5) }, () =>
        (Math.floor(Math.random() * 100_000_000) / 100_000_000).toFixed(8),
      ).filter((l) => Number(l) > 0);
      if (lots.length < 2) continue;
      checked++;
      const p = bundledArrival(lots, "0.00001234");
      // Exact equality, not "close enough": the UI compares these two directly.
      expect({ lots, diff: p.resolvedBtc.minus(p.amountBtc).toString() }).toEqual({
        lots,
        diff: "0",
      });
      // And nothing is invented on the way: traced + untraceable is the amount.
      expect(p.resolvedBtc.plus(p.unresolvedBtc).eq(p.amountBtc)).toBe(true);
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("keeps adding up across hops and through a broken reference", () => {
    const b1 = buy("2022-01-01T00:00:00Z", "0.33333333", "10000");
    const b2 = buy("2022-06-01T00:00:00Z", "0.66666667", "20000");
    const outAB = entry("transfer_out", "0.99999", {
      feeBtc: "0.00001",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [
        { lotTransactionId: b1.id, amountBtc: "0.33333333" },
        { lotTransactionId: b2.id, amountBtc: "0.66666667" },
      ],
    });
    const inB1 = entry("transfer_in", "0.99999", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    const outBC = entry("transfer_out", "0.4999", {
      ...inB,
      feeBtc: "0.00001",
      counterpartyAccountId: "aC",
      transferGroupId: "g2",
      lotAllocations: [
        { lotTransactionId: inB1.id, amountBtc: "0.3" },
        { lotTransactionId: "deleted-tx", amountBtc: "0.2" },
      ],
    });
    const inC1 = entry("transfer_in", "0.4999", {
      ...inC,
      counterpartyAccountId: "aB",
      transferGroupId: "g2",
    });

    const p = resolve([b1, b2, outAB, inB1, outBC, inC1], inC1.id);
    expect(p.status).toBe("partial");
    expect(p.resolvedBtc.plus(p.unresolvedBtc).eq(p.amountBtc)).toBe(true);
  });
});

describe("unresolvedOriginIds", () => {
  it("lists internal arrivals whose origin cannot be traced, and nothing else", () => {
    const b = buy("2023-01-01T00:00:00Z", "1", "20000");
    const linkedOut = entry("transfer_out", "0.5", {
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.5" }],
    });
    const linkedIn = entry("transfer_in", "0.5", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    const orphanIn = entry("transfer_in", "0.2", {
      ...inB,
      counterpartyAccountId: "aA",
    });
    const externalIn = entry("transfer_in", "0.3", inB);

    const ids = unresolvedOriginIds([b, linkedOut, linkedIn, orphanIn, externalIn]);
    expect([...ids]).toEqual([orphanIn.id]);
  });
});

describe("resolver and FIFO engine agree", () => {
  it("derives the same lot dates and amounts for a bundled transfer", () => {
    const buys = [
      buy("2022-02-01T00:00:00Z", "0.1", "30000"),
      buy("2022-05-01T00:00:00Z", "0.2", "28000"),
      buy("2022-08-01T00:00:00Z", "0.3", "20000"),
    ];
    const out = entry("transfer_out", "0.6", {
      date: "2023-07-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: buys.map((b) => ({
        lotTransactionId: b.id,
        amountBtc: b.amountBtc,
      })),
    });
    const inLeg = entry("transfer_in", "0.6", {
      ...inB,
      date: "2023-07-01T00:30:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    const entries = [...buys, out, inLeg];

    const p = resolve(entries, inLeg.id);
    const fifoLots = computeFifo(entries, 365).openLots.filter(
      (l) => l.txId === inLeg.id,
    );

    // The engine re-creates one lot per moved origin in the receiving account;
    // the resolver explains the same arrival from the other direction.
    expect(fifoLots.map((l) => l.acquiredDate).sort()).toEqual(
      p.origins.map((o) => o.acquiredDate).sort(),
    );
    expect(
      fifoLots.map((l) => l.remainingBtc.toString()).sort(),
    ).toEqual(p.origins.map((o) => o.amountBtc.toString()).sort());
    for (const lot of fifoLots) {
      const origin = p.origins.find((o) => o.acquiredDate === lot.acquiredDate)!;
      expect(lot.costPerBtcEur!.toString()).toBe(origin.pricePerBtcEur!.toString());
    }
  });
});

describe("flattenLedger integration", () => {
  it("resolves provenance over a real wallet hierarchy", () => {
    const buyTx: Transaction = {
      id: "b1",
      type: "buy",
      date: "2023-01-01T00:00:00Z",
      amountBtc: "0.5",
      pricePerBtcEur: "20000",
      note: "",
    };
    const outTx: Transaction = {
      id: "o1",
      type: "transfer_out",
      date: "2023-06-01T00:00:00Z",
      amountBtc: "0.5",
      pricePerBtcEur: null,
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.5" }],
      note: "",
    };
    const inTx: Transaction = {
      id: "i1",
      type: "transfer_in",
      date: "2023-06-01T01:00:00Z",
      amountBtc: "0.5",
      pricePerBtcEur: null,
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
      note: "",
    };
    const entries = flattenLedger([
      {
        id: "wA",
        name: "Exchange",
        type: "exchange",
        accounts: [{ id: "aA", name: "Spot", transactions: [buyTx, outTx] }],
      },
      {
        id: "wB",
        name: "Ledger",
        type: "hardware",
        accounts: [{ id: "aB", name: "Account 1", transactions: [inTx] }],
      },
    ]);

    const p = resolve(entries, "i1");
    expect(p.status).toBe("resolved");
    expect(p.origins[0].walletName).toBe("Exchange");
    expect(p.origins[0].accountName).toBe("Spot");
  });
});

describe("provenanceValue", () => {
  /** 0.3 at 30 000 and 0.2 at 45 000 leave wallet A; 0.4999 arrives in B. */
  function bundled(secondPrice: string | null = "45000") {
    const b1 = buy("2023-01-01T00:00:00Z", "0.3", "30000");
    const b2 = entry("buy", "0.2", {
      date: "2023-02-01T00:00:00Z",
      pricePerBtcEur: secondPrice,
      totalFiatEur: secondPrice === null ? null : undefined,
    });
    const out = entry("transfer_out", "0.4999", {
      date: "2023-06-01T00:00:00Z",
      feeBtc: "0.0001",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [
        { lotTransactionId: b1.id, amountBtc: "0.3" },
        { lotTransactionId: b2.id, amountBtc: "0.2" },
      ],
    });
    const inLeg = entry("transfer_in", "0.4999", {
      ...inB,
      date: "2023-06-01T00:30:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    return { entries: [b1, b2, out, inLeg], inLeg, out };
  }

  it("is worth exactly the sum of the buys it moves, network fee and all", () => {
    const { entries, inLeg } = bundled();
    const value = provenanceValue(resolve(entries, inLeg.id))!;

    // 0.3 @ 30 000 plus 0.2 @ 45 000: the two buys show 9 000 + 9 000 in the
    // transaction table, and the transfer made of them has to show 18 000 —
    // the 0.0001 BTC burned as a fee was paid for with those same euros.
    expect(value.totalFiatEur.toFixed(2)).toBe("18000.00");
    expect(value.complete).toBe(true);
    // The rate follows from value ÷ amount, so the two never contradict each
    // other; it is above the buys' 36 000 by exactly what the fee cost.
    expect(value.pricePerBtcEur.toFixed(2)).toBe("36007.20");
    expect(value.pricePerBtcEur.mul(dec("0.4999")).toFixed(2)).toBe("18000.00");
  });

  it("gives the outgoing leg the same value", () => {
    const { entries, out } = bundled();
    const value = provenanceValue(resolve(entries, out.id))!;
    expect(value.totalFiatEur.toFixed(2)).toBe("18000.00");
    expect(value.complete).toBe(true);
  });

  it("leaves a lot without a known cost out instead of averaging it in", () => {
    const { entries, inLeg } = bundled(null);
    const value = provenanceValue(resolve(entries, inLeg.id))!;

    // Only the 30 000 lot can be valued — in full, at its own 9 000 — and the
    // rate must not be applied to the rest of the amount.
    expect(value.totalFiatEur.toFixed(2)).toBe("9000.00");
    expect(value.valuedBtc.toFixed(8)).toBe("0.29994000");
    expect(value.complete).toBe(false);
  });

  it("values a moved buy at its own recorded amount, fees and all", () => {
    // The buy shows "Betrag (EUR) 10 000" in the table; its tax cost basis is
    // 10 050 over 0.499 BTC (fiat fee on top, BTC fee off the amount). Moving
    // it in full must be worth what the buy shows, not what it cost.
    const b = entry("buy", "0.5", {
      date: "2023-01-01T00:00:00Z",
      pricePerBtcEur: "20000",
      totalFiatEur: "10000",
      feeFiatEur: "50",
      feeBtc: "0.001",
    });
    const out = entry("transfer_out", "0.499", {
      date: "2023-06-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.499" }],
    });
    const inLeg = entry("transfer_in", "0.499", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });

    const p = resolve([b, out, inLeg], inLeg.id);
    expect(provenanceValue(p)!.totalFiatEur.toFixed(2)).toBe("10000.00");
    // The cost basis is still available for the tax side, and differs.
    expect(p.origins[0].costEur!.toFixed(2)).toBe("10050.00");
  });

  it("splits a partly moved buy in proportion to its recorded amount", () => {
    const b = entry("buy", "1", {
      date: "2023-01-01T00:00:00Z",
      pricePerBtcEur: "20000",
      totalFiatEur: "20000",
    });
    const out = entry("transfer_out", "0.25", {
      date: "2023-06-01T00:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.25" }],
    });
    const inLeg = entry("transfer_in", "0.25", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });

    const value = provenanceValue(resolve([b, out, inLeg], inLeg.id))!;
    expect(value.totalFiatEur.toFixed(2)).toBe("5000.00");
    expect(value.pricePerBtcEur.toFixed(2)).toBe("20000.00");
  });

  it("has no value for an arrival whose origin does not resolve", () => {
    const inLeg = entry("transfer_in", "0.5", {
      ...inB,
      counterpartyAccountId: "aA",
      transferGroupId: "gone",
    });
    expect(provenanceValue(resolve([inLeg], inLeg.id))).toBeNull();
  });

  it("keeps the value whole across several hops, each with its own fee", () => {
    // A → B → C, 0.001 BTC network fee per hop. However often the coins move,
    // the value stays what the buy behind them cost.
    const b = entry("buy", "1", {
      date: "2023-01-01T00:00:00Z",
      pricePerBtcEur: "20000",
      totalFiatEur: "20000",
    });
    const outAB = entry("transfer_out", "0.999", {
      date: "2023-02-01T00:00:00Z",
      feeBtc: "0.001",
      counterpartyAccountId: "aB",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: b.id, amountBtc: "1" }],
    });
    const inB1 = entry("transfer_in", "0.999", {
      ...inB,
      date: "2023-02-01T01:00:00Z",
      counterpartyAccountId: "aA",
      transferGroupId: "g1",
    });
    const outBC = entry("transfer_out", "0.998", {
      ...inB,
      date: "2023-03-01T00:00:00Z",
      feeBtc: "0.001",
      counterpartyAccountId: "aC",
      transferGroupId: "g2",
      lotAllocations: [{ lotTransactionId: inB1.id, amountBtc: "0.999" }],
    });
    const inC1 = entry("transfer_in", "0.998", {
      ...inC,
      date: "2023-03-01T01:00:00Z",
      counterpartyAccountId: "aB",
      transferGroupId: "g2",
    });

    const entries = [b, outAB, inB1, outBC, inC1];
    expect(provenanceValue(resolve(entries, inC1.id))!.totalFiatEur.toFixed(2)).toBe(
      "20000.00",
    );
  });

  it("leaves a receive from outside the ledger with its own figures", () => {
    // Its own origin: nothing to compute from, and recomputing would replace
    // the recorded rate with total ÷ amount.
    const external = entry("transfer_in", "0.5", {
      ...inB,
      pricePerBtcEur: "50000",
      totalFiatEur: "24000",
    });
    expect(derivedTransferValues([external]).has(external.id)).toBe(false);
  });

  it("derives both legs of a transfer in one pass", () => {
    const { entries, inLeg, out } = bundled();
    const values = derivedTransferValues(entries);
    expect([...values.keys()].sort()).toEqual([inLeg.id, out.id].sort());
    // Buys are not transfers: they keep their own recorded figures.
    expect(values.has(entries[0].id)).toBe(false);
  });
});
