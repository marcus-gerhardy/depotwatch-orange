// EUR valuation for transactions that were settled in another currency or asset
// (CLAUDE.md §3.2). EUR stays the one valuation currency for every calculation;
// this only fills in the EUR figure when the source data does not carry one.

import { fetchDailyClose } from "./binance";
import { dec, fiatString } from "./decimal";

export interface EurValuation {
  /** EUR per BTC — the Binance BTC/EUR close of the transaction's day. */
  pricePerBtcEur: string;
  /** `amountBtc` × price, 2 decimals. */
  totalFiatEur: string;
}

/** Day close lookup, injectable so tests never touch the network. */
export type CloseFetcher = (isoDate: string) => Promise<number | null>;

/**
 * Valuator for one run (a single click or one import). Each distinct day is
 * fetched once and shared by every row on it, which keeps a bulk valuation of
 * hundreds of rows down to a handful of requests.
 */
export function createEurValuator(fetchClose: CloseFetcher = fetchDailyClose) {
  const byDay = new Map<number, Promise<number | null>>();

  return async function valuate(
    isoDate: string,
    amountBtc: string,
  ): Promise<EurValuation | null> {
    const amount = dec(amountBtc);
    const time = Date.parse(isoDate);
    if (!amount.gt(0) || Number.isNaN(time)) return null;
    const day = Math.floor(time / 86_400_000);
    let close = byDay.get(day);
    if (close === undefined) {
      close = fetchClose(isoDate);
      byDay.set(day, close);
    }
    const price = await close;
    if (price === null || !(price > 0)) return null;
    const priceD = dec(price).toDecimalPlaces(2);
    return {
      pricePerBtcEur: fiatString(priceD),
      totalFiatEur: fiatString(priceD.mul(amount).toDecimalPlaces(2)),
    };
  };
}

/** One-off valuation, e.g. the button in the transaction form. */
export function suggestEurValuation(
  isoDate: string,
  amountBtc: string,
  fetchClose?: CloseFetcher,
): Promise<EurValuation | null> {
  return createEurValuator(fetchClose)(isoDate, amountBtc);
}
