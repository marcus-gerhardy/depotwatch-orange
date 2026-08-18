// The portfolio as it stood on a past date (CLAUDE.md §4.3).
//
// "What did I hold on 31 December" is a question the tax return asks every
// year, and one nobody can answer from the live view. It is answered here the
// only way that keeps it consistent with everything else the app says: by
// running the *same* engine over the *same* ledger, with everything after the
// cut-off left out. No second implementation of holding periods, cost basis or
// lot tracing — a point-in-time view that disagreed with the live one about a
// lot would be worse than no view at all.
//
// Two details that decide whether the figures are right:
//
//  • the cut-off is inclusive to the **end** of the chosen day, because "as of
//    31 December" means the day is over, not that it is about to start;
//  • entries are cut by their **booking date** (`bookingDates`), so a paired
//    arrival counts from the day its out-leg left. The two legs of one transfer
//    regularly carry different timestamps, and cutting between them would show
//    coins in neither account, or in both.

import { computeFifo, isLotTaxFree, type FifoResult, type OpenLot } from "./fifo";
import { accountBalances, bookingDates, totalBalance, type AccountBalance } from "./portfolio";
import { Decimal, ZERO } from "./decimal";
import type { LedgerEntry } from "./types";

export interface PointInTimeResult {
  /** End of the chosen day — what "as of" actually means here. */
  asOf: Date;
  /** The entries that had happened by then, in causal order. */
  entries: LedgerEntry[];
  fifo: FifoResult;
  /** Holding from the ledger, never from the engine (§11). */
  balanceBtc: Decimal;
  balances: AccountBalance[];
  /** Open lots at that moment, with the holding-period status *of that day*. */
  openLots: OpenLot[];
  /** Of the holding, what was already past the holding period on that day. */
  taxFreeBtc: Decimal;
  /** …and what was not. */
  lockedBtc: Decimal;
  /**
   * Coins whose acquisition date is an assumption (§3.2) — neither counted as
   * tax-free nor as locked, because either answer would be invented.
   */
  unresolvedBtc: Decimal;
  /** Cost basis of the open lots that have one. */
  costBasisEur: Decimal;
  /** BTC that cost basis covers — never the whole holding (§4.1). */
  basisBtc: Decimal;
}

/** End of the given day, local time: "as of the 31st" includes the 31st. */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * The portfolio as of the end of `date`.
 *
 * `entries` is the whole ledger; nothing is mutated. The FIFO engine sees a
 * shorter history and therefore reports the lots, holding periods and cost
 * basis that were true then — including, honestly, the gaps: an arrival whose
 * out-leg is on the far side of the cut-off resolves to nothing, and is
 * reported as unresolved rather than silently given the arrival's own date.
 */
export function portfolioAsOf(
  entries: LedgerEntry[],
  date: Date,
  holdingPeriodDays: number,
): PointInTimeResult {
  const asOf = endOfDay(date);
  const booked = bookingDates(entries);
  const upTo = entries.filter((e) => {
    const when = booked.get(e.id) ?? e.date;
    const t = new Date(when).getTime();
    return !Number.isNaN(t) && t <= asOf.getTime();
  });

  const fifo = computeFifo(upTo, holdingPeriodDays);
  const openLots = fifo.openLots.filter((l) => l.remainingBtc.gt(0));

  let taxFree = ZERO;
  let locked = ZERO;
  let unresolved = ZERO;
  for (const lot of openLots) {
    // Judged against the chosen day, not against today: that is the whole
    // point of the view. A lot's acquisition date whose origin never resolved
    // is an assumption, so it is counted as neither (§3.2).
    if (lot.originUnresolved) unresolved = unresolved.plus(lot.remainingBtc);
    else if (isLotTaxFree(lot, asOf)) taxFree = taxFree.plus(lot.remainingBtc);
    else locked = locked.plus(lot.remainingBtc);
  }

  return {
    asOf,
    entries: upTo,
    fifo,
    balanceBtc: totalBalance(upTo),
    balances: accountBalances(upTo),
    openLots,
    taxFreeBtc: taxFree,
    lockedBtc: locked,
    unresolvedBtc: unresolved,
    costBasisEur: fifo.openCostBasisEur,
    basisBtc: fifo.openBasisBtc,
  };
}

/**
 * The year ends worth offering, newest first.
 *
 * Only years that are over: a "year end" that has not happened is not a
 * position, it is a guess. From the first transaction to the last completed
 * year, gaps included — a year in which nothing was traded still had a
 * holding, and that is exactly what somebody looks up.
 */
export function yearEndOptions(entries: LedgerEntry[], now: Date = new Date()): Date[] {
  const years = entries
    .map((e) => new Date(e.date).getFullYear())
    .filter((y) => Number.isFinite(y));
  if (years.length === 0) return [];
  const first = Math.min(...years);
  const last = now.getFullYear() - 1;
  const out: Date[] = [];
  for (let y = last; y >= first; y--) out.push(new Date(y, 11, 31));
  return out;
}
