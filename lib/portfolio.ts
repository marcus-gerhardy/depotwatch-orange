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
    case "buy":
      return amount.minus(fee);
    case "transfer_in":
      return amount;
    case "sell":
    case "spend":
    case "transfer_out":
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

/** Cumulative total BTC balance per UTC day, from first transaction to today. */
export function dailyBalanceSeries(entries: LedgerEntry[]): DailyBalance[] {
  if (entries.length === 0) return [];
  const DAY = 86_400_000;
  const deltasByDay = new Map<number, Decimal>();
  for (const e of entries) {
    const day = Math.floor(new Date(e.date).getTime() / DAY) * DAY;
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
