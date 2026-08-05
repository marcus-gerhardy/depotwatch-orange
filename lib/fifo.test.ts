import { describe, it, expect } from "vitest";
import { allocateFifo, computeFifo, daysUntilTaxFree, isLotTaxFree } from "./fifo";
import { dec } from "./decimal";
import { flattenLedger } from "./types";
import type { LedgerEntry, TransactionType, Wallet } from "./types";

let seq = 0;
function entry(
  type: TransactionType,
  date: string,
  amountBtc: string,
  pricePerBtcEur: string | null = null,
  extra: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    id: `tx-${++seq}`,
    type,
    date,
    amountBtc,
    pricePerBtcEur,
    feeBtc: "0",
    feeFiatEur: "0",
    note: "",
    walletId: "w1",
    walletName: "Kraken",
    accountId: "a1",
    accountName: "Spot",
    ...extra,
  };
}

describe("computeFifo", () => {
  it("accumulates buys into open lots", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "40000"),
        entry("buy", "2024-06-01T00:00:00Z", "0.5", "60000"),
      ],
      365,
    );
    expect(r.openLotsBtc.toString()).toBe("1.5");
    expect(r.openLots).toHaveLength(2);
    expect(r.openCostBasisEur.toString()).toBe("70000");
    // (40000 + 30000) / 1.5
    expect(r.avgCostPerBtcEur!.toFixed(2)).toBe("46666.67");
  });

  it("consumes oldest lots first on sell (FIFO order)", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "40000"),
        entry("buy", "2024-06-01T00:00:00Z", "1", "60000"),
        entry("sell", "2024-07-01T00:00:00Z", "1.2", "65000"),
      ],
      365,
    );
    expect(r.openLots).toHaveLength(1);
    // 0.8 remains from the second (June) lot.
    expect(r.openLots[0].remainingBtc.toString()).toBe("0.8");
    expect(r.openLots[0].acquiredDate).toBe("2024-06-01T00:00:00Z");
    const d = r.disposals[0];
    // cost: 1.0 * 40000 + 0.2 * 60000 = 52000, proceeds: 1.2 * 65000 = 78000
    expect(d.costBasisEur.toString()).toBe("52000");
    expect(d.gainEur.toString()).toBe("26000");
  });

  it("splits gains into taxable and tax-free by holding period", () => {
    const r = computeFifo(
      [
        entry("buy", "2023-01-01T00:00:00Z", "1", "20000"),
        entry("buy", "2024-06-01T00:00:00Z", "1", "60000"),
        // First lot held ~1.5 years (tax-free), second ~2 months (taxable).
        entry("sell", "2024-08-01T00:00:00Z", "1.5", "70000"),
      ],
      365,
    );
    const d = r.disposals[0];
    // proceeds 105000, split pro-rata: 70000 on lot1, 35000 on lot2 half
    expect(d.taxFreeGainEur.toString()).toBe("50000"); // 70000 - 20000
    expect(d.taxableGainEur.toString()).toBe("5000"); // 35000 - 30000
    expect(d.gainEur.toString()).toBe("55000");
  });

  it("boundary: exactly holdingPeriodDays is still taxable, one day more is free", () => {
    const base = [entry("buy", "2024-01-01T00:00:00Z", "1", "20000")];
    const atLimit = computeFifo(
      [...base, entry("sell", "2024-12-31T00:00:00Z", "1", "30000")],
      365,
    );
    expect(atLimit.disposals[0].taxableGainEur.toString()).toBe("10000");
    expect(atLimit.disposals[0].taxFreeGainEur.toString()).toBe("0");

    seq = 0;
    const past = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "20000"),
        entry("sell", "2025-01-02T00:00:00Z", "1", "30000"),
      ],
      365,
    );
    expect(past.disposals[0].taxFreeGainEur.toString()).toBe("10000");
    expect(past.disposals[0].taxableGainEur.toString()).toBe("0");
  });

  it("internal transfers keep acquisition date and are not disposals", () => {
    const r = computeFifo(
      [
        entry("buy", "2023-01-01T00:00:00Z", "1", "20000"),
        entry("transfer_out", "2024-01-15T00:00:00Z", "1", null, {
          counterpartyAccountId: "a2",
        }),
        entry("transfer_in", "2024-01-15T00:00:00Z", "1", null, {
          counterpartyAccountId: "a1",
          accountId: "a2",
          accountName: "Cold",
        }),
        entry("sell", "2024-06-01T00:00:00Z", "1", "60000"),
      ],
      365,
    );
    expect(r.disposals).toHaveLength(1);
    // Held since 2023-01-01 → > 1 year → tax-free despite the transfer.
    expect(r.disposals[0].taxFreeGainEur.toString()).toBe("40000");
    expect(r.disposals[0].taxableGainEur.toString()).toBe("0");
  });

  it("transfer fee in BTC reduces holdings from oldest lot", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "40000"),
        entry("transfer_out", "2024-02-01T00:00:00Z", "1", null, {
          counterpartyAccountId: "a2",
          feeBtc: "0.0001",
        }),
        entry("transfer_in", "2024-02-01T00:00:00Z", "0.9999", null, {
          counterpartyAccountId: "a1",
        }),
      ],
      365,
    );
    expect(r.openLotsBtc.toString()).toBe("0.9999");
  });

  it("external transfer_in creates a lot with unknown basis", () => {
    const r = computeFifo(
      [entry("transfer_in", "2024-01-01T00:00:00Z", "0.5", null)],
      365,
    );
    expect(r.openLotsBtc.toString()).toBe("0.5");
    expect(r.openLots[0].costPerBtcEur).toBeNull();
    expect(r.avgCostPerBtcEur).toBeNull();
  });

  it("spend behaves like sell for tax purposes", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "40000"),
        entry("spend", "2024-03-01T00:00:00Z", "0.1", "50000"),
      ],
      365,
    );
    expect(r.disposals[0].type).toBe("spend");
    expect(r.disposals[0].taxableGainEur.toString()).toBe("1000");
    expect(r.openLotsBtc.toString()).toBe("0.9");
  });

  it("fiat fees adjust cost basis (buy) and proceeds (sell)", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "40000", {
          feeFiatEur: "100",
        }),
        entry("sell", "2024-02-01T00:00:00Z", "1", "50000", {
          feeFiatEur: "50",
        }),
      ],
      365,
    );
    // proceeds 49950 - cost 40100 = 9850
    expect(r.disposals[0].gainEur.toString()).toBe("9850");
  });

  it("selling more than held reports uncovered amount instead of crashing", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "0.5", "40000"),
        entry("sell", "2024-02-01T00:00:00Z", "1", "50000"),
      ],
      365,
    );
    expect(r.disposals[0].uncoveredBtc.toString()).toBe("0.5");
    expect(r.openLotsBtc.toString()).toBe("0");
  });

  it("uses exact decimal arithmetic (no float drift)", () => {
    const entries: LedgerEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(entry("buy", `2024-01-0${(i % 9) + 1}T00:00:00Z`, "0.1", "30000"));
    }
    const r = computeFifo(entries, 365);
    expect(r.openLotsBtc.toString()).toBe("1"); // 0.1 * 10 === 1 exactly
  });

  it("persisted lotAllocations beat FIFO order (targeted lot sale)", () => {
    const buyOld = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
    const buyNew = entry("buy", "2024-06-01T00:00:00Z", "1", "60000");
    const r = computeFifo(
      [
        buyOld,
        buyNew,
        entry("sell", "2024-07-01T00:00:00Z", "0.5", "65000", {
          lotAllocations: [
            { lotTransactionId: buyNew.id, amountBtc: "0.5" },
          ],
        }),
      ],
      365,
    );
    // The old lot stays untouched; the newer one shrinks.
    const oldLot = r.openLots.find((l) => l.txId === buyOld.id)!;
    const newLot = r.openLots.find((l) => l.txId === buyNew.id)!;
    expect(oldLot.remainingBtc.toString()).toBe("1");
    expect(newLot.remainingBtc.toString()).toBe("0.5");
    // cost 0.5 × 60000 = 30000, proceeds 0.5 × 65000 = 32500
    expect(r.disposals[0].costBasisEur.toString()).toBe("30000");
    expect(r.disposals[0].gainEur.toString()).toBe("2500");
    expect(r.disposals[0].uncoveredBtc.toString()).toBe("0");
  });

  it("allocations are not re-derived: earlier-dated buys added later stay open", () => {
    const buy = entry("buy", "2024-06-01T00:00:00Z", "1", "60000");
    const sell = entry("sell", "2024-07-01T00:00:00Z", "1", "65000", {
      lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "1" }],
    });
    // A buy with an older date entered after the sell was created.
    const lateOldBuy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
    const r = computeFifo([lateOldBuy, buy, sell], 365);
    // FIFO would have consumed the 2023 lot; allocations pin the 2024 one.
    const kept = r.openLots.find((l) => l.txId === lateOldBuy.id)!;
    expect(kept.remainingBtc.toString()).toBe("1");
    expect(r.disposals[0].costBasisEur.toString()).toBe("60000");
  });

  it("allocation to a missing lot is reported as uncovered", () => {
    const r = computeFifo(
      [
        entry("buy", "2024-01-01T00:00:00Z", "1", "40000"),
        entry("sell", "2024-02-01T00:00:00Z", "0.5", "50000", {
          lotAllocations: [
            { lotTransactionId: "deleted-tx", amountBtc: "0.5" },
          ],
        }),
      ],
      365,
    );
    expect(r.disposals[0].uncoveredBtc.toString()).toBe("0.5");
    // The existing lot is untouched.
    expect(r.openLots[0].remainingBtc.toString()).toBe("1");
  });

  it("allocateFifo prefers the sell account's lots, oldest first, split as needed", () => {
    const r = computeFifo(
      [
        entry("buy", "2023-01-01T00:00:00Z", "0.4", "20000", {
          accountId: "a2",
          accountName: "Cold",
        }),
        entry("buy", "2024-01-01T00:00:00Z", "0.3", "40000"),
        entry("buy", "2024-06-01T00:00:00Z", "0.3", "60000"),
      ],
      365,
    );
    const allocs = allocateFifo(r.openLots, dec("0.7"), "a1");
    // Both a1 lots first (oldest first), then the a2 lot for the remainder.
    expect(allocs.map((a) => a.amountBtc)).toEqual(["0.3", "0.3", "0.1"]);
    const a2Lot = r.openLots.find((l) => l.accountId === "a2")!;
    expect(allocs[2].lotTransactionId).toBe(a2Lot.txId);
    const a1LotIds = r.openLots
      .filter((l) => l.accountId === "a1")
      .map((l) => l.txId);
    expect(a1LotIds).toContain(allocs[0].lotTransactionId);
    expect(a1LotIds).toContain(allocs[1].lotTransactionId);
  });

  it("lot-moving transfer keeps acquisition date and cost basis in the target account", () => {
    const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
    const r = computeFifo(
      [
        buy,
        entry("transfer_out", "2024-01-15T00:00:00Z", "1", null, {
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "1" }],
        }),
        entry("transfer_in", "2024-01-15T00:00:00Z", "1", null, {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    expect(r.openLots).toHaveLength(1);
    const lot = r.openLots[0];
    // The lot now lives in the target account but keeps its origin data.
    expect(lot.accountId).toBe("a2");
    expect(lot.acquiredDate).toBe("2023-01-01T00:00:00Z");
    expect(lot.costPerBtcEur!.toString()).toBe("20000");
    expect(r.openLotsBtc.toString()).toBe("1");
  });

  describe("fullyTransferredLots", () => {
    it("marks a lot fully closed by a single internal transfer", () => {
      const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
      const out = entry("transfer_out", "2024-01-15T00:00:00Z", "1", null, {
        counterpartyAccountId: "a2",
        transferGroupId: "g1",
        lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "1" }],
      });
      const r = computeFifo(
        [
          buy,
          out,
          entry("transfer_in", "2024-01-15T00:00:00Z", "1", null, {
            counterpartyAccountId: "a1",
            transferGroupId: "g1",
            accountId: "a2",
            accountName: "Cold",
          }),
        ],
        365,
      );
      const info = r.fullyTransferredLots.get(buy.id);
      expect(info).toBeDefined();
      expect(info!.amountBtc.toString()).toBe("1");
      expect(info!.transfers).toHaveLength(1);
      expect(info!.transfers[0]).toMatchObject({
        transferOutTxId: out.id,
        transferGroupId: "g1",
        counterpartyAccountId: "a2",
        date: "2024-01-15T00:00:00Z",
      });
      expect(info!.transfers[0].amountBtc.toString()).toBe("1");
    });

    it("does not mark a lot with a remaining balance (partial transfer)", () => {
      const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
      const r = computeFifo(
        [
          buy,
          entry("transfer_out", "2024-01-15T00:00:00Z", "0.4", null, {
            counterpartyAccountId: "a2",
            transferGroupId: "g1",
            lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.4" }],
          }),
          entry("transfer_in", "2024-01-15T00:00:00Z", "0.4", null, {
            counterpartyAccountId: "a1",
            transferGroupId: "g1",
            accountId: "a2",
            accountName: "Cold",
          }),
        ],
        365,
      );
      expect(r.fullyTransferredLots.has(buy.id)).toBe(false);
      expect(r.openLots.find((l) => l.txId === buy.id)?.remainingBtc.toString()).toBe(
        "0.6",
      );
    });

    it("sums several separate transfers that together close the lot", () => {
      const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
      const r = computeFifo(
        [
          buy,
          entry("transfer_out", "2024-01-15T00:00:00Z", "0.4", null, {
            counterpartyAccountId: "a2",
            transferGroupId: "g1",
            lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.4" }],
          }),
          entry("transfer_in", "2024-01-15T00:00:00Z", "0.4", null, {
            counterpartyAccountId: "a1",
            transferGroupId: "g1",
            accountId: "a2",
            accountName: "Cold",
          }),
          entry("transfer_out", "2024-03-01T00:00:00Z", "0.6", null, {
            counterpartyAccountId: "a3",
            transferGroupId: "g2",
            lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.6" }],
          }),
          entry("transfer_in", "2024-03-01T00:00:00Z", "0.6", null, {
            counterpartyAccountId: "a1",
            transferGroupId: "g2",
            accountId: "a3",
            accountName: "Savings",
          }),
        ],
        365,
      );
      const info = r.fullyTransferredLots.get(buy.id);
      expect(info).toBeDefined();
      expect(info!.amountBtc.toString()).toBe("1");
      expect(info!.transfers).toHaveLength(2);
    });

    it("does not mark a lot closed by a mix of transfer and sale", () => {
      const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
      const r = computeFifo(
        [
          buy,
          entry("transfer_out", "2024-01-15T00:00:00Z", "0.4", null, {
            counterpartyAccountId: "a2",
            transferGroupId: "g1",
            lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.4" }],
          }),
          entry("transfer_in", "2024-01-15T00:00:00Z", "0.4", null, {
            counterpartyAccountId: "a1",
            transferGroupId: "g1",
            accountId: "a2",
            accountName: "Cold",
          }),
          entry("sell", "2024-02-01T00:00:00Z", "0.6", "70000", {
            lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.6" }],
          }),
        ],
        365,
      );
      expect(r.fullyTransferredLots.has(buy.id)).toBe(false);
    });

    it("aggregates a bundled (multi-origin) transfer_in lot before judging closure", () => {
      const buy1 = entry("buy", "2023-01-01T00:00:00Z", "0.4", "20000");
      const buy2 = entry("buy", "2024-06-01T00:00:00Z", "0.6", "60000");
      const bundledOut = entry("transfer_out", "2024-07-01T00:00:00Z", "1", null, {
        counterpartyAccountId: "a2",
        transferGroupId: "g1",
        lotAllocations: [
          { lotTransactionId: buy1.id, amountBtc: "0.4" },
          { lotTransactionId: buy2.id, amountBtc: "0.6" },
        ],
      });
      const bundledIn = entry("transfer_in", "2024-07-01T00:00:00Z", "1", null, {
        counterpartyAccountId: "a1",
        transferGroupId: "g1",
        accountId: "a2",
        accountName: "Cold",
      });
      // The bundled lot (one txId, two origin parts) is then fully moved onward.
      const secondOut = entry("transfer_out", "2024-08-01T00:00:00Z", "1", null, {
        counterpartyAccountId: "a3",
        transferGroupId: "g2",
        lotAllocations: [{ lotTransactionId: bundledIn.id, amountBtc: "1" }],
        accountId: "a2",
        accountName: "Cold",
      });
      const r = computeFifo(
        [
          buy1,
          buy2,
          bundledOut,
          bundledIn,
          secondOut,
          entry("transfer_in", "2024-08-01T00:00:00Z", "1", null, {
            counterpartyAccountId: "a2",
            transferGroupId: "g2",
            accountId: "a3",
            accountName: "Savings",
          }),
        ],
        365,
      );
      // The origin buys were themselves fully moved into the bundle transfer.
      expect(r.fullyTransferredLots.get(buy1.id)?.transfers[0].transferOutTxId).toBe(
        bundledOut.id,
      );
      expect(r.fullyTransferredLots.get(buy2.id)?.transfers[0].transferOutTxId).toBe(
        bundledOut.id,
      );
      // The re-created bundled lot (one txId, two origin parts) was then fully
      // moved onward by a single further transfer.
      const info = r.fullyTransferredLots.get(bundledIn.id);
      expect(info).toBeDefined();
      expect(info!.amountBtc.toString()).toBe("1");
      // One leg per origin part consumed (0.4 + 0.6), both from the same transfer.
      expect(info!.transfers).toHaveLength(2);
      expect(info!.transfers.every((t) => t.transferOutTxId === secondOut.id)).toBe(
        true,
      );
    });
  });

  it("batched transfer moves several lots at once, each keeping its identity", () => {
    const buy1 = entry("buy", "2023-01-01T00:00:00Z", "0.4", "20000");
    const buy2 = entry("buy", "2024-06-01T00:00:00Z", "0.6", "60000");
    const r = computeFifo(
      [
        buy1,
        buy2,
        entry("transfer_out", "2024-07-01T00:00:00Z", "1", null, {
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          lotAllocations: [
            { lotTransactionId: buy1.id, amountBtc: "0.4" },
            { lotTransactionId: buy2.id, amountBtc: "0.6" },
          ],
        }),
        entry("transfer_in", "2024-07-01T00:00:00Z", "1", null, {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
        // Sell everything: the old 0.4 must be tax-free, the young 0.6 not.
        entry("sell", "2024-08-01T00:00:00Z", "1", "70000", {
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    const d = r.disposals[0];
    // tax-free: 0.4 × (70000 − 20000) = 20000; taxable: 0.6 × (70000 − 60000)
    expect(d.taxFreeGainEur.toString()).toBe("20000");
    expect(d.taxableGainEur.toString()).toBe("6000");
    expect(d.uncoveredBtc.toString()).toBe("0");
  });

  it("lot identity survives multiple transfer hops", () => {
    const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
    const hop1out = entry("transfer_out", "2023-06-01T00:00:00Z", "1", null, {
      counterpartyAccountId: "a2",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "1" }],
    });
    const hop1in = entry("transfer_in", "2023-06-01T00:00:00Z", "1", null, {
      counterpartyAccountId: "a1",
      transferGroupId: "g1",
      accountId: "a2",
      accountName: "Cold",
    });
    const hop2out = entry("transfer_out", "2023-12-01T00:00:00Z", "1", null, {
      counterpartyAccountId: "a3",
      transferGroupId: "g2",
      accountId: "a2",
      accountName: "Cold",
      lotAllocations: [{ lotTransactionId: hop1in.id, amountBtc: "1" }],
    });
    const hop2in = entry("transfer_in", "2023-12-01T00:00:00Z", "1", null, {
      counterpartyAccountId: "a2",
      transferGroupId: "g2",
      accountId: "a3",
      accountName: "Vault",
    });
    const r = computeFifo(
      [
        buy,
        hop1out,
        hop1in,
        hop2out,
        hop2in,
        // > 1 year after the ORIGINAL buy, < 1 year after both transfers.
        entry("sell", "2024-02-01T00:00:00Z", "1", "60000", {
          accountId: "a3",
          accountName: "Vault",
        }),
      ],
      365,
    );
    const d = r.disposals[0];
    expect(d.taxFreeGainEur.toString()).toBe("40000");
    expect(d.taxableGainEur.toString()).toBe("0");
    expect(d.parts[0].acquiredDate).toBe("2023-01-01T00:00:00Z");
  });

  it("BTC fee of a lot-moving transfer never re-materializes", () => {
    const buy = entry("buy", "2024-01-01T00:00:00Z", "1", "40000");
    const r = computeFifo(
      [
        buy,
        entry("transfer_out", "2024-02-01T00:00:00Z", "1", null, {
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          feeBtc: "0.0001",
          lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "1" }],
        }),
        entry("transfer_in", "2024-02-01T00:00:00Z", "0.9999", null, {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    expect(r.openLotsBtc.toString()).toBe("0.9999");
    expect(r.openLots[0].acquiredDate).toBe("2024-01-01T00:00:00Z");
    expect(r.openLots[0].costPerBtcEur!.toString()).toBe("40000");
  });

  it("partial transfer splits the lot between source and target account", () => {
    const buy = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
    const out = entry("transfer_out", "2024-01-15T00:00:00Z", "0.3", null, {
      counterpartyAccountId: "a2",
      transferGroupId: "g1",
      lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.3" }],
    });
    const r = computeFifo(
      [
        buy,
        out,
        entry("transfer_in", "2024-01-15T00:00:00Z", "0.3", null, {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    expect(r.openLots).toHaveLength(2);
    const src = r.openLots.find((l) => l.accountId === "a1")!;
    const dst = r.openLots.find((l) => l.accountId === "a2")!;
    expect(src.remainingBtc.toString()).toBe("0.7");
    expect(dst.remainingBtc.toString()).toBe("0.3");
    // Both halves keep the original acquisition date.
    expect(src.acquiredDate).toBe("2023-01-01T00:00:00Z");
    expect(dst.acquiredDate).toBe("2023-01-01T00:00:00Z");
  });

  it("transfer_in beyond what the out-leg moved becomes an unknown-basis lot", () => {
    const buy = entry("buy", "2024-01-01T00:00:00Z", "0.5", "40000");
    const r = computeFifo(
      [
        buy,
        entry("transfer_out", "2024-02-01T00:00:00Z", "0.5", null, {
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.5" }],
        }),
        // Data gap: 0.8 recorded as arriving although only 0.5 left.
        entry("transfer_in", "2024-02-01T00:00:00Z", "0.8", null, {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    expect(r.openLotsBtc.toString()).toBe("0.8");
    const known = r.openLots.find((l) => l.costPerBtcEur !== null)!;
    const unknown = r.openLots.find((l) => l.costPerBtcEur === null)!;
    expect(known.acquiredDate).toBe("2024-01-01T00:00:00Z");
    expect(known.remainingBtc.toString()).toBe("0.5");
    // The surplus starts fresh at the arrival date with unknown basis.
    expect(unknown.acquiredDate).toBe("2024-02-01T00:00:00Z");
    expect(unknown.remainingBtc.toString()).toBe("0.3");
    // And its date is flagged as an assumption, so no tax statement rests on it.
    expect(unknown.originUnresolved).toBe(true);
    expect(known.originUnresolved).toBeUndefined();
  });

  it("carries an unresolved origin into the disposal that consumes it", () => {
    const buy = entry("buy", "2024-01-01T00:00:00Z", "0.5", "40000");
    const r = computeFifo(
      [
        buy,
        entry("transfer_out", "2024-02-01T00:00:00Z", "0.5", null, {
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.5" }],
        }),
        entry("transfer_in", "2024-02-01T00:00:00Z", "0.8", null, {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
        // Sells the whole arrival: 0.5 traced, 0.3 from the unexplained surplus.
        entry("sell", "2024-03-01T00:00:00Z", "0.8", "60000", {
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    const d = r.disposals[0];
    expect(d.unresolvedOriginBtc.toString()).toBe("0.3");
    expect(d.parts.filter((p) => p.originUnresolved)).toHaveLength(1);
  });

  it("never treats a transfer leg itself as a taxable disposal", () => {
    const buy = entry("buy", "2024-01-01T00:00:00Z", "1", "40000");
    const r = computeFifo(
      [
        buy,
        entry("transfer_out", "2024-02-01T00:00:00Z", "1", "50000", {
          feeBtc: "0.0001",
          counterpartyAccountId: "a2",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "1" }],
        }),
        entry("transfer_in", "2024-02-01T00:00:00Z", "0.9999", "50000", {
          counterpartyAccountId: "a1",
          transferGroupId: "g1",
          accountId: "a2",
          accountName: "Cold",
        }),
        // An external send is not a disposal either: coins leave, no proceeds.
        entry("transfer_out", "2024-03-01T00:00:00Z", "0.4", null, {
          accountId: "a2",
          accountName: "Cold",
        }),
      ],
      365,
    );
    // A price on a transfer leg is display data (§3.2) and must not become a gain.
    expect(r.disposals).toHaveLength(0);
    expect(r.realizedGainEur.toString()).toBe("0");
    expect(r.realizedTaxableGainEur.toString()).toBe("0");
  });

  it("external transfer_out honors persisted lot allocations", () => {
    const buyOld = entry("buy", "2023-01-01T00:00:00Z", "1", "20000");
    const buyNew = entry("buy", "2024-06-01T00:00:00Z", "1", "60000");
    const r = computeFifo(
      [
        buyOld,
        buyNew,
        // Send the NEWER lot out of the portfolio (no counterparty).
        entry("transfer_out", "2024-07-01T00:00:00Z", "1", null, {
          lotAllocations: [{ lotTransactionId: buyNew.id, amountBtc: "1" }],
        }),
      ],
      365,
    );
    expect(r.openLots).toHaveLength(1);
    expect(r.openLots[0].txId).toBe(buyOld.id);
  });

  it("lot helpers report tax-free status and countdown", () => {
    const r = computeFifo(
      [entry("buy", "2024-01-01T00:00:00Z", "1", "40000")],
      365,
    );
    const lot = r.openLots[0];
    expect(isLotTaxFree(lot, new Date("2024-06-01T00:00:00Z"))).toBe(false);
    expect(isLotTaxFree(lot, new Date("2025-01-02T00:00:00Z"))).toBe(true);
    // 2024 is a leap year: tax-free from 2025-01-01 (366 days > 365).
    expect(daysUntilTaxFree(lot, new Date("2024-12-31T00:00:00Z"))).toBe(1);
    expect(daysUntilTaxFree(lot, new Date("2025-02-01T00:00:00Z"))).toBe(0);
  });
});

describe("flattenLedger", () => {
  it("orders same-timestamp transfer chains causally (out before in, hop by hop)", () => {
    // Two hops recorded with the SAME timestamp; the ids are chosen so a
    // plain id tie-break would process the legs in the wrong order.
    const date = "2024-01-15T10:00:00Z";
    const tx = (t: Partial<LedgerEntry> & { id: string; type: TransactionType }) => ({
      date,
      amountBtc: "1",
      pricePerBtcEur: null as string | null,
      note: "",
      ...t,
    });
    const wallets: Wallet[] = [
      {
        id: "w1",
        name: "Kraken",
        type: "exchange",
        accounts: [
          {
            id: "a1",
            name: "Spot",
            transactions: [
              tx({ id: "z-buy", type: "buy", date: "2023-01-01T00:00:00Z", pricePerBtcEur: "20000" }),
              tx({
                id: "z-out1",
                type: "transfer_out",
                counterpartyAccountId: "a2",
                transferGroupId: "g1",
                lotAllocations: [{ lotTransactionId: "z-buy", amountBtc: "1" }],
              }),
            ],
          },
          {
            id: "a2",
            name: "Hot",
            transactions: [
              tx({ id: "a-in1", type: "transfer_in", counterpartyAccountId: "a1", transferGroupId: "g1" }),
              tx({
                id: "b-out2",
                type: "transfer_out",
                counterpartyAccountId: "a3",
                transferGroupId: "g2",
                lotAllocations: [{ lotTransactionId: "a-in1", amountBtc: "1" }],
              }),
            ],
          },
          {
            id: "a3",
            name: "Cold",
            transactions: [
              tx({ id: "a-in2", type: "transfer_in", counterpartyAccountId: "a2", transferGroupId: "g2" }),
            ],
          },
        ],
      },
    ];
    const entries = flattenLedger(wallets);
    expect(entries.map((e) => e.id)).toEqual([
      "z-buy",
      "z-out1",
      "a-in1",
      "b-out2",
      "a-in2",
    ]);
    // And the engine resolves the original lot through both hops.
    const r = computeFifo(entries, 365);
    expect(r.openLots).toHaveLength(1);
    expect(r.openLots[0].accountId).toBe("a3");
    expect(r.openLots[0].acquiredDate).toBe("2023-01-01T00:00:00Z");
    expect(r.openLots[0].costPerBtcEur!.toString()).toBe("20000");
  });
});
