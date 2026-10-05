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
//    31 December" means the day is over, not that it is about to start. The
//    day is a calendar date ("YYYY-MM-DD") and ends at midnight in the
//    reference zone (docs/dates.md), so the 31 December of a tax return is the
//    same cut wherever the view is opened;
//  • entries are cut by their **booking date** (`bookingDates`), so a paired
//    arrival counts from the day its out-leg left. The two legs of one transfer
//    regularly carry different timestamps, and cutting between them would show
//    coins in neither account, or in both.

import {
  computeFifo,
  isLotTaxFree,
  type Disposal,
  type FifoResult,
  type GiftOut,
  type IncomeReceipt,
  type OpenLot,
} from "./fifo";
import { accountBalances, bookingDates, totalBalance, type AccountBalance } from "./portfolio";
import { Decimal, dec, ZERO } from "./decimal";
import type { LedgerEntry } from "./types";
import {
  addCalendarDays,
  endOfCalendarDate,
  endOfYear,
  todayCalendarDate,
  yearOfInstant,
  type CalendarDate,
} from "./dates";

export interface PointInTimeResult {
  /** The chosen calendar day. */
  day: CalendarDate;
  /** End of the chosen day in the reference zone — what "as of" means here. */
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
  day: CalendarDate,
  holdingPeriodDays: number,
): PointInTimeResult {
  // "As of the 31st" includes the 31st.
  const asOf = endOfCalendarDate(day);
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
    day,
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
 * Everything that happened between two dates, with the state on both edges
 * (§4.3).
 *
 * A tax return asks two different questions about the same year: what was held
 * on 31 December (a moment) and what was realised during it (a span). They are
 * two views of one calculation here — the closing snapshot's FIFO has already
 * run over the whole history up to the end date, so its disposals *are* the
 * period's, filtered by date. Computing them separately would be a second
 * implementation of the same thing, free to disagree with the first.
 *
 * The opening balance is the state at the end of the day *before* `from`, so
 * the period includes its own first day: "1 January to 31 December" is a whole
 * year, not 364 days with an off-by-one at each end.
 */
export interface PeriodResult {
  /** First and last calendar day of the period, both included. */
  fromDay: CalendarDate;
  toDay: CalendarDate;
  /** The instants the period runs between (exclusive, inclusive). */
  from: Date;
  to: Date;
  /** How things stood before the period began. */
  opening: PointInTimeResult;
  /** …and at its end. Every table in the view reads from this one. */
  closing: PointInTimeResult;
  /** Closing minus opening: what the period added or removed, net. */
  changeBtc: Decimal;
  /** Entries booked inside the period, in causal order. */
  entriesInPeriod: LedgerEntry[];
  /** Disposals dated inside it, with the gains they realised. */
  disposals: Disposal[];
  realizedGainEur: Decimal;
  realizedTaxableGainEur: Decimal;
  realizedTaxFreeGainEur: Decimal;
  /** Coins given away and received as income inside it (§3.2). */
  giftsOut: GiftOut[];
  incomeReceipts: IncomeReceipt[];
  /** BTC bought, and BTC disposed of, inside it. */
  boughtBtc: Decimal;
  disposedBtc: Decimal;
}

export function periodBetween(
  entries: LedgerEntry[],
  from: CalendarDate,
  to: CalendarDate,
  holdingPeriodDays: number,
): PeriodResult {
  const closing = portfolioAsOf(entries, to, holdingPeriodDays);
  // The day before the period starts: its end is the moment the period begins.
  const opening = portfolioAsOf(entries, addCalendarDays(from, -1), holdingPeriodDays);

  const start = opening.asOf.getTime();
  const end = closing.asOf.getTime();
  const inPeriod = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t > start && t <= end;
  };

  const openIds = new Set(opening.entries.map((e) => e.id));
  const entriesInPeriod = closing.entries.filter((e) => !openIds.has(e.id));

  const disposals = closing.fifo.disposals.filter((d) => inPeriod(d.date));
  const sum = (list: Disposal[], pick: (d: Disposal) => Decimal) =>
    list.reduce((acc, d) => acc.plus(pick(d)), ZERO);

  return {
    fromDay: from,
    toDay: to,
    from: new Date(start),
    to: closing.asOf,
    opening,
    closing,
    changeBtc: closing.balanceBtc.minus(opening.balanceBtc),
    entriesInPeriod,
    disposals,
    realizedGainEur: sum(disposals, (d) => d.gainEur),
    realizedTaxableGainEur: sum(disposals, (d) => d.taxableGainEur),
    realizedTaxFreeGainEur: sum(disposals, (d) => d.taxFreeGainEur),
    giftsOut: closing.fifo.giftsOut.filter((g) => inPeriod(g.date)),
    incomeReceipts: closing.fifo.incomeReceipts.filter((r) => inPeriod(r.date)),
    boughtBtc: entriesInPeriod
      .filter((e) => e.type === "buy")
      .reduce((acc, e) => acc.plus(dec(e.amountBtc)).minus(dec(e.feeBtc)), ZERO),
    disposedBtc: disposals.reduce((acc, d) => acc.plus(d.amountBtc), ZERO),
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
export function yearEndOptions(
  entries: LedgerEntry[],
  now: Date = new Date(),
): CalendarDate[] {
  // Years are cut in the reference zone, like the tax year (docs/dates.md).
  const years = entries
    .map((e) => yearOfInstant(e.date))
    .filter((y): y is number => y !== null);
  if (years.length === 0) return [];
  const first = Math.min(...years);
  const last = yearOfInstant(now)! - 1;
  const out: CalendarDate[] = [];
  for (let y = last; y >= first; y--) out.push(endOfYear(y));
  return out;
}

/** Today in the reference zone — the latest day the view can be asked about. */
export const latestPointInTimeDay = (now: Date = new Date()): CalendarDate =>
  todayCalendarDate(now);
