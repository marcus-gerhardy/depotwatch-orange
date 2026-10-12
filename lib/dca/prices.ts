// Daily BTC/EUR closes for the savings-plan calculator (docs/dca.md).
//
// Convention: the **close of the UTC daily candle** on Binance — the last
// trade before 00:00 UTC — keyed by its UTC calendar day. Only closed candles
// count; today's running candle is not a close yet.
//
// Two sources, joined without overlap:
//   • Binance BTC/EUR, from the first day that pair has a candle (early 2020);
//   • before that, Binance BTC/USDT divided by the ECB's EUR/USD reference
//     rate (via the Frankfurter API), with USDT taken as one US dollar. The ECB
//     publishes on TARGET business days only; a weekend or holiday uses the
//     last rate published before it.
// BTC/USDT itself starts in August 2017, so that is as far back as the
// calculator goes. The page names each source and the days it covers.
//
// Everything here is public market data and is fetched only when the user
// asks for a calculation (CLAUDE.md, invariant 1). The series is cached for
// the session in memory, so changing an amount or a date does not load it
// again; nothing is written to any storage.

import { Decimal } from "../decimal";
import {
  addCalendarDays,
  calendarDateOfInstant,
  startOfCalendarDate,
  todayCalendarDate,
  type CalendarDate,
} from "../dates";
import { fetchDailyKlinePage, type DailyKline } from "../binance";
import type { PriceHistory, PriceSource } from "./simulate";

/** BTC/USDT's first daily candle on Binance; nothing older is available. */
export const EARLIEST_PRICE_DAY: CalendarDate = "2017-08-17";

/**
 * Where BTC/EUR has begun on Binance so far. Only for the explanation shown
 * before anything is loaded; the calculation uses the first candle it gets.
 */
export const BTC_EUR_SINCE: CalendarDate = "2020-01-03";

const FRANKFURTER = "https://api.frankfurter.dev/v1";

export interface SourceSegment {
  source: PriceSource;
  from: CalendarDate;
  to: CalendarDate;
}

export interface LoadedPrices extends PriceHistory {
  segments: SourceSegment[];
  /** When the series was loaded (ms), for "as of". */
  loadedAt: number;
}

export interface LoadProgress {
  /** Days loaded so far. */
  done: number;
  /** Days expected in total (an estimate until the last page arrives). */
  total: number;
}

const utcDay = (ms: number): CalendarDate => calendarDateOfInstant(ms, "UTC")!;
const utcStart = (day: CalendarDate): number => startOfCalendarDate(day, "UTC").getTime();

async function pageThrough(
  symbol: string,
  from: CalendarDate,
  until: CalendarDate | null,
  now: number,
  onPage: (rows: DailyKline[]) => void,
  signal?: AbortSignal,
): Promise<DailyKline[]> {
  const out: DailyKline[] = [];
  let cursor = utcStart(from);
  const endTime = until === null ? null : utcStart(addCalendarDays(until, 1)) - 1;
  for (let page = 0; page < 50; page++) {
    const rows = await fetchDailyKlinePage(symbol, cursor, endTime, signal);
    const closed = rows.filter((r) => r.closeTime < now);
    out.push(...closed);
    onPage(closed);
    if (rows.length < 1000) break;
    cursor = rows[rows.length - 1].openTime + 86_400_000;
  }
  return out;
}

/** EUR/USD reference rates by day (USD per EUR), business days only. */
async function fetchEurUsd(
  from: CalendarDate,
  to: CalendarDate,
  signal?: AbortSignal,
): Promise<Map<CalendarDate, Decimal>> {
  const res = await fetch(`${FRANKFURTER}/${from}..${to}?base=EUR&symbols=USD`, { signal });
  if (!res.ok) throw new Error(`Frankfurter failed: ${res.status}`);
  const data = (await res.json()) as { rates?: Record<string, { USD?: number | string }> };
  const out = new Map<CalendarDate, Decimal>();
  for (const [day, rate] of Object.entries(data.rates ?? {})) {
    if (rate.USD !== undefined) out.set(day, new Decimal(String(rate.USD)));
  }
  return out;
}

/** The latest rate published on or before `day`. */
function rateOnOrBefore(
  rates: Map<CalendarDate, Decimal>,
  sortedDays: CalendarDate[],
  day: CalendarDate,
): Decimal | null {
  let lo = 0;
  let hi = sortedDays.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDays[mid] <= day) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? null : rates.get(sortedDays[lo - 1])!;
}

/** Join the two sources into one series. Pure, so it can be tested. */
export function combineSeries(
  eur: { day: CalendarDate; close: string }[],
  usdt: { day: CalendarDate; close: string }[],
  eurUsd: Map<CalendarDate, Decimal>,
): { history: PriceHistory; segments: SourceSegment[] } {
  const firstEur = eur[0]?.day ?? null;
  const rateDays = [...eurUsd.keys()].sort();
  const days: CalendarDate[] = [];
  const closes: Decimal[] = [];
  const sources: PriceSource[] = [];
  for (const row of usdt) {
    if (firstEur !== null && row.day >= firstEur) break;
    const rate = rateOnOrBefore(eurUsd, rateDays, row.day);
    if (rate === null) continue;
    days.push(row.day);
    closes.push(new Decimal(row.close).div(rate));
    sources.push("binance-usdt-ecb");
  }
  for (const row of eur) {
    days.push(row.day);
    closes.push(new Decimal(row.close));
    sources.push("binance-eur");
  }
  const segments: SourceSegment[] = [];
  for (let i = 0; i < days.length; i++) {
    const last = segments.at(-1);
    if (last && last.source === sources[i]) last.to = days[i];
    else segments.push({ source: sources[i], from: days[i], to: days[i] });
  }
  return { history: { days, closes, sources }, segments };
}

async function load(
  onProgress: (p: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<LoadedPrices> {
  const now = Date.now();
  const today = todayCalendarDate(new Date(now), "UTC");
  const total = Math.max(1, Math.round((utcStart(today) - utcStart(EARLIEST_PRICE_DAY)) / 86_400_000));
  let done = 0;
  const count = (rows: DailyKline[]) => {
    done += rows.length;
    onProgress({ done: Math.min(done, total), total });
  };
  onProgress({ done: 0, total });

  const eurRows = await pageThrough("BTCEUR", EARLIEST_PRICE_DAY, null, now, count, signal);
  const eur = eurRows.map((r) => ({ day: utcDay(r.openTime), close: r.close }));
  const firstEur = eur[0]?.day ?? today;

  let usdt: { day: CalendarDate; close: string }[] = [];
  let eurUsd = new Map<CalendarDate, Decimal>();
  if (firstEur > EARLIEST_PRICE_DAY) {
    const before = addCalendarDays(firstEur, -1);
    const usdtRows = await pageThrough("BTCUSDT", EARLIEST_PRICE_DAY, before, now, count, signal);
    usdt = usdtRows.map((r) => ({ day: utcDay(r.openTime), close: r.close }));
    if (usdt.length > 0) {
      // A few days of lead, so the first USDT day has a rate to fall back on.
      eurUsd = await fetchEurUsd(addCalendarDays(usdt[0].day, -7), before, signal);
    }
  }
  onProgress({ done: total, total });
  const { history, segments } = combineSeries(eur, usdt, eurUsd);
  if (history.days.length === 0) throw new Error("No price data");
  return { ...history, segments, loadedAt: now };
}

let cached: { promise: Promise<LoadedPrices>; day: CalendarDate } | null = null;

/**
 * The full series, from cache when it was loaded today (UTC). A failed load
 * is not cached, so the next click tries again.
 */
export function loadPriceHistory(
  onProgress: (p: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<LoadedPrices> {
  const today = todayCalendarDate(new Date(), "UTC");
  if (cached && cached.day === today) return cached.promise;
  const promise = load(onProgress, signal);
  cached = { promise, day: today };
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

/** Whether a call would be answered from the cache (no progress to show). */
export function hasCachedPrices(): boolean {
  return cached !== null && cached.day === todayCalendarDate(new Date(), "UTC");
}

/** For tests. */
export function clearPriceCache(): void {
  cached = null;
}
