// The demo portfolio is the first thing most people see, and it doubles as a
// worked example of every feature. These tests keep it that way: they run the
// real engine over both language files, so a demo that contradicts itself (a
// balance the lots do not back, an assignment pointing nowhere) fails here
// rather than in front of a user.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeFifo } from "./fifo";
import { totalBalance } from "./portfolio";
import { countIssues, hasIssue, issueContext } from "./dataQuality";
import { indexLedger, resolveProvenance } from "./provenance";
import { allocationSumBtc, allocationTargetBtc, groupOnChain, effectiveOnChain } from "./transferLink";
import { migrateTransferFeeConvention } from "./store";
import { defaultDashboard } from "./dashboardLayout";
import { flattenLedger, type PortfolioFile, type Transaction } from "./types";
import { ZERO, dec } from "./decimal";

const files = {
  de: "public/demo-portfolio.json",
  en: "public/demo-portfolio.en.json",
} as const;

function load(lang: keyof typeof files): PortfolioFile {
  return JSON.parse(readFileSync(files[lang], "utf8")) as PortfolioFile;
}

const de = load("de");
const entries = flattenLedger(de.wallets);
const fifo = computeFifo(entries, de.settings.holdingPeriodDays);
const ctx = issueContext(entries);
const all = (p: PortfolioFile): Transaction[] =>
  p.wallets.flatMap((w) => w.accounts.flatMap((a) => a.transactions));

/** The one transfer the demo deliberately leaves unassigned, as an example. */
const OPEN_OUT_LEG = "k-out-open";
const OPEN_IN_LEG = "sp-in-open";

describe("demo portfolio: both languages describe the same ledger", () => {
  it("differs only in the texts a reader sees", () => {
    // Everything but the note, which is the part that gets translated.
    const strip = (p: PortfolioFile) =>
      all(p).map((t) => Object.fromEntries(
        Object.entries(t).filter(([k]) => k !== "note"),
      ));
    expect(strip(load("en"))).toEqual(strip(de));
  });

  it("has a note on every transaction, in both languages", () => {
    for (const lang of ["de", "en"] as const) {
      expect(all(load(lang)).filter((t) => t.note.trim() === "")).toEqual([]);
    }
  });

  it("keeps the same wallet, account and widget structure", () => {
    const shape = (p: PortfolioFile) => ({
      wallets: p.wallets.map((w) => ({
        id: w.id,
        type: w.type,
        accounts: w.accounts.map((a) => a.id),
      })),
      layout: p.uiSettings?.dashboardLayout,
      columns: p.uiSettings?.transactionColumns,
      settings: { ...p.settings, locale: null },
    });
    expect(shape(load("en"))).toEqual(shape(de));
  });
});

describe("demo portfolio: the numbers hold up", () => {
  it("never lets an account go negative", () => {
    for (const w of de.wallets) {
      for (const a of w.accounts) {
        const perAccount = entries.filter((e) => e.accountId === a.id);
        expect(totalBalance(perAccount).gte(ZERO), `${w.name}/${a.name}`).toBe(true);
      }
    }
  });

  it("assigns every disposal except the one that demonstrates an open one", () => {
    const unassigned = entries
      .filter((e) => hasIssue(e, "incompleteAllocation", ctx))
      .map((e) => e.id);
    expect(unassigned).toEqual([OPEN_OUT_LEG]);
  });

  it("is written in the current file format", () => {
    // The fee migration only touches legs written under the old convention;
    // if it changed anything here, the demo would be shipping legacy data.
    expect(migrateTransferFeeConvention(de)).toEqual(de);
  });

  it("never claims more of a lot than it holds", () => {
    const claimed = new Map<string, ReturnType<typeof dec>>();
    for (const e of entries) {
      for (const a of e.lotAllocations ?? []) {
        claimed.set(
          a.lotTransactionId,
          (claimed.get(a.lotTransactionId) ?? ZERO).plus(dec(a.amountBtc)),
        );
      }
    }
    for (const [lotId, amount] of claimed) {
      const lot = entries.find((e) => e.id === lotId);
      expect(lot, `allocation points at ${lotId}`).toBeDefined();
      const credited =
        lot!.type === "buy"
          ? dec(lot!.amountBtc).minus(dec(lot!.feeBtc))
          : dec(lot!.amountBtc);
      expect(amount.lte(credited), `${lotId} over-allocated`).toBe(true);
    }
  });

  it("has open lots that match the balance, apart from the open example", () => {
    // Everything assigned closes exactly what left the account, so engine and
    // ledger only differ by the transfer that is deliberately unassigned.
    const open = entries.find((e) => e.id === OPEN_OUT_LEG)!;
    const gap = allocationTargetBtc(open).minus(allocationSumBtc(open.lotAllocations));
    expect(fifo.openLotsBtc.minus(totalBalance(entries)).toString()).toBe(gap.toString());
  });

  it("values almost the whole holding, and names what it cannot", () => {
    // Only the buy without a EUR figure and the gift stay without a basis,
    // plus the arrival of the unassigned transfer.
    const withoutBasis = fifo.openLots
      .filter((l) => l.costPerBtcEur === null)
      .map((l) => l.txId)
      .sort();
    expect(withoutBasis).toEqual(["k-buy-old", OPEN_IN_LEG, "sp-in-gift"].sort());
  });
});

describe("demo portfolio: every feature has an example", () => {
  it("covers all wallet types", () => {
    expect(new Set(de.wallets.map((w) => w.type))).toEqual(
      new Set(["exchange", "hardware", "software", "paper"]),
    );
  });

  it("covers all transaction types", () => {
    expect(new Set(entries.map((e) => e.type))).toEqual(
      new Set(["buy", "sell", "transfer_in", "transfer_out", "spend"]),
    );
  });

  it("has a wallet with several accounts", () => {
    expect(de.wallets.some((w) => w.accounts.length > 1)).toBe(true);
  });

  it("has a transfer that bundles several buys into one transaction", () => {
    const bundled = entries.filter(
      (e) => e.type === "transfer_out" && (e.lotAllocations?.length ?? 0) >= 3,
    );
    expect(bundled.length).toBeGreaterThan(0);
    // …and the arrival unfolds into exactly those buys again.
    const arrival = entries.find(
      (e) => e.type === "transfer_in" && e.transferGroupId === bundled[0].transferGroupId,
    )!;
    const origins = resolveProvenance(arrival, indexLedger(entries));
    expect(origins.status).toBe("resolved");
    expect(origins.origins.length).toBe(bundled[0].lotAllocations!.length);
  });

  it("has a chain of transfers across three wallets", () => {
    const paperArrival = entries.find((e) => e.id === "pp-in-1")!;
    const origins = resolveProvenance(paperArrival, indexLedger(entries));
    expect(origins.status).toBe("resolved");
    // Two hops back to the original buys on the exchange.
    expect(Math.max(...origins.origins.map((o) => o.hops))).toBeGreaterThanOrEqual(2);
    expect(origins.origins.every((o) => o.walletName === "Kraken")).toBe(true);
  });

  it("has one send arriving in two accounts", () => {
    const arrivals = entries.filter(
      (e) => e.type === "transfer_in" && e.transferGroupId === "g-split-1",
    );
    expect(arrivals).toHaveLength(2);
    expect(new Set(arrivals.map((a) => a.accountId)).size).toBe(2);
    // Each arrival names its own output; the send cannot name "the" address.
    expect(arrivals.every((a) => a.address)).toBe(true);
    expect(entries.find((e) => e.id === "sp-out-split")!.address).toBeUndefined();
  });

  it("has a leg that takes txid and address from its counterpart", () => {
    const groups = groupOnChain(entries);
    const send = entries.find((e) => e.id === "k-out-cold")!;
    const shared = effectiveOnChain(send, groups);
    expect(send.txid).toBeUndefined();
    expect(shared.txidInherited).toBe(true);
    expect(shared.addressInherited).toBe(true);
  });

  it("has an arrival recorded before the send it belongs to", () => {
    const arrival = entries.find((e) => e.id === "pp-in-1")!;
    const send = entries.find((e) => e.id === "bb-out-paper")!;
    expect(arrival.date < send.date).toBe(true);
    // …and the engine still traces it (see the causal order in flattenLedger).
    expect(resolveProvenance(arrival, indexLedger(entries)).status).toBe("resolved");
  });

  it("has buys settled in another currency, valued from history", () => {
    const foreign = entries.filter((e) => e.originalCurrency);
    expect(foreign.length).toBeGreaterThan(1);
    expect(foreign.every((e) => e.eurValuationSource === "binance-klines")).toBe(true);
  });

  it("has external receives and sends as well as internal ones", () => {
    expect(
      entries.some((e) => e.type === "transfer_in" && !e.counterpartyAccountId),
    ).toBe(true);
    expect(
      entries.some((e) => e.type === "transfer_out" && !e.counterpartyAccountId),
    ).toBe(true);
  });

  it("has fees of every kind", () => {
    expect(entries.some((e) => e.type === "buy" && e.feeBtc)).toBe(true);
    expect(entries.some((e) => e.type === "transfer_out" && e.feeBtc)).toBe(true);
    expect(entries.some((e) => e.feeFiatEur)).toBe(true);
  });

  it("has disposals in more than one tax year, taxable and tax-free", () => {
    const years = new Set(fifo.disposals.map((d) => d.date.slice(0, 4)));
    expect(years.size).toBeGreaterThan(1);
    expect(fifo.realizedTaxFreeGainEur.gt(ZERO)).toBe(true);
  });

  it("has open lots on both sides of the holding period", () => {
    const now = new Date("2026-08-08T00:00:00.000Z");
    expect(fifo.openLots.some((l) => l.taxFreeDate <= now)).toBe(true);
    expect(fifo.openLots.some((l) => l.taxFreeDate > now)).toBe(true);
  });

  it("shows a data-quality example of each kind it is meant to show", () => {
    const counts = countIssues(entries);
    expect(counts.missingEurValue).toBe(1);
    expect(counts.incompleteAllocation).toBe(1);
    expect(counts.unresolvedOrigin).toBe(1);
    expect(counts.missingTxid).toBeGreaterThan(0);
    expect(counts.unlinkedTransfer).toBeGreaterThan(0);
  });

  it("comes with a watchlist, UTXO labels, import presets and a layout", () => {
    expect(new Set(de.watchedAddresses.map((a) => a.type)).size).toBeGreaterThan(1);
    expect(de.watchedAddresses.every((a) => a.tags.length > 0)).toBe(true);
    expect(de.utxoLabels.length).toBeGreaterThan(1);
    // Two presets that disagree about everything the wizard can ask.
    expect(de.importPresets.length).toBeGreaterThan(1);
    expect(de.importPresets.every((p) => p.rowFilter?.rules.length)).toBe(true);
    expect(new Set(de.importPresets.map((p) => p.delimiter)).size).toBe(2);
    expect(de.importPresets.some((p) => p.amountUnit === "sats")).toBe(true);
    expect(de.importPresets.some((p) => p.fixedType)).toBe(true);
  });

  it("ships the current default dashboard, all widgets included", () => {
    // The generator mirrors DEFAULT_BANDS; this is what stops the two from
    // drifting apart, and it is also what keeps the demo's layout a fixed
    // point of the grid's compaction (DashboardGrid.test.tsx checks that end).
    expect(de.uiSettings?.dashboardLayout).toEqual(defaultDashboard());
  });

  it("has enough history for the widgets that need volume", () => {
    // A handful of buys tells a heatmap, a DCA overview or a marker
    // aggregation nothing at all.
    const buys = entries.filter((e) => e.type === "buy");
    expect(buys.length).toBeGreaterThan(300);
    // Spread over years, and dense enough in the last twelve months that the
    // heatmap and the marker bucketing have something to fold.
    expect(new Set(buys.map((b) => b.date.slice(0, 4))).size).toBeGreaterThanOrEqual(4);
    const recent = buys.filter((b) => b.date >= "2026-01-01");
    expect(recent.length).toBeGreaterThan(100);
    // One assignment wide enough to exercise the lot picker in earnest.
    const widest = Math.max(
      ...entries.map((e) => e.lotAllocations?.length ?? 0),
    );
    expect(widest).toBeGreaterThan(20);
  });
});
