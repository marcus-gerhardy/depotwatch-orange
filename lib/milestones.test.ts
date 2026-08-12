// Milestones. Two things matter more than the individual predicates: that a
// reached milestone stays reached whatever the portfolio does later, and that
// a file with years of history gets *historical* dates rather than today's.

import { describe, expect, it } from "vitest";
import { computeFifo } from "./fifo";
import { flattenLedger } from "./types";
import type { PortfolioFile, Transaction, WalletType } from "./types";
import {
  MILESTONES,
  MILESTONES_BY_ID,
  achieveEvent,
  acknowledgeAll,
  categoryProgress,
  evaluateMilestones,
  milestoneContext,
} from "./milestones";

const tx = (o: Partial<Transaction> & Pick<Transaction, "id" | "type" | "date">): Transaction => ({
  amountBtc: "0.5",
  pricePerBtcEur: "50000",
  totalFiatEur: "25000",
  note: "",
  ...o,
});

function file(
  wallets: { id: string; type: WalletType; name?: string; accounts: { id: string; transactions: Transaction[] }[] }[],
  patch: Partial<PortfolioFile> = {},
): PortfolioFile {
  return {
    version: "1.0",
    settings: {
      locale: "de", currencyDisplay: "EUR", holdingPeriodDays: 365,
      costBasisMethod: "FIFO", autosaveDebounceMs: 1500,
    },
    wallets: wallets.map((w) => ({
      id: w.id, name: w.name ?? w.id, type: w.type,
      accounts: w.accounts.map((a) => ({ id: a.id, name: a.id, transactions: a.transactions })),
    })),
    watchedAddresses: [],
    explorerSettings: { provider: "mempool.space" },
    utxoLabels: [],
    importPresets: [],
    ...patch,
  };
}

function ctxOf(p: PortfolioFile, now = new Date("2026-08-11T12:00:00.000Z"), runtime = { encrypted: false, savedOnce: false }) {
  const entries = flattenLedger(p.wallets);
  return milestoneContext(p, entries, computeFifo(entries, p.settings.holdingPeriodDays), runtime, now);
}

const simple = (transactions: Transaction[], type: WalletType = "exchange") =>
  file([{ id: "w1", type, accounts: [{ id: "a1", transactions }] }]);

describe("the catalogue itself", () => {
  it("has a unique id per entry and a category for each", () => {
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MILESTONES.every((m) => m.category)).toBe(true);
  });

  it("rewards decisions, never the price: no predicate reads a rate", () => {
    // The rule this whole file exists for, stated as a test: a milestone may
    // look at what the user did, never at what the market did.
    const source = MILESTONES.map((m) => String(m.reached ?? "")).join("\n");
    expect(source).not.toMatch(/priceEur|pricePerBtc|marketValue|eurValue/);
  });

  it("either decides for itself or is an event, never neither", () => {
    expect(MILESTONES.every((m) => m.event === true || typeof m.reached === "function")).toBe(true);
  });
});

describe("evaluateMilestones", () => {
  it("finds the first transaction and dates it from the ledger", () => {
    const p = simple([tx({ id: "b1", type: "buy", date: "2021-03-04T10:00:00.000Z" })]);
    const { newlyAchieved } = evaluateMilestones(ctxOf(p));
    const first = newlyAchieved.find((m) => m.id === "firstTransaction")!;

    // Not the day the file was opened: the day it happened.
    expect(first.achievedAt).toBe("2021-03-04T10:00:00.000Z");
    expect(first.acknowledged).toBe(false);
  });

  it("dates a stacking milestone to the day the holding crossed it", () => {
    const p = simple([
      tx({ id: "b1", type: "buy", date: "2023-01-10T10:00:00.000Z", amountBtc: "0.004" }),
      tx({ id: "b2", type: "buy", date: "2024-06-02T10:00:00.000Z", amountBtc: "0.02" }),
    ]);
    const { milestones } = evaluateMilestones(ctxOf(p));
    const sats1m = milestones.find((m) => m.id === "sats1m")!;

    // 0.004 + 0.02 = 0.024 BTC; the second buy is what crossed 0.01.
    expect(sats1m.achievedAt.slice(0, 10)).toBe("2024-06-02");
    // …and the smaller one is dated to the earlier buy.
    expect(milestones.find((m) => m.id === "sats100k")!.achievedAt.slice(0, 10)).toBe(
      "2023-01-10",
    );
  });

  it("keeps a milestone once reached, even when the holding falls back", () => {
    const before = simple([tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z", amountBtc: "1.2" })]);
    const { milestones } = evaluateMilestones(ctxOf(before));
    expect(milestones.some((m) => m.id === "btc1")).toBe(true);

    // Sells almost everything a year later.
    const after = simple([
      tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z", amountBtc: "1.2" }),
      tx({ id: "s1", type: "sell", date: "2025-01-01T00:00:00.000Z", amountBtc: "1.1",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "1.1" }] }),
    ]);
    const second = evaluateMilestones(ctxOf(after), milestones);

    const wholecoiner = second.milestones.find((m) => m.id === "btc1")!;
    expect(wholecoiner.achievedAt).toBe(
      milestones.find((m) => m.id === "btc1")!.achievedAt,
    );
    // Nothing is reported twice either.
    expect(second.newlyAchieved.some((m) => m.id === "btc1")).toBe(false);
  });

  it("never dates a milestone into the future", () => {
    // A derived date is an estimate; one that has not happened yet is wrong.
    const p = simple([tx({ id: "b1", type: "buy", date: "2026-08-01T00:00:00.000Z" })]);
    const now = new Date("2026-08-11T12:00:00.000Z");
    for (const m of evaluateMilestones(ctxOf(p, now)).milestones) {
      expect(new Date(m.achievedAt).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});

describe("sovereignty", () => {
  const exchangeAndCold = (transactions: [Transaction[], Transaction[]]) =>
    file([
      { id: "w-ex", type: "exchange", accounts: [{ id: "a-ex", transactions: transactions[0] }] },
      { id: "w-cold", type: "hardware", accounts: [{ id: "a-cold", transactions: transactions[1] }] },
    ]);

  it("recognises the first withdrawal from an exchange to one's own wallet", () => {
    const p = exchangeAndCold([
      [
        tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z", amountBtc: "1" }),
        tx({ id: "out", type: "transfer_out", date: "2024-02-01T00:00:00.000Z", amountBtc: "0.6",
             counterpartyAccountId: "a-cold", transferGroupId: "g1",
             lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.6" }] }),
      ],
      [tx({ id: "in", type: "transfer_in", date: "2024-02-01T01:00:00.000Z", amountBtc: "0.6",
            counterpartyAccountId: "a-ex", transferGroupId: "g1" })],
    ]);
    const { milestones } = evaluateMilestones(ctxOf(p));

    expect(milestones.find((m) => m.id === "firstWithdrawal")!.achievedAt).toBe(
      "2024-02-01T00:00:00.000Z",
    );
    // 0.6 of 1.0 is in self custody, so the half is reached and the whole is not.
    expect(milestones.some((m) => m.id === "selfCustody50")).toBe(true);
    expect(milestones.some((m) => m.id === "selfCustody100")).toBe(false);
  });

  it("counts a lightning wallet by the names people actually use", () => {
    const p = file([{ id: "w1", type: "software", name: "Phoenix", accounts: [{ id: "a1", transactions: [] }] }]);
    expect(evaluateMilestones(ctxOf(p)).milestones.some((m) => m.id === "lightningWallet")).toBe(true);
  });

  it("recognises a taproot address in the watchlist", () => {
    const p = simple([]);
    p.watchedAddresses = [
      { id: "w", type: "address", value: "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", label: "x", tags: [] },
    ];
    const ids = evaluateMilestones(ctxOf(p)).milestones.map((m) => m.id);
    expect(ids).toContain("taprootAddress");
    expect(ids).toContain("firstWatchedAddress");
  });
});

describe("patience", () => {
  it("counts days from the first buy, not from the first transaction", () => {
    const p = simple([
      tx({ id: "in", type: "transfer_in", date: "2020-01-01T00:00:00.000Z" }),
      tx({ id: "b1", type: "buy", date: "2026-01-01T00:00:00.000Z" }),
    ]);
    const ids = evaluateMilestones(ctxOf(p)).milestones.map((m) => m.id);

    // A gift received in 2020 is not "time in the market" for a buy in 2026.
    expect(ids).toContain("days100");
    expect(ids).not.toContain("year1");
  });

  it("recognises holding through a halving", () => {
    const p = simple([tx({ id: "b1", type: "buy", date: "2024-01-05T00:00:00.000Z", amountBtc: "0.5" })]);
    const found = evaluateMilestones(ctxOf(p)).milestones.find((m) => m.id === "throughHalving");

    // Bought before 20 April 2024 and still holding after it.
    expect(found?.achievedAt.slice(0, 10)).toBe("2024-04-20");
  });

  it("does not award a halving that happened before the first coin", () => {
    const p = simple([tx({ id: "b1", type: "buy", date: "2025-01-05T00:00:00.000Z" })]);
    expect(
      evaluateMilestones(ctxOf(p)).milestones.some((m) => m.id === "throughHalving"),
    ).toBe(false);
  });
});

describe("culture and diligence", () => {
  it("takes a transfer closing several lots as a consolidation", () => {
    const p = simple([
      tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z", amountBtc: "0.1" }),
      tx({ id: "b2", type: "buy", date: "2024-01-02T00:00:00.000Z", amountBtc: "0.1" }),
      tx({ id: "b3", type: "buy", date: "2024-01-03T00:00:00.000Z", amountBtc: "0.1" }),
      tx({ id: "out", type: "transfer_out", date: "2024-02-01T00:00:00.000Z", amountBtc: "0.3",
           lotAllocations: [
             { lotTransactionId: "b1", amountBtc: "0.1" },
             { lotTransactionId: "b2", amountBtc: "0.1" },
             { lotTransactionId: "b3", amountBtc: "0.1" },
           ] }),
    ]);
    expect(
      evaluateMilestones(ctxOf(p)).milestones.find((m) => m.id === "firstConsolidation")!.achievedAt,
    ).toBe("2024-02-01T00:00:00.000Z");
  });

  it("recognises a buy on pizza day in the user's own timezone", () => {
    const local = new Date(2025, 4, 22, 12, 0, 0).toISOString();
    const p = simple([tx({ id: "b1", type: "buy", date: local })]);
    expect(
      evaluateMilestones(ctxOf(p)).milestones.some((m) => m.id === "boughtOnPizzaDay"),
    ).toBe(true);
  });

  it("reads encryption from the runtime, not from the file", () => {
    const p = simple([tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z" })]);
    const plain = evaluateMilestones(ctxOf(p)).milestones.map((m) => m.id);
    expect(plain).not.toContain("encrypted");

    const saved = evaluateMilestones(
      ctxOf(p, new Date("2026-08-11T12:00:00.000Z"), { encrypted: true, savedOnce: true }),
    ).milestones.map((m) => m.id);
    expect(saved).toContain("encrypted");
  });

  it("only counts a backup that was read back, not a file that was saved", () => {
    // Saving is not backing up: it is the same copy in the same place (§6.5).
    const p = simple([tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z" })]);
    const savedOnly = evaluateMilestones(
      ctxOf(p, new Date("2026-08-11T12:00:00.000Z"), { encrypted: true, savedOnce: true }),
    ).milestones.map((m) => m.id);
    expect(savedOnly).not.toContain("firstBackup");

    const written = simple([tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z" })]);
    written.backupState = {
      lastBackupAt: "2026-08-10T09:00:00.000Z",
      lastVerified: false,
    };
    expect(
      evaluateMilestones(ctxOf(written)).milestones.map((m) => m.id),
    ).not.toContain("firstBackup");

    written.backupState = {
      lastBackupAt: "2026-08-10T09:00:00.000Z",
      lastVerified: true,
      lastVerifiedAt: "2026-08-10T09:00:00.000Z",
    };
    const record = evaluateMilestones(ctxOf(written)).milestones.find(
      (m) => m.id === "firstBackup",
    );
    // Dated from when the backup verified, not from now.
    expect(record?.achievedAt).toBe("2026-08-10T09:00:00.000Z");
  });
});

describe("events, acknowledgement and progress", () => {
  it("records an event once and only once", () => {
    const first = achieveEvent([], "whitepaperOpened", new Date("2026-05-01T10:00:00.000Z"));
    expect(first.newlyAchieved).toHaveLength(1);

    const again = achieveEvent(first.milestones, "whitepaperOpened");
    expect(again.newlyAchieved).toHaveLength(0);
    expect(again.milestones).toBe(first.milestones);
  });

  it("ignores an unknown id rather than inventing a milestone", () => {
    expect(achieveEvent([], "does-not-exist").milestones).toHaveLength(0);
  });

  it("acknowledges without rebuilding an already acknowledged list", () => {
    const records = [{ id: "btc1", achievedAt: "2024-01-01T00:00:00.000Z", acknowledged: true }];
    // Same reference back: an unchanged list must not dirty the file.
    expect(acknowledgeAll(records)).toBe(records);
    expect(acknowledgeAll([{ ...records[0], acknowledged: false }])[0].acknowledged).toBe(true);
  });

  it("reports progress towards a quantitative milestone", () => {
    const p = simple([tx({ id: "b1", type: "buy", date: "2026-01-01T00:00:00.000Z", amountBtc: "0.00743" })]);
    const progress = MILESTONES_BY_ID.get("sats1m")!.progress!(ctxOf(p));

    expect(progress).toEqual({ current: 743_000, target: 1_000_000, unit: "sats" });
  });

  it("counts each category and the whole catalogue", () => {
    const done = evaluateMilestones(
      ctxOf(simple([tx({ id: "b1", type: "buy", date: "2024-01-01T00:00:00.000Z" })])),
    ).milestones;
    const stacking = categoryProgress(done).find((c) => c.category === "stacking")!;

    expect(stacking.total).toBe(MILESTONES.filter((m) => m.category === "stacking").length);
    expect(stacking.achieved).toBeGreaterThan(0);
    expect(stacking.achieved).toBeLessThan(stacking.total);
  });
});
