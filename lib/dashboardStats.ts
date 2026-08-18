// Figures the dashboard shows but the ledger does not store: what could be
// realised tax-free right now, what has already been realised this year, what
// the fees add up to, how the buys are spread over the year, how deep the
// value fell, how long the portfolio has been running.
//
// Pure functions over data that is already computed elsewhere (the FIFO
// result, the flattened ledger, a daily series), so every one of them is
// unit-testable without a browser and no widget carries arithmetic of its own.
// Decimal throughout — rounding happens in the formatters, never here.

import { Decimal, dec, ZERO } from "./decimal";
import { isLotTaxFree, type Disposal, type FifoResult, type OpenLot } from "./fifo";
import type { LedgerEntry } from "./types";

const DAY = 86_400_000;

export interface TaxFreeRealizable {
  /** Open lots past the holding period whose origin is known. */
  btc: Decimal;
  lotCount: number;
  /**
   * Lots whose acquisition date is an arrival rather than a traced
   * acquisition (§3.2). Their holding period is an assumption, so they are
   * reported separately and never counted as tax-free.
   */
  unresolvedBtc: Decimal;
  unresolvedLotCount: number;
  /** Open lots still inside the holding period. */
  lockedBtc: Decimal;
}

/**
 * What is out of the holding period right now. `originUnresolved` lots are
 * excluded on purpose: saying "tax-free" about coins whose acquisition date
 * the app had to guess would be the one wrong answer here.
 */
export function taxFreeRealizable(
  openLots: OpenLot[],
  now: Date = new Date(),
): TaxFreeRealizable {
  let btc = ZERO;
  let lotCount = 0;
  let unresolvedBtc = ZERO;
  let unresolvedLotCount = 0;
  let lockedBtc = ZERO;
  for (const lot of openLots) {
    if (!lot.remainingBtc.gt(0)) continue;
    if (lot.originUnresolved) {
      unresolvedBtc = unresolvedBtc.plus(lot.remainingBtc);
      unresolvedLotCount += 1;
      continue;
    }
    if (isLotTaxFree(lot, now)) {
      btc = btc.plus(lot.remainingBtc);
      lotCount += 1;
    } else {
      lockedBtc = lockedBtc.plus(lot.remainingBtc);
    }
  }
  return { btc, lotCount, unresolvedBtc, unresolvedLotCount, lockedBtc };
}

export interface RealizedYear {
  year: number;
  /** Gains from parts still inside the holding period — the taxable ones. */
  taxableGainEur: Decimal;
  /** Gains from parts past it, which the limit does not apply to. */
  taxFreeGainEur: Decimal;
  disposalCount: number;
  /** BTC disposed of from lots whose origin never resolved (§3.2). */
  unresolvedOriginBtc: Decimal;
}

/**
 * Realised gains of one calendar year. Losses count: §23 EStG nets gains and
 * losses of the year before the limit is applied, so the sum is taken signed
 * rather than clamped at zero.
 */
export function realizedInYear(disposals: Disposal[], year: number): RealizedYear {
  let taxableGainEur = ZERO;
  let taxFreeGainEur = ZERO;
  let unresolvedOriginBtc = ZERO;
  let disposalCount = 0;
  for (const d of disposals) {
    const t = new Date(d.date);
    if (Number.isNaN(t.getTime()) || t.getFullYear() !== year) continue;
    disposalCount += 1;
    taxableGainEur = taxableGainEur.plus(d.taxableGainEur);
    taxFreeGainEur = taxFreeGainEur.plus(d.taxFreeGainEur);
    unresolvedOriginBtc = unresolvedOriginBtc.plus(d.unresolvedOriginBtc);
  }
  return { year, taxableGainEur, taxFreeGainEur, disposalCount, unresolvedOriginBtc };
}

export interface FeeTotals {
  /** Fees charged by a venue: everything on a buy, sell or spend. */
  tradingEur: Decimal;
  /** Fees paid to miners: everything on a transfer leg. */
  networkEur: Decimal;
  totalEur: Decimal;
  /** BTC paid in fees, whatever it was worth. */
  totalBtc: Decimal;
  /** BTC fees no historical price could be found for; not part of the sums. */
  unvaluedBtc: Decimal;
  /** What was put in: the EUR of every buy, fees included. */
  investedEur: Decimal;
  /** Fee share of the invested sum; null when nothing was invested. */
  shareOfInvested: number | null;
}

/**
 * Every fee the ledger records, in EUR.
 *
 * A BTC fee is valued at the rate of *its own day* (`closeByDay`), not at
 * today's — a fee is money spent when it was spent, and valuing it at today's
 * price would make old fees grow with the price. A day with no candle leaves
 * that fee out of the sums and counts into `unvaluedBtc`, so a gap in the
 * price history cannot silently shrink the total.
 *
 * Trading versus network is decided by transaction type, which is the only
 * thing the ledger actually knows: a fee on a trade went to the venue, a fee
 * on a transfer went to the miners.
 */
export function feeTotals(
  entries: LedgerEntry[],
  closeByDay: Map<number, number>,
): FeeTotals {
  let tradingEur = ZERO;
  let networkEur = ZERO;
  let totalBtc = ZERO;
  let unvaluedBtc = ZERO;
  let investedEur = ZERO;

  for (const e of entries) {
    const isTrade = e.type === "buy" || e.type === "sell" || e.type === "spend";
    const add = (v: Decimal) => {
      if (isTrade) tradingEur = tradingEur.plus(v);
      else networkEur = networkEur.plus(v);
    };

    const feeFiat = dec(e.feeFiatEur);
    if (feeFiat.gt(0)) add(feeFiat);

    const feeBtc = dec(e.feeBtc);
    if (feeBtc.gt(0)) {
      totalBtc = totalBtc.plus(feeBtc);
      const time = new Date(e.date).getTime();
      const close = Number.isNaN(time)
        ? undefined
        : closeByDay.get(Math.floor(time / DAY) * DAY);
      if (close === undefined) unvaluedBtc = unvaluedBtc.plus(feeBtc);
      else add(feeBtc.mul(close));
    }

    if (e.type === "buy") {
      const total =
        e.totalFiatEur != null
          ? dec(e.totalFiatEur)
          : e.pricePerBtcEur != null
            ? dec(e.amountBtc).mul(dec(e.pricePerBtcEur))
            : null;
      if (total !== null) investedEur = investedEur.plus(total).plus(feeFiat);
    }
  }

  const totalEur = tradingEur.plus(networkEur);
  return {
    tradingEur,
    networkEur,
    totalEur,
    totalBtc,
    unvaluedBtc,
    investedEur,
    shareOfInvested: investedEur.gt(0) ? totalEur.div(investedEur).toNumber() : null,
  };
}

export interface HeatmapDay {
  /** Local day start, ms epoch. */
  time: number;
  buyCount: number;
  /** BTC credited that day, net of a BTC fee — what the stack actually grew by. */
  btc: Decimal;
  /** EUR spent that day; only buys that carry a figure contribute. */
  eur: Decimal;
  /**
   * Volume-weighted price paid that day, per BTC bought. Derived from the
   * gross amounts (like the chart's trade markers), so it is the price of the
   * trade rather than the cost per coin that survived the fee. Null when no
   * buy of that day recorded a EUR figure.
   */
  priceEur: Decimal | null;
}

export interface BuyHeatmap {
  /** Every day of the window, oldest first — including the empty ones. */
  days: HeatmapDay[];
  /** Largest EUR day in the window, the reference for the colour scale. */
  maxEur: Decimal;
  totalBuys: number;
}

/**
 * Buys per calendar day over the last `months` months, as a dense series so
 * the grid can be drawn without the caller filling gaps.
 *
 * Days are *local* days: a heatmap is read against the calendar on the wall,
 * and the same rule already applies to the day-of touches (§5.1).
 */
export function buyHeatmap(
  entries: LedgerEntry[],
  months = 12,
  now: Date = new Date(),
): BuyHeatmap {
  const startOfLocalDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const end = startOfLocalDay(now);
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - months);
  const start = startOfLocalDay(startDate);

  const byDay = new Map<number, HeatmapDay>();
  /** Gross BTC per day, only needed to weight the day's price. */
  const grossByDay = new Map<number, Decimal>();
  let totalBuys = 0;
  for (const e of entries) {
    if (e.type !== "buy") continue;
    const t = new Date(e.date);
    if (Number.isNaN(t.getTime())) continue;
    const day = startOfLocalDay(t);
    if (day < start || day > end) continue;
    const eur =
      e.totalFiatEur != null
        ? dec(e.totalFiatEur)
        : e.pricePerBtcEur != null
          ? dec(e.amountBtc).mul(dec(e.pricePerBtcEur))
          : ZERO;
    const cell = byDay.get(day) ?? {
      time: day,
      buyCount: 0,
      btc: ZERO,
      eur: ZERO,
      priceEur: null,
    };
    cell.buyCount += 1;
    cell.btc = cell.btc.plus(dec(e.amountBtc).minus(dec(e.feeBtc)));
    cell.eur = cell.eur.plus(eur);
    // Gross, because a price is what the trade was struck at.
    grossByDay.set(day, (grossByDay.get(day) ?? ZERO).plus(dec(e.amountBtc)));
    byDay.set(day, cell);
    totalBuys += 1;
  }

  for (const [day, cell] of byDay) {
    const gross = grossByDay.get(day) ?? ZERO;
    cell.priceEur = gross.gt(0) && cell.eur.gt(0) ? cell.eur.div(gross) : null;
  }

  const days: HeatmapDay[] = [];
  let maxEur = ZERO;
  // Step by calendar day, not by adding 86_400_000: a DST change makes a local
  // day 23 or 25 hours long, and stepping by a fixed amount would drift.
  for (let d = new Date(start); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    const day = startOfLocalDay(d);
    const cell = byDay.get(day) ?? {
      time: day,
      buyCount: 0,
      btc: ZERO,
      eur: ZERO,
      priceEur: null,
    };
    if (cell.eur.gt(maxEur)) maxEur = cell.eur;
    days.push(cell);
  }
  return { days, maxEur, totalBuys };
}

export interface DrawdownResult {
  /** Deepest fall from a previous peak, as a fraction (0.4 = −40 %). */
  maxDrawdown: number;
  /** Value at the peak the deepest fall started from. */
  peakValue: number;
  troughValue: number;
  peakTime: number | null;
  troughTime: number | null;
}

/**
 * The deepest fall of the portfolio value from a previous high.
 *
 * This is the *portfolio's* drawdown, not the price's: buying on the way down
 * lifts the value again, so the number says what the position went through,
 * which is what the widget claims.
 */
export function maxDrawdown(series: { time: number; value: number }[]): DrawdownResult {
  let peak = -Infinity;
  let peakTime: number | null = null;
  let worst = 0;
  let result: DrawdownResult = {
    maxDrawdown: 0,
    peakValue: 0,
    troughValue: 0,
    peakTime: null,
    troughTime: null,
  };
  for (const p of series) {
    if (p.value > peak) {
      peak = p.value;
      peakTime = p.time;
    }
    if (peak <= 0) continue;
    const dd = (peak - p.value) / peak;
    if (dd > worst) {
      worst = dd;
      result = {
        maxDrawdown: dd,
        peakValue: peak,
        troughValue: p.value,
        peakTime,
        troughTime: p.time,
      };
    }
  }
  return result;
}

export interface TimeInMarket {
  firstBuyDate: string | null;
  days: number;
  /** Buys spread over the whole period, one every this many days. */
  buysPerYear: number | null;
}

/** How long the portfolio has been running, counted from the first buy. */
export function timeInMarket(
  entries: LedgerEntry[],
  now: Date = new Date(),
): TimeInMarket {
  let first: number | null = null;
  let buys = 0;
  for (const e of entries) {
    if (e.type !== "buy") continue;
    const t = new Date(e.date).getTime();
    if (Number.isNaN(t)) continue;
    buys += 1;
    if (first === null || t < first) first = t;
  }
  if (first === null) return { firstBuyDate: null, days: 0, buysPerYear: null };
  const days = Math.max(0, Math.floor((now.getTime() - first) / DAY));
  return {
    firstBuyDate: new Date(first).toISOString(),
    days,
    buysPerYear: days > 0 ? (buys / days) * 365 : null,
  };
}

/** Market value of the open lots that carry a known cost basis. */
export function openBasisValue(fifo: FifoResult, priceEur: number | null): Decimal | null {
  return priceEur === null ? null : fifo.openBasisBtc.mul(priceEur);
}

export interface WhatIf {
  /** Holding valued at the hypothetical price. */
  valueEur: Decimal;
  /** Against the cost basis of the lots that have one. */
  pnlEur: Decimal | null;
  pnlPct: number | null;
  /** Factor against today's price, e.g. 2 = "twice as much". */
  multiple: number | null;
}

/**
 * The portfolio at a price that does not exist (yet).
 *
 * Valued over `openBasisBtc` rather than the whole holding, for the same
 * reason the P/L widget does (§4.1): coins without a cost basis would
 * otherwise show up as pure profit.
 */
export function whatIf(
  fifo: FifoResult,
  hypotheticalPrice: number,
  currentPrice: number | null,
): WhatIf {
  const price = dec(hypotheticalPrice);
  const basisBtc = fifo.openBasisBtc;
  const cost = fifo.openCostBasisEur;
  const valueEur = basisBtc.mul(price);
  const pnlEur = cost.gt(0) ? valueEur.minus(cost) : null;
  return {
    valueEur,
    pnlEur,
    pnlPct: pnlEur === null || !cost.gt(0) ? null : pnlEur.div(cost).toNumber(),
    multiple: currentPrice ? hypotheticalPrice / currentPrice : null,
  };
}

/** Cumulative BTC per day, as plain numbers for the chart. */
export function stackSeries(
  daily: { time: number; btc: Decimal }[],
): { time: number; btc: number }[] {
  return daily.map((d) => ({ time: d.time, btc: d.btc.toNumber() }));
}


export type TradeBucket = "day" | "week" | "month";

export interface TradeMarker {
  /**
   * Where the marker sits on the time axis: the volume-weighted middle of the
   * trades it folds, never the bucket's first instant. A month bucket begins
   * on the 1st, and a marker drawn there claims trading on a day that often
   * has none — worse, it lands outside the chart whenever the visible range
   * starts mid-period, which is what put a lone dot in the empty margin left
   * of the price line.
   */
  time: number;
  /** Start of the bucket the trades were folded into. */
  bucketTime: number;
  kind: "in" | "out";
  /** Trades folded into this marker. */
  count: number;
  /** BTC traded, gross — what the marker's size represents. */
  btc: Decimal;
  /** EUR moved. */
  eur: Decimal;
  /**
   * Volume-weighted average price actually paid or received, in EUR.
   *
   * This is where the marker sits on the price axis, and it is the whole point:
   * the *market's* close of that day is a different number, and putting a trade
   * on it claims an execution that never happened.
   */
  priceEur: Decimal;
  firstTime: number;
  lastTime: number;
}

export interface TradeMarkers {
  buys: TradeMarker[];
  sells: TradeMarker[];
  bucket: TradeBucket;
  /** Trades with no EUR figure at all; they have no price to be placed at. */
  withoutPrice: number;
  /** Trades folded into the markers, so the UI can say when it aggregated. */
  tradeCount: number;
}

const startOfUtcDay = (ms: number) => Math.floor(ms / DAY) * DAY;

/** Bucket start for a timestamp, in UTC so it lines up with the daily closes. */
export function bucketStart(ms: number, bucket: TradeBucket): number {
  const day = startOfUtcDay(ms);
  if (bucket === "day") return day;
  if (bucket === "week") {
    // Monday: 1970-01-01 was a Thursday, hence the offset.
    const weekday = (Math.floor(day / DAY) + 3) % 7;
    return day - weekday * DAY;
  }
  const d = new Date(day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** What one trade was executed at, per BTC, in EUR; null when unrecorded. */
function executedPriceEur(e: LedgerEntry): Decimal | null {
  if (e.pricePerBtcEur != null) return dec(e.pricePerBtcEur);
  if (e.totalFiatEur != null) {
    const amount = dec(e.amountBtc);
    if (amount.gt(0)) return dec(e.totalFiatEur).div(amount);
  }
  return null;
}

/**
 * The user's own entries and exits, folded into buckets and placed at the
 * price they were actually executed at.
 *
 * Aggregation is not cosmetic: a daily DCA puts one dot per day on the chart,
 * and several hundred dots draw a band, not information. One marker per bucket
 * at the volume-weighted average price says what a period was bought at, and
 * its BTC volume gives the dot its size.
 *
 * Transfers are left out on purpose — they move coins between one's own
 * wallets and are neither an entry nor an exit.
 */
export function tradeMarkers(
  entries: LedgerEntry[],
  from: number,
  bucket: TradeBucket,
): TradeMarkers {
  // The weighted sum of the timestamps, alongside the marker it belongs to:
  // an accounting detail of where the dot goes, not something a caller reads.
  const acc = new Map<string, { marker: TradeMarker; weightedTime: Decimal }>();
  let withoutPrice = 0;
  let tradeCount = 0;

  for (const e of entries) {
    if (e.type !== "buy" && e.type !== "sell" && e.type !== "spend") continue;
    const ts = new Date(e.date).getTime();
    if (Number.isNaN(ts) || ts < from) continue;
    const price = executedPriceEur(e);
    if (price === null) {
      withoutPrice += 1;
      continue;
    }
    const kind: "in" | "out" = e.type === "buy" ? "in" : "out";
    const bucketTime = bucketStart(ts, bucket);
    const key = `${kind}:${bucketTime}`;
    const btc = dec(e.amountBtc);
    const hit = acc.get(key);
    if (hit) {
      const m = hit.marker;
      m.count += 1;
      m.btc = m.btc.plus(btc);
      m.eur = m.eur.plus(btc.mul(price));
      m.firstTime = Math.min(m.firstTime, ts);
      m.lastTime = Math.max(m.lastTime, ts);
      hit.weightedTime = hit.weightedTime.plus(btc.mul(ts));
    } else {
      acc.set(key, {
        marker: {
          time: ts,
          bucketTime,
          kind,
          count: 1,
          btc,
          eur: btc.mul(price),
          priceEur: price,
          firstTime: ts,
          lastTime: ts,
        },
        weightedTime: btc.mul(ts),
      });
    }
    tradeCount += 1;
  }

  const markers = [...acc.values()].map(({ marker: m, weightedTime }) => ({
    ...m,
    // Volume-weighted, so a big buy pulls the marker towards its own price
    // instead of every trade in the bucket counting the same. The same for
    // where in the period it sits — a month bought into on two days should
    // not be drawn at the month's start.
    priceEur: m.btc.gt(0) ? m.eur.div(m.btc) : m.priceEur,
    time: m.btc.gt(0)
      ? Math.round(weightedTime.div(m.btc).toNumber())
      : Math.round((m.firstTime + m.lastTime) / 2),
  }));
  markers.sort((a, b) => a.time - b.time);

  return {
    buys: markers.filter((m) => m.kind === "in"),
    sells: markers.filter((m) => m.kind === "out"),
    bucket,
    withoutPrice,
    tradeCount,
  };
}

/**
 * The coarsest bucket is not always needed: pick the finest one that keeps the
 * chart readable. Above this many markers the dots start touching, whatever
 * the tile is sized to.
 */
const MAX_MARKERS = 45;

export function tradeMarkersFor(entries: LedgerEntry[], from: number): TradeMarkers {
  const buckets: TradeBucket[] = ["day", "week", "month"];
  let last = tradeMarkers(entries, from, "day");
  for (const bucket of buckets) {
    last = tradeMarkers(entries, from, bucket);
    if (last.buys.length + last.sells.length <= MAX_MARKERS) return last;
  }
  return last;
}

/**
 * A price axis with a little air around the data, rounded outward to a round
 * figure so the ticks stay readable.
 *
 * Recharts' "auto" reaches down towards zero, which spends half the tile on
 * prices the period never saw and flattens the very curve the chart is for. A
 * bare padded range fixes that but produces ticks like "69.431 €", hence the
 * rounding to half a power of ten.
 */
export function priceAxisDomain(values: number[]): [number, number] {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return [0, 1];
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min;
  const pad = span > 0 ? span * 0.08 : Math.abs(max) * 0.04 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const step = Math.pow(10, Math.floor(Math.log10(hi - lo))) / 2;
  return [Math.max(0, Math.floor(lo / step) * step), Math.ceil(hi / step) * step];
}

/** Sum helper for a Decimal list, used where a reduce would read worse. */
export function sum(values: Decimal[]): Decimal {
  return values.reduce((s, v) => s.plus(v), ZERO);
}

export { Decimal };
