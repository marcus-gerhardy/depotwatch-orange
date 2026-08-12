// The year in review (CLAUDE.md §4.2).
//
// One pure function over what the app already has — the flattened ledger, the
// FIFO result, the milestone records — plus whatever historical closes happen
// to be cached. No fetching, no clock reading, no formatting: the caller passes
// `now` and every figure comes out as a Decimal, so rounding happens where it
// belongs, in the formatters.
//
// **It reports behaviour, never a verdict.** Every figure here is something the
// user did — bought, held, moved into their own custody, paid in fees. Nothing
// says whether a price was a good one, because the app cannot know that and the
// question is not the user's to be graded on. That is a rule about the wording
// as much as about the maths: "highest and lowest price paid" is a range, not
// a best and a worst.
//
// Cards with no basis are not rendered empty — `cards` lists exactly the ones
// this year can actually fill, and a year without a single transaction says so
// instead of showing twelve zeroes.

import { Decimal, dec, ZERO } from "./decimal";
import { feeTotals, type FeeTotals } from "./dashboardStats";
import { type FifoResult } from "./fifo";
import { balanceDelta, bookingDates } from "./portfolio";
import { SELF_CUSTODY, selfCustodyShare, type MilestoneRecord } from "./milestones";
import type { LedgerEntry, Wallet } from "./types";

export type YearReviewCardId =
  | "stacked"
  | "invested"
  | "avgPrice"
  | "priceRange"
  | "rhythm"
  | "streak"
  | "fees"
  | "taxFree"
  | "realized"
  | "custody"
  | "milestones"
  | "closing";

/**
 * The order the cards are stepped through: what was put in, at what rate, in
 * what rhythm, what it cost, what it means for tax, where the coins ended up —
 * and the holding last, because that is the one figure the whole year adds up
 * to.
 */
export const CARD_ORDER: YearReviewCardId[] = [
  "stacked",
  "invested",
  "avgPrice",
  "priceRange",
  "rhythm",
  "streak",
  "fees",
  "taxFree",
  "realized",
  "custody",
  "milestones",
  "closing",
];

export interface StackedCard {
  /** Net BTC the holding grew by, internal transfers cancelled out. */
  netBtc: Decimal;
  buyCount: number;
  btcBought: Decimal;
  /** Growth against the holding at the start of the year; null from zero. */
  growth: number | null;
}

export interface InvestedCard {
  /** EUR of every buy in the year, its fiat fee included. */
  investedEur: Decimal;
  buyCount: number;
  /** Buys with no EUR figure at all — not part of the sum. */
  buysWithoutEur: number;
}

export interface AvgPriceCard {
  /** Volume-weighted average of what was actually paid, EUR per BTC. */
  yourAvgEur: Decimal;
  /** Mean of the daily closes of the year; null when none are cached. */
  marketAvgEur: Decimal | null;
  /** How many days the market average rests on — a year has ~365. */
  marketDays: number;
  /** Your average against the market's, as a share (−0.04 = 4 % below). */
  vsMarket: number | null;
}

export interface PriceRangeCard {
  lowEur: Decimal;
  highEur: Decimal;
  /** Buys the range was taken over. */
  buyCount: number;
}

export interface RhythmCard {
  /** 0–11, local months. */
  busiestMonth: number;
  busiestMonthBuys: number;
  busiestMonthBtc: Decimal;
  /** 0–6, Sunday first (JS `getDay`). */
  busiestWeekday: number;
  busiestWeekdayBuys: number;
}

export interface StreakCard {
  /** Whichever run is longer in real time — weeks in a row, or months. */
  unit: "weeks" | "months";
  length: number;
}

export interface TaxFreeCard {
  /** Still-held BTC whose holding period ran out during this year. */
  btc: Decimal;
  lotCount: number;
  /**
   * Held BTC whose origin never resolved (§3.2). Its acquisition date is an
   * arrival, so it is reported as not judgeable rather than counted as
   * anything — the one wrong answer here would be a confident one.
   */
  unresolvedBtc: Decimal;
}

export interface RealizedCard {
  taxableGainEur: Decimal;
  taxFreeGainEur: Decimal;
  totalGainEur: Decimal;
  disposalCount: number;
  /** BTC disposed of from lots whose origin never resolved. */
  unresolvedOriginBtc: Decimal;
}

export interface CustodyCard {
  /** Transfers that moved coins from an exchange into an own wallet. */
  toSelfCustody: number;
  btcToSelfCustody: Decimal;
  /** Share of the holding in own custody at the end of the year, 0…1. */
  shareAtYearEnd: number;
}

export interface ClosingCard {
  btc: Decimal;
  /** The holding a year earlier, for the change the closing card names. */
  startBtc: Decimal;
}

export interface YearReview {
  year: number;
  /** Is there anything to show for this year? See the note where it is set. */
  hasData: boolean;
  /** Exactly the cards this year can fill, in display order. */
  cards: YearReviewCardId[];
  transactionCount: number;
  stacked: StackedCard;
  invested: InvestedCard;
  avgPrice: AvgPriceCard | null;
  priceRange: PriceRangeCard | null;
  rhythm: RhythmCard | null;
  streak: StreakCard | null;
  fees: FeeTotals;
  taxFree: TaxFreeCard;
  realized: RealizedCard;
  custody: CustodyCard;
  /** Milestone ids reached during the year, oldest first. */
  milestones: string[];
  closing: ClosingCard;
}

export interface YearReviewInput {
  year: number;
  /** The whole ledger, not just the year — balances need the history. */
  entries: LedgerEntry[];
  fifo: FifoResult;
  wallets: Wallet[];
  milestones: MilestoneRecord[];
  /**
   * Daily closes by UTC day start, as far as they are *already* cached. Empty
   * is a legitimate state: the review then leaves the market comparison out
   * instead of fetching a year of history nobody asked for (§4.2).
   */
  closeByDay: Map<number, number>;
  now: Date;
}

const DAY = 86_400_000;

/** Local start of a year — the user's year, like every other day-of feature. */
export function yearStart(year: number): number {
  return new Date(year, 0, 1).getTime();
}
export function yearEnd(year: number): number {
  return new Date(year + 1, 0, 1).getTime() - 1;
}

const timeOf = (iso: string): number => new Date(iso).getTime();

/** The transaction's own EUR total (fees excluded), or null when unrecorded. */
function totalEurOf(e: LedgerEntry): Decimal | null {
  if (e.totalFiatEur != null) return dec(e.totalFiatEur);
  if (e.pricePerBtcEur != null) return dec(e.amountBtc).mul(dec(e.pricePerBtcEur));
  return null;
}

/** What one trade was executed at per BTC — the same rule the price chart uses. */
function executedPriceEur(e: LedgerEntry): Decimal | null {
  if (e.pricePerBtcEur != null) return dec(e.pricePerBtcEur);
  const amount = dec(e.amountBtc);
  if (e.totalFiatEur != null && amount.gt(0)) return dec(e.totalFiatEur).div(amount);
  return null;
}

/** Monday-based week key of a local timestamp, for the buying streak. */
function weekIndex(ms: number): number {
  const d = new Date(ms);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // 1970-01-01 was a Thursday, hence the shift to a Monday-based week.
  return Math.floor((Math.floor(local / DAY) + 3) / 7);
}

/** Longest run of consecutive values in a set of period indices. */
function longestRun(indices: Set<number>): number {
  let best = 0;
  for (const i of indices) {
    if (indices.has(i - 1)) continue; // only start counting at a run's head
    let length = 1;
    while (indices.has(i + length)) length += 1;
    if (length > best) best = length;
  }
  return best;
}

/**
 * Which years the review can be asked for: every **completed** year the ledger
 * touches, newest first.
 *
 * The running year is deliberately not among them. A review of a year that is
 * still going is a half figure presented as a whole one: the average price has
 * months to move, the streak can still grow, and "stacked this year" said in
 * March is not the same statement it will be in December. So the review starts
 * existing the moment a year is over, and never changes afterwards.
 */
export function reviewableYears(
  entries: LedgerEntry[],
  now: Date = new Date(),
): number[] {
  const lastYear = now.getFullYear() - 1;
  let first: number | null = null;
  for (const e of entries) {
    const t = timeOf(e.date);
    if (Number.isNaN(t)) continue;
    const year = new Date(t).getFullYear();
    if (first === null || year < first) first = year;
  }
  if (first === null || first > lastYear) return [];
  // A contiguous range rather than "years that have a transaction": a year in
  // which nothing was bought still has a story — what passed the holding
  // period, which milestones arrived, what was held on 31 December — and a
  // picker that skips 2024 because that was the year one did nothing would be
  // hiding a year rather than being tidy.
  const years: number[] = [];
  for (let y = lastYear; y >= first; y--) years.push(y);
  return years;
}

/** The most recent year there is a review for, or null while there is none. */
export function latestReviewYear(
  entries: LedgerEntry[],
  now: Date = new Date(),
): number | null {
  return reviewableYears(entries, now)[0] ?? null;
}

export function computeYearReview(input: YearReviewInput): YearReview {
  const { year, entries, fifo, wallets, closeByDay, now } = input;
  const from = yearStart(year);
  const to = yearEnd(year);
  const nowMs = now.getTime();

  const walletTypes = new Map(wallets.map((w) => [w.id, w.type]));
  const walletOfAccount = new Map(entries.map((e) => [e.accountId, e.walletId]));
  const booked = bookingDates(entries);

  const inYear = (iso: string) => {
    const t = timeOf(iso);
    return !Number.isNaN(t) && t >= from && t <= to;
  };

  /** Transactions of the year, by their own date — "what happened in 2025". */
  const yearEntries = entries.filter((e) => inYear(e.date));
  const buys = yearEntries.filter((e) => e.type === "buy");

  // ---------------------------------------------------------------- stacked
  // Booked dates, not own dates: a transfer whose legs straddle New Year's Eve
  // would otherwise count as a year's stacking on one side and as a loss on
  // the other, when nothing entered or left the portfolio at all.
  let netBtc = ZERO;
  let startBtc = ZERO;
  let closingBtc = ZERO;
  for (const e of entries) {
    const t = timeOf(booked.get(e.id) ?? e.date);
    if (Number.isNaN(t)) continue;
    const delta = balanceDelta(e);
    if (t < from) startBtc = startBtc.plus(delta);
    if (t >= from && t <= to) netBtc = netBtc.plus(delta);
    if (t <= to) closingBtc = closingBtc.plus(delta);
  }
  const btcBought = buys.reduce((s, e) => s.plus(balanceDelta(e)), ZERO);
  const stacked: StackedCard = {
    netBtc,
    buyCount: buys.length,
    btcBought,
    growth: startBtc.gt(0) ? netBtc.div(startBtc).toNumber() : null,
  };

  // --------------------------------------------------------------- invested
  const fees = feeTotals(yearEntries, closeByDay);
  const invested: InvestedCard = {
    investedEur: fees.investedEur,
    buyCount: buys.length,
    buysWithoutEur: buys.filter((e) => totalEurOf(e) === null).length,
  };

  // --------------------------------------------------- average price / range
  let paidEur = ZERO;
  let paidBtc = ZERO;
  let lowEur: Decimal | null = null;
  let highEur: Decimal | null = null;
  let pricedBuys = 0;
  for (const e of buys) {
    const price = executedPriceEur(e);
    const total = totalEurOf(e);
    const amount = dec(e.amountBtc);
    if (price === null || total === null || !amount.gt(0)) continue;
    pricedBuys += 1;
    // Volume-weighted over the gross amount, like the chart's trade markers:
    // what was paid, for what was bought.
    paidEur = paidEur.plus(total);
    paidBtc = paidBtc.plus(amount);
    if (lowEur === null || price.lt(lowEur)) lowEur = price;
    if (highEur === null || price.gt(highEur)) highEur = price;
  }

  let marketSum = ZERO;
  let marketDays = 0;
  for (const [day, close] of closeByDay) {
    if (day < from || day > to || !Number.isFinite(close) || close <= 0) continue;
    marketSum = marketSum.plus(close);
    marketDays += 1;
  }
  const marketAvgEur = marketDays > 0 ? marketSum.div(marketDays) : null;

  const yourAvgEur = paidBtc.gt(0) ? paidEur.div(paidBtc) : null;
  const avgPrice: AvgPriceCard | null =
    yourAvgEur === null
      ? null
      : {
          yourAvgEur,
          marketAvgEur,
          marketDays,
          vsMarket:
            marketAvgEur !== null && marketAvgEur.gt(0)
              ? yourAvgEur.div(marketAvgEur).minus(1).toNumber()
              : null,
        };

  // A single buy is not a range: low and high would be the same number twice.
  const priceRange: PriceRangeCard | null =
    lowEur !== null && highEur !== null && pricedBuys > 1
      ? { lowEur, highEur, buyCount: pricedBuys }
      : null;

  // ----------------------------------------------------------------- rhythm
  const monthBuys = new Array(12).fill(0) as number[];
  const monthBtc = new Array(12).fill(null).map(() => ZERO) as Decimal[];
  const weekdayBuys = new Array(7).fill(0) as number[];
  const weekIndices = new Set<number>();
  const monthIndices = new Set<number>();
  for (const e of buys) {
    const t = timeOf(e.date);
    if (Number.isNaN(t)) continue;
    const d = new Date(t);
    monthBuys[d.getMonth()] += 1;
    monthBtc[d.getMonth()] = monthBtc[d.getMonth()].plus(balanceDelta(e));
    weekdayBuys[d.getDay()] += 1;
    weekIndices.add(weekIndex(t));
    monthIndices.add(d.getFullYear() * 12 + d.getMonth());
  }
  let busiestMonth = -1;
  for (let m = 0; m < 12; m++) {
    if (monthBuys[m] === 0) continue;
    // Ties go to the month more BTC was bought in, then to the earlier one.
    if (
      busiestMonth === -1 ||
      monthBuys[m] > monthBuys[busiestMonth] ||
      (monthBuys[m] === monthBuys[busiestMonth] && monthBtc[m].gt(monthBtc[busiestMonth]))
    ) {
      busiestMonth = m;
    }
  }
  let busiestWeekday = -1;
  for (let d = 0; d < 7; d++) {
    if (weekdayBuys[d] === 0) continue;
    if (busiestWeekday === -1 || weekdayBuys[d] > weekdayBuys[busiestWeekday]) {
      busiestWeekday = d;
    }
  }
  const rhythm: RhythmCard | null =
    busiestMonth === -1
      ? null
      : {
          busiestMonth,
          busiestMonthBuys: monthBuys[busiestMonth],
          busiestMonthBtc: monthBtc[busiestMonth],
          busiestWeekday,
          busiestWeekdayBuys: weekdayBuys[busiestWeekday],
        };

  // ----------------------------------------------------------------- streak
  const weekRun = longestRun(weekIndices);
  const monthRun = longestRun(monthIndices);
  // A run of one is not a streak, in either unit — which is also why the two
  // are compared only when both are real: four weeks in a row (28 days) must
  // not lose to a single month (30 days) that is no streak at all.
  const weekStreak = weekRun >= 2;
  const monthStreak = monthRun >= 2;
  const streak: StreakCard | null =
    !weekStreak && !monthStreak
      ? null
      : weekStreak && (!monthStreak || weekRun * 7 >= monthRun * 30)
        ? { unit: "weeks", length: weekRun }
        : { unit: "months", length: monthRun };

  // ---------------------------------------------------------------- tax-free
  // Read off the engine's open lots, whose acquisition dates are the traced
  // originals (§3.2) — never the day coins arrived somewhere.
  let taxFreeBtc = ZERO;
  let taxFreeLots = 0;
  let unresolvedHeldBtc = ZERO;
  for (const lot of fifo.openLots) {
    if (!lot.remainingBtc.gt(0)) continue;
    if (lot.originUnresolved) {
      unresolvedHeldBtc = unresolvedHeldBtc.plus(lot.remainingBtc);
      continue;
    }
    const crossed = lot.taxFreeDate.getTime();
    // Not "will cross this year": a period that has not run out yet has not
    // made anything tax-free, and December must not promise otherwise.
    if (crossed < from || crossed > to || crossed > nowMs) continue;
    taxFreeBtc = taxFreeBtc.plus(lot.remainingBtc);
    taxFreeLots += 1;
  }
  const taxFree: TaxFreeCard = {
    btc: taxFreeBtc,
    lotCount: taxFreeLots,
    unresolvedBtc: unresolvedHeldBtc,
  };

  // ---------------------------------------------------------------- realized
  let taxableGainEur = ZERO;
  let taxFreeGainEur = ZERO;
  let unresolvedOriginBtc = ZERO;
  let disposalCount = 0;
  for (const d of fifo.disposals) {
    if (!inYear(d.date)) continue;
    disposalCount += 1;
    taxableGainEur = taxableGainEur.plus(d.taxableGainEur);
    taxFreeGainEur = taxFreeGainEur.plus(d.taxFreeGainEur);
    unresolvedOriginBtc = unresolvedOriginBtc.plus(d.unresolvedOriginBtc);
  }
  const realized: RealizedCard = {
    taxableGainEur,
    taxFreeGainEur,
    totalGainEur: taxableGainEur.plus(taxFreeGainEur),
    disposalCount,
    unresolvedOriginBtc,
  };

  // ----------------------------------------------------------------- custody
  let toSelfCustody = 0;
  let btcToSelfCustody = ZERO;
  for (const e of yearEntries) {
    if (e.type !== "transfer_out") continue;
    if (walletTypes.get(e.walletId) !== "exchange") continue;
    if (e.counterpartyAccountId === undefined) continue;
    const targetWallet = walletOfAccount.get(e.counterpartyAccountId);
    const targetType = targetWallet ? walletTypes.get(targetWallet) : undefined;
    if (targetType === undefined || !SELF_CUSTODY.includes(targetType)) continue;
    toSelfCustody += 1;
    btcToSelfCustody = btcToSelfCustody.plus(dec(e.amountBtc));
  }
  const untilYearEnd = entries.filter((e) => {
    const t = timeOf(booked.get(e.id) ?? e.date);
    return !Number.isNaN(t) && t <= to;
  });
  const custody: CustodyCard = {
    toSelfCustody,
    btcToSelfCustody,
    shareAtYearEnd: selfCustodyShare(untilYearEnd, walletTypes),
  };

  // -------------------------------------------------------------- milestones
  const milestones = [...input.milestones]
    .filter((m) => inYear(m.achievedAt))
    .sort((a, b) => a.achievedAt.localeCompare(b.achievedAt))
    .map((m) => m.id);

  const closing: ClosingCard = { btc: closingBtc, startBtc };

  // Which cards this year can actually fill. A card with no basis is left out
  // here rather than rendered as a zero: "0 € invested" is not a fact about a
  // year, it is a fact about a card that should not have been shown.
  const available: YearReviewCardId[] = [];
  const add = (id: YearReviewCardId, ok: boolean) => {
    if (ok) available.push(id);
  };
  add("stacked", buys.length > 0 || !netBtc.isZero());
  add("invested", fees.investedEur.gt(0));
  add("avgPrice", avgPrice !== null);
  add("priceRange", priceRange !== null);
  add("rhythm", rhythm !== null);
  add("streak", streak !== null);
  add("fees", fees.totalEur.gt(0) || fees.unvaluedBtc.gt(0));
  add("taxFree", taxFreeBtc.gt(0) || unresolvedHeldBtc.gt(0));
  add("realized", disposalCount > 0);
  add("custody", toSelfCustody > 0 || closingBtc.gt(0));
  add("milestones", milestones.length > 0);
  add("closing", closingBtc.gt(0) || yearEntries.length > 0);

  return {
    year,
    // "Something to show", not "something happened": a year in which nothing
    // was traded still has a review when coins were held through it (what
    // passed the holding period, what was held at the end). Only a year that
    // fills no card at all gets the friendly note instead.
    hasData: yearEntries.length > 0 || available.length > 0,
    cards: CARD_ORDER.filter((id) => available.includes(id)),
    transactionCount: yearEntries.length,
    stacked,
    invested,
    avgPrice,
    priceRange,
    rhythm,
    streak,
    fees,
    taxFree,
    realized,
    custody,
    milestones,
    closing,
  };
}
