// Balance math over the ledger (independent of FIFO/tax logic).

import { Decimal, dec, ZERO } from "./decimal";
import type { LedgerEntry } from "./types";

/** Signed BTC delta a transaction applies to its own account. */
export function balanceDelta(e: LedgerEntry): Decimal {
  const amount = dec(e.amountBtc);
  const fee = dec(e.feeBtc);
  switch (e.type) {
    case "buy":
      return amount.minus(fee);
    case "transfer_in":
      return amount;
    case "transfer_out":
      // For transfers the BTC network fee is part of the sent amount (the
      // in-leg records amountBtc − feeBtc), so it must not be subtracted
      // again here.
      return amount.neg();
    case "sell":
    case "spend":
      return amount.plus(fee).neg();
  }
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
