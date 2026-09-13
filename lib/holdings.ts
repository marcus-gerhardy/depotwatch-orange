// What one wallet or one account actually holds.
//
// Every surface that answers "how much is in here" reads this module: the
// wallet/account detail view, the wallet management list, the summary row of
// the transaction table, the popover on a wallet/account cell, and the balance
// hints in the transfer dialog and the lot picker. One implementation, because
// several would drift apart — and a balance that differs between two screens
// is worse than one that is only on a single screen.
//
// Two sources, each for what it is the authority on (CLAUDE.md §11):
//
//   * the **quantity** comes from the ledger (`balanceDelta`), never from the
//     FIFO engine. The engine can only account for disposals that carry a lot
//     assignment, so with half-assigned history its open-lot sum sits above
//     the real balance;
//   * everything **about** those coins — acquisition date, cost basis, holding
//     period — comes from the engine's open lots, which is where lot identity
//     is resolved across internal transfers (transferGroupId → out-leg →
//     lotAllocations → the original buy, §3.2). `lib/provenance.ts` is that
//     same resolution read backwards for one transaction; walking it a third
//     time here would be a third implementation free to disagree with the
//     other two, so this module consumes what the engine already resolved.
//
// The gap between the two is reported (`unassignedBtc`) rather than hidden:
// it is the honest state of a file whose disposals are not all assigned yet.

import { Decimal, ZERO, dec } from "./decimal";
import { isLotTaxFree, type FifoResult, type OpenLot } from "./fifo";
import { balanceDelta } from "./portfolio";
import { isPriced, type LedgerEntry, type Wallet } from "./types";

const SATS_PER_BTC = 100_000_000;

/** One open lot of a holding, with its origin already resolved. */
export interface HoldingLot {
  /** The transaction the lot currently sits in (a buy, or an arrival). */
  txId: string;
  /** Original acquisition — never the date coins arrived somewhere (§3.2). */
  acquiredDate: string;
  accountId: string;
  walletName: string;
  accountName: string;
  /** What is left of it. */
  amountBtc: Decimal;
  costPerBtcEur: Decimal | null;
  /** `costPerBtcEur × amountBtc`; null when the basis is unknown. */
  costEur: Decimal | null;
  taxFreeDate: Date;
  taxFree: boolean;
  /**
   * The acquisition date is an assumption, not a fact (§3.2). Such a lot is
   * counted as neither tax-free nor taxable but reported on its own.
   */
  originUnresolved: boolean;
  note: string;
}

export interface Holding {
  /** Ledger balance of the scope — the holding, always (§11). */
  btc: Decimal;
  /** The same in whole satoshis, the smallest unit the ledger stores. */
  sats: number;
  /** Market value of the whole holding; null without a price. */
  valueEur: Decimal | null;
  /** Cost basis of the open lots that have a known one. */
  costBasisEur: Decimal;
  /**
   * BTC that `costBasisEur` covers. Anything subtracting a cost basis from a
   * market value has to value *this*, never `btc`: lots with no known cost (an
   * external arrival, a buy without a EUR figure) are part of the holding but
   * contribute nothing to the basis, so valuing the whole holding against a
   * partial basis books their full market value as profit (§4.1).
   */
  basisBtc: Decimal;
  /** Open BTC whose acquisition price is unknown — named, never averaged in. */
  unknownBasisBtc: Decimal;
  avgCostPerBtcEur: Decimal | null;
  /** Market value of `basisBtc` minus its cost; null without a price. */
  unrealizedPnlEur: Decimal | null;
  /** The same as a fraction of the cost basis; null without a price or basis. */
  unrealizedPnlPct: number | null;
  /** Open BTC past the holding period, and still inside it. */
  taxFreeBtc: Decimal;
  taxableBtc: Decimal;
  /** Open BTC whose origin never resolved: not judgeable either way (§3.2). */
  unresolvedBtc: Decimal;
  /** When the next taxable lot comes free; null when none is waiting. */
  nextTaxFreeDate: Date | null;
  /** Open lots, newest acquisition first. */
  lots: HoldingLot[];
  /** Sum of the open lots — not the holding, see `unassignedBtc`. */
  openLotsBtc: Decimal;
  /**
   * What the open lots exceed the ledger balance by: the amount of disposals
   * that carry no lot assignment yet (§3.2). Zero in a fully assigned file,
   * and never negative.
   */
  unassignedBtc: Decimal;
  /** Transactions booked in this scope. */
  transactionCount: number;
}

export interface HoldingInput {
  /** The flattened ledger, in causal order (`flattenLedger`). */
  entries: LedgerEntry[];
  /** The engine's result over exactly those entries. */
  fifo: FifoResult;
  /** BTC spot price in EUR; null leaves every valued figure null. */
  priceEur: number | null;
  /** Injected, so nothing here reads the clock while rendering (§4.1). */
  now?: Date;
}

/** Which accounts a holding covers; undefined means the whole portfolio. */
export type AccountScope = ReadonlySet<string> | undefined;

function buildHolding(
  entries: LedgerEntry[],
  lots: OpenLot[],
  priceEur: number | null,
  now: Date,
): Holding {
  let btc = ZERO;
  for (const e of entries) btc = btc.plus(balanceDelta(e));

  let openLotsBtc = ZERO;
  let costBasisEur = ZERO;
  let basisBtc = ZERO;
  let unknownBasisBtc = ZERO;
  let taxFreeBtc = ZERO;
  let taxableBtc = ZERO;
  let unresolvedBtc = ZERO;
  let nextTaxFreeDate: Date | null = null;

  const holdingLots: HoldingLot[] = [];
  for (const lot of lots) {
    const amount = lot.remainingBtc;
    openLotsBtc = openLotsBtc.plus(amount);
    const costEur = lot.costPerBtcEur === null ? null : lot.costPerBtcEur.mul(amount);
    if (costEur === null) unknownBasisBtc = unknownBasisBtc.plus(amount);
    else {
      costBasisEur = costBasisEur.plus(costEur);
      basisBtc = basisBtc.plus(amount);
    }
    const unresolved = lot.originUnresolved === true;
    const taxFree = !unresolved && isLotTaxFree(lot, now);
    if (unresolved) unresolvedBtc = unresolvedBtc.plus(amount);
    else if (taxFree) taxFreeBtc = taxFreeBtc.plus(amount);
    else {
      taxableBtc = taxableBtc.plus(amount);
      if (nextTaxFreeDate === null || lot.taxFreeDate < nextTaxFreeDate) {
        nextTaxFreeDate = lot.taxFreeDate;
      }
    }
    holdingLots.push({
      txId: lot.txId,
      acquiredDate: lot.acquiredDate,
      accountId: lot.accountId,
      walletName: lot.walletName,
      accountName: lot.accountName,
      amountBtc: amount,
      costPerBtcEur: lot.costPerBtcEur,
      costEur,
      taxFreeDate: lot.taxFreeDate,
      taxFree,
      originUnresolved: unresolved,
      note: lot.note,
    });
  }

  const price = priceEur === null ? null : dec(priceEur);
  const valueEur = price === null ? null : btc.mul(price);
  // Valued over the BTC the basis actually covers, never over the whole
  // holding — see `basisBtc`.
  const unrealizedPnlEur =
    price === null ? null : basisBtc.mul(price).minus(costBasisEur);

  return {
    btc,
    sats: btc.mul(SATS_PER_BTC).toDecimalPlaces(0).toNumber(),
    valueEur,
    costBasisEur,
    basisBtc,
    unknownBasisBtc,
    avgCostPerBtcEur: basisBtc.gt(0) ? costBasisEur.div(basisBtc) : null,
    unrealizedPnlEur,
    unrealizedPnlPct:
      unrealizedPnlEur === null || !costBasisEur.gt(0)
        ? null
        : unrealizedPnlEur.div(costBasisEur).toNumber(),
    taxFreeBtc,
    taxableBtc,
    unresolvedBtc,
    nextTaxFreeDate,
    lots: mergeLots(holdingLots),
    openLotsBtc,
    unassignedBtc: Decimal.max(ZERO, openLotsBtc.minus(btc)),
    transactionCount: entries.length,
  };
}

/**
 * One row per original acquisition, newest first.
 *
 * A bundled arrival re-creates one queue entry per origin lot under a single
 * transaction id (§3.2), so the engine's list can hold several entries that
 * differ only in how much of the same acquisition they carry. Those are one
 * lot to a reader and are added up; parts with different acquisition dates or
 * different costs stay apart, because that is exactly what they are.
 */
function mergeLots(lots: HoldingLot[]): HoldingLot[] {
  const merged = new Map<string, HoldingLot>();
  for (const lot of lots) {
    const key = `${lot.txId}|${lot.acquiredDate}|${lot.costPerBtcEur?.toString() ?? "?"}`;
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...lot });
      continue;
    }
    seen.amountBtc = seen.amountBtc.plus(lot.amountBtc);
    seen.costEur =
      seen.costEur === null || lot.costEur === null
        ? null
        : seen.costEur.plus(lot.costEur);
    seen.originUnresolved = seen.originUnresolved || lot.originUnresolved;
  }
  return [...merged.values()].sort((a, b) => b.acquiredDate.localeCompare(a.acquiredDate));
}

/**
 * The holding of a scope: one account, one wallet's accounts, or (without a
 * scope) the whole portfolio.
 */
export function computeHolding(input: HoldingInput, scope: AccountScope = undefined): Holding {
  const inScope = (accountId: string) => scope === undefined || scope.has(accountId);
  return buildHolding(
    input.entries.filter((e) => inScope(e.accountId)),
    input.fifo.openLots.filter((l) => inScope(l.accountId)),
    input.priceEur,
    input.now ?? new Date(),
  );
}

export interface PortfolioHoldings {
  /** Keyed by account id; every account of every wallet has an entry. */
  byAccount: Map<string, Holding>;
  /** Keyed by wallet id; a wallet without accounts gets an empty holding. */
  byWallet: Map<string, Holding>;
  total: Holding;
}

/**
 * Every wallet and every account in one pass, so a list of them costs one walk
 * of the ledger rather than one per row. Accounts with no transactions are
 * included — an empty account is a real answer ("nothing in here"), and
 * leaving it out would make the list disagree with the wallet management.
 */
export function portfolioHoldings(
  input: HoldingInput,
  wallets: Wallet[],
): PortfolioHoldings {
  const now = input.now ?? new Date();
  const entriesByAccount = new Map<string, LedgerEntry[]>();
  for (const e of input.entries) {
    const list = entriesByAccount.get(e.accountId);
    if (list) list.push(e);
    else entriesByAccount.set(e.accountId, [e]);
  }
  const lotsByAccount = new Map<string, OpenLot[]>();
  for (const l of input.fifo.openLots) {
    const list = lotsByAccount.get(l.accountId);
    if (list) list.push(l);
    else lotsByAccount.set(l.accountId, [l]);
  }

  const byAccount = new Map<string, Holding>();
  const byWallet = new Map<string, Holding>();
  for (const w of wallets) {
    const walletEntries: LedgerEntry[] = [];
    const walletLots: OpenLot[] = [];
    for (const a of w.accounts) {
      const entries = entriesByAccount.get(a.id) ?? [];
      const lots = lotsByAccount.get(a.id) ?? [];
      walletEntries.push(...entries);
      walletLots.push(...lots);
      byAccount.set(a.id, buildHolding(entries, lots, input.priceEur, now));
    }
    byWallet.set(w.id, buildHolding(walletEntries, walletLots, input.priceEur, now));
  }
  return {
    byAccount,
    byWallet,
    total: buildHolding(input.entries, input.fifo.openLots, input.priceEur, now),
  };
}

/**
 * Ledger balance of one account, optionally as it would be without one
 * transaction.
 *
 * `excludeTxId` is what the decision surfaces need: the lot picker and the
 * transfer dialog show what an account holds *before* the transaction being
 * edited, and then what is left after it. Asking the plain balance instead
 * would count an existing transaction twice and a new one not at all —
 * two different answers to the same question depending on how the dialog
 * was reached.
 */
export function accountBalanceBtc(
  entries: LedgerEntry[],
  accountId: string,
  opts: { excludeTxId?: string } = {},
): Decimal {
  let sum = ZERO;
  for (const e of entries) {
    if (e.accountId !== accountId || e.id === opts.excludeTxId) continue;
    sum = sum.plus(balanceDelta(e));
  }
  return sum;
}

/**
 * What the rows currently on screen add up to.
 *
 * The fallback for a filter that is not a scope — a type, a data-quality
 * issue, a period. Those select transactions, not coins, so there is no
 * "holding" to state and the honest answer is the sum of what is shown. It is
 * labelled as exactly that wherever it appears (§4 of the feature spec).
 */
export interface RowTotals {
  count: number;
  /** What these rows brought in and took out, BTC fees applied per §3.2. */
  inflowBtc: Decimal;
  outflowBtc: Decimal;
  netBtc: Decimal;
  feeBtc: Decimal;
  feeFiatEur: Decimal;
  /**
   * EUR of the rows that carry a price of their own (buy/sell/spend/income).
   * Transfer legs are left out on purpose: the value they show is derived from
   * the buys behind them (§3.2), so adding it to those buys counts the same
   * euros twice.
   */
  valueEur: Decimal;
  /** How many rows that sum covers, and how many priced ones carry no figure. */
  valuedCount: number;
  unvaluedCount: number;
}

export function rowTotals(entries: LedgerEntry[]): RowTotals {
  let inflow = ZERO;
  let outflow = ZERO;
  let feeBtc = ZERO;
  let feeFiat = ZERO;
  let value = ZERO;
  let valued = 0;
  let unvalued = 0;
  for (const e of entries) {
    const delta = balanceDelta(e);
    if (delta.gte(0)) inflow = inflow.plus(delta);
    else outflow = outflow.plus(delta.neg());
    if (e.type !== "transfer_in" && e.type !== "gift_in") {
      feeBtc = feeBtc.plus(dec(e.feeBtc));
    }
    feeFiat = feeFiat.plus(dec(e.feeFiatEur));
    if (!isPriced(e.type)) continue;
    const total =
      e.totalFiatEur != null
        ? dec(e.totalFiatEur)
        : e.pricePerBtcEur != null
          ? dec(e.amountBtc).mul(dec(e.pricePerBtcEur))
          : null;
    if (total === null) unvalued += 1;
    else {
      value = value.plus(total);
      valued += 1;
    }
  }
  return {
    count: entries.length,
    inflowBtc: inflow,
    outflowBtc: outflow,
    netBtc: inflow.minus(outflow),
    feeBtc,
    feeFiatEur: feeFiat,
    valueEur: value,
    valuedCount: valued,
    unvaluedCount: unvalued,
  };
}
