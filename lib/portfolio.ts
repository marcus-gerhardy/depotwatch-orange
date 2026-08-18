// Balance math over the ledger (independent of FIFO/tax logic).

import { Decimal, dec, ZERO } from "./decimal";
import type { LedgerEntry } from "./types";

/**
 * Signed BTC delta a transaction applies to its own account (CLAUDE.md §3.2).
 *
 * `amountBtc` is what reaches the other side — the coins received on a buy or
 * transfer_in, the coins sold/spent/sent on the outgoing types. `feeBtc` is
 * always on top of that: a buy credits `amountBtc − feeBtc`, every outgoing
 * type (including an internal transfer_out) debits `amountBtc + feeBtc`. For a
 * transfer that sum is exactly what its lot allocations add up to.
 */
export function balanceDelta(e: LedgerEntry): Decimal {
  const amount = dec(e.amountBtc);
  const fee = dec(e.feeBtc);
  switch (e.type) {
    // A BTC fee comes off what a buy credits; income is bought with work
    // rather than money but arrives the same way.
    case "buy":
    case "income":
      return amount.minus(fee);
    // Nothing is charged on a gift arriving, and a transfer_in records what
    // the out-leg sent — its fee was already paid over there.
    case "transfer_in":
    case "gift_in":
      return amount;
    case "sell":
    case "spend":
    case "transfer_out":
    case "gift_out":
      return amount.plus(fee).neg();
  }
}

/**
 * Total BTC held across all accounts: buys + transfer_ins − sells −
 * transfer_outs − spends, with BTC fees applied per the fee convention
 * (CLAUDE.md §3.2). This — not the FIFO engine's open-lot sum — is the
 * portfolio holding: FIFO can only account for disposals it finds lots for,
 * so an incomplete history (e.g. a CSV export that starts mid-history) would
 * overstate the balance there.
 */
export function totalBalance(entries: LedgerEntry[]): Decimal {
  return entries.reduce((sum, e) => sum.plus(balanceDelta(e)), ZERO);
}

/** A value the ledger can actually compute with (see the note in `dec`). */
const NUMERIC = /^-?\d+(\.\d+)?$/;

export interface BalanceBreakdown {
  buys: Decimal;
  transferIns: Decimal;
  sells: Decimal;
  transferOuts: Decimal;
  spends: Decimal;
  /** Coins that arrived without being bought, and coins given away (§3.2). */
  giftsIn: Decimal;
  giftsOut: Decimal;
  income: Decimal;
  /** BTC fees, already contained in the sums above. */
  feeBtc: Decimal;
  /** Entries whose amount or BTC fee is not a number — they count as 0. */
  invalid: LedgerEntry[];
  total: Decimal;
}

/**
 * How the holding is composed, so a balance that looks wrong can be traced to
 * the transactions it comes from: the five type sums (each already carrying its
 * BTC fee per §3.2), what those fees add up to, and the entries whose amount is
 * unusable. `dec` turns anything unparseable into 0, so a hand-edited file with
 * "0,5" instead of "0.5" would silently shrink the balance — those rows are
 * listed instead of disappearing.
 */
export function balanceBreakdown(entries: LedgerEntry[]): BalanceBreakdown {
  const out: BalanceBreakdown = {
    buys: ZERO,
    transferIns: ZERO,
    sells: ZERO,
    transferOuts: ZERO,
    spends: ZERO,
    giftsIn: ZERO,
    giftsOut: ZERO,
    income: ZERO,
    feeBtc: ZERO,
    invalid: [],
    total: ZERO,
  };
  for (const e of entries) {
    const delta = balanceDelta(e);
    switch (e.type) {
      case "buy":
        out.buys = out.buys.plus(delta);
        break;
      case "transfer_in":
        out.transferIns = out.transferIns.plus(delta);
        break;
      case "sell":
        out.sells = out.sells.plus(delta);
        break;
      case "transfer_out":
        out.transferOuts = out.transferOuts.plus(delta);
        break;
      case "spend":
        out.spends = out.spends.plus(delta);
        break;
      case "gift_in":
        out.giftsIn = out.giftsIn.plus(delta);
        break;
      case "gift_out":
        out.giftsOut = out.giftsOut.plus(delta);
        break;
      case "income":
        out.income = out.income.plus(delta);
        break;
    }
    // A transfer_in's fee stays with the out-leg, and nothing is charged on a
    // gift arriving — neither is part of any fee sum.
    if (e.type !== "transfer_in" && e.type !== "gift_in") {
      out.feeBtc = out.feeBtc.plus(dec(e.feeBtc));
    }
    const amountOk = NUMERIC.test(e.amountBtc.trim());
    const feeOk = e.feeBtc === undefined || NUMERIC.test(e.feeBtc.trim());
    if (!amountOk || !feeOk) out.invalid.push(e);
    out.total = out.total.plus(delta);
  }
  return out;
}

export interface AccountBalance {
  walletId: string;
  walletName: string;
  accountId: string;
  accountName: string;
  btc: Decimal;
}

export function accountBalances(entries: LedgerEntry[]): AccountBalance[] {
  const map = new Map<string, AccountBalance>();
  for (const e of entries) {
    let b = map.get(e.accountId);
    if (!b) {
      b = {
        walletId: e.walletId,
        walletName: e.walletName,
        accountId: e.accountId,
        accountName: e.accountName,
        btc: ZERO,
      };
      map.set(e.accountId, b);
    }
    b.btc = b.btc.plus(balanceDelta(e));
  }
  return [...map.values()];
}

export interface DailyBalance {
  /** UTC day start, ms epoch. */
  time: number;
  btc: Decimal;
}

/**
 * When each entry is booked against the *total* holding, keyed by id.
 *
 * For everything except a paired `transfer_in` this is the entry's own date.
 * An arrival that belongs to a send is booked on the send's date instead: the
 * two legs of one internal transfer regularly carry different timestamps (see
 * `dailyBalanceSeries` below), and counting them on their own days makes the
 * total holding jump by the moved amount in between — a transfer that never
 * changed it by more than its network fee.
 *
 * One implementation, because more than one thing needs it: the daily series,
 * and the year-in-review's net growth (`lib/yearInReview.ts`), where the same
 * pair straddling New Year's Eve would otherwise show up as a year's stacking.
 */
export function bookingDates(entries: LedgerEntry[]): Map<string, string> {
  // Earliest out-leg per group: normally there is exactly one.
  const sendDateByGroup = new Map<string, string>();
  for (const e of entries) {
    if (e.type !== "transfer_out" || !e.transferGroupId) continue;
    const known = sendDateByGroup.get(e.transferGroupId);
    if (known === undefined || new Date(e.date).getTime() < new Date(known).getTime()) {
      sendDateByGroup.set(e.transferGroupId, e.date);
    }
  }
  const out = new Map<string, string>();
  for (const e of entries) {
    const send =
      e.type === "transfer_in" && e.transferGroupId
        ? sendDateByGroup.get(e.transferGroupId)
        : undefined;
    out.set(e.id, send ?? e.date);
  }
  return out;
}

export interface DailyValue {
  /** UTC day start, ms epoch. */
  time: number;
  btc: number;
  /** BTC close of that day in the requested currency. */
  close: number;
  /** Holding valued at that day's close. */
  value: number;
}

/**
 * The holding valued day by day: the balance series priced with the daily
 * close. Days the price source has no candle for carry the previous close
 * forward, and days before the first known close are dropped — a portfolio
 * value of 0 for lack of a price would read as "sold everything".
 *
 * Shared by the value chart and the change figures on the dashboard, so both
 * always tell the same story.
 */
export function dailyValueSeries(
  entries: LedgerEntry[],
  closes: { time: number; close: number }[],
): DailyValue[] {
  const closeByDay = new Map(closes.map((c) => [c.time, c.close]));
  const out: DailyValue[] = [];
  let lastClose: number | null = null;
  for (const b of dailyBalanceSeries(entries)) {
    const close: number | null = closeByDay.get(b.time) ?? lastClose;
    if (close === null) continue;
    lastClose = close;
    const btc = b.btc.toNumber();
    out.push({ time: b.time, btc, close, value: btc * close });
  }
  return out;
}

/**
 * Cumulative total BTC balance per UTC day, from first transaction to today.
 *
 * **Both legs of an internal transfer are booked on the out-leg's day.** The
 * two legs of one transfer regularly carry different timestamps — a hardware
 * wallet stamps the arrival when it sees it, an exchange stamps the withdrawal
 * when it completes, and two CSV exports need not agree at all (§11). Booked
 * on their own days, such a pair makes the *total* holding jump: it rises by
 * the moved amount on the arrival day and falls back on the send day, which
 * draws a spike out of a transfer that never changed the holding by more than
 * its network fee. (The opposite order draws the same artefact as a dip.)
 *
 * So a paired `transfer_in` is booked on the day its out-leg left, which is
 * also the day the fee was actually burnt; the arrival's own date stays what
 * §3.2 says it is — display data. An unpaired leg keeps its own day, because
 * an arrival with no send behind it *is* an inflow from outside.
 */
export function dailyBalanceSeries(entries: LedgerEntry[]): DailyBalance[] {
  if (entries.length === 0) return [];
  const DAY = 86_400_000;
  const booked = bookingDates(entries);
  const dayOf = (iso: string) => Math.floor(new Date(iso).getTime() / DAY) * DAY;

  const deltasByDay = new Map<number, Decimal>();
  for (const e of entries) {
    const day = dayOf(booked.get(e.id) ?? e.date);
    deltasByDay.set(day, (deltasByDay.get(day) ?? ZERO).plus(balanceDelta(e)));
  }
  const firstDay = Math.min(...deltasByDay.keys());
  const today = Math.floor(Date.now() / DAY) * DAY;
  const out: DailyBalance[] = [];
  let running = ZERO;
  for (let day = firstDay; day <= today; day += DAY) {
    const delta = deltasByDay.get(day);
    if (delta) running = running.plus(delta);
    out.push({ time: day, btc: running });
  }
  return out;
}
