import { describe, it, expect } from "vitest";
import { allocateFifo, computeFifo, daysUntilTaxFree, isLotTaxFree } from "./fifo";
import { dec } from "./decimal";
import type { LedgerEntry, TransactionType } from "./types";

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
    expect(r.totalBtc.toString()).toBe("1.5");
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
    expect(r.totalBtc.toString()).toBe("0.9999");
  });

  it("external transfer_in creates a lot with unknown basis", () => {
    const r = computeFifo(
      [entry("transfer_in", "2024-01-01T00:00:00Z", "0.5", null)],
      365,
    );
    expect(r.totalBtc.toString()).toBe("0.5");
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
    expect(r.totalBtc.toString()).toBe("0.9");
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
    expect(r.totalBtc.toString()).toBe("0");
  });

  it("uses exact decimal arithmetic (no float drift)", () => {
    const entries: LedgerEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(entry("buy", `2024-01-0${(i % 9) + 1}T00:00:00Z`, "0.1", "30000"));
    }
    const r = computeFifo(entries, 365);
    expect(r.totalBtc.toString()).toBe("1"); // 0.1 * 10 === 1 exactly
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
