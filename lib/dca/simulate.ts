// The savings-plan calculation (docs/dca.md): a pure function over the plan,
// a daily EUR price history and the projection parameters.
//
// Where history ends and projection begins is one fixed day: the last
// *closed* daily candle. Every purchase on or before it buys at a real close,
// every purchase after it at the modelled price of the chosen scenario. The
// result says how many purchases fell on each side, so a figure that is
// partly modelled can never pass for a historical one.

import { Decimal, ZERO } from "../decimal";
import { calendarDaysBetween, type CalendarDate } from "../dates";
import { xirr } from "./irr";
import { projectPrice, type PowerLawParams, type Scenario } from "./powerLaw";
import { purchaseDates, type DcaInterval } from "./schedule";

export type PriceSource = "binance-eur" | "binance-usdt-ecb";

/** Daily EUR closes, oldest first, one entry per day that has a candle. */
export interface PriceHistory {
  days: CalendarDate[];
  closes: Decimal[];
  sources: PriceSource[];
}

export interface DcaPlan {
  /** One-off deposit on the start date; "" or "0" for none. */
  oneTimeEur: string;
  recurringEur: string;
  interval: DcaInterval;
  start: CalendarDate;
  end: CalendarDate;
  /** Fee per purchase, percent of the amount paid in. */
  feePercent: string;
}

export type PriceOrigin = "history" | "projection";

export interface Purchase {
  /** The day the plan buys. */
  date: CalendarDate;
  kind: "oneTime" | "recurring";
  /**
   * The day whose close was used. Differs from `date` when that day has no
   * candle and the next available one was taken instead.
   */
  priceDay: CalendarDate;
  origin: PriceOrigin;
  source: PriceSource | null;
  price: Decimal;
  /** Paid in, fee included. */
  grossEur: Decimal;
  feeEur: Decimal;
  btc: Decimal;
  cumulativeBtc: Decimal;
  cumulativeEur: Decimal;
}

export interface DcaResult {
  purchases: Purchase[];
  invested: Decimal;
  fees: Decimal;
  btc: Decimal;
  /** Price the holding is valued at on the end date. */
  endPrice: Decimal;
  endPriceOrigin: PriceOrigin;
  endPriceDay: CalendarDate;
  endValue: Decimal;
  pnl: Decimal;
  /** Σ (price × quantity) / Σ quantity — fees not included. */
  averagePrice: Decimal | null;
  /** Paid in ÷ quantity — what each bitcoin cost including fees. */
  effectivePrice: Decimal | null;
  /** (end value − invested) ÷ invested. */
  simpleReturn: Decimal | null;
  /** Money-weighted, annualised. */
  irr: Decimal | null;
  historyPurchases: number;
  projectedPurchases: number;
  /** Purchases that used the next available candle instead of their own day. */
  shiftedPurchases: number;
}

/** First index with days[i] ≥ day (binary search). */
function firstOnOrAfter(days: CalendarDate[], day: CalendarDate): number {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The last day with real price data; the projection starts the day after. */
export function lastHistoryDay(history: PriceHistory): CalendarDate | null {
  return history.days.at(-1) ?? null;
}

/**
 * The price for buying on `day`: the close of that day, or of the next day
 * that has one; the model when the day lies past the history.
 */
export function purchasePrice(
  history: PriceHistory,
  model: PowerLawParams,
  scenario: Scenario,
  day: CalendarDate,
): { price: Decimal; priceDay: CalendarDate; origin: PriceOrigin; source: PriceSource | null } {
  const last = lastHistoryDay(history);
  if (last !== null && day <= last) {
    const i = firstOnOrAfter(history.days, day);
    if (i < history.days.length) {
      return {
        price: history.closes[i],
        priceDay: history.days[i],
        origin: "history",
        source: history.sources[i],
      };
    }
  }
  return { price: projectPrice(model, day, scenario), priceDay: day, origin: "projection", source: null };
}

/**
 * The price the holding is worth on `day`: the latest close on or before it
 * (a valuation never borrows tomorrow's price), or the model past the history.
 */
export function valuationPrice(
  history: PriceHistory,
  model: PowerLawParams,
  scenario: Scenario,
  day: CalendarDate,
): { price: Decimal; priceDay: CalendarDate; origin: PriceOrigin } {
  const last = lastHistoryDay(history);
  if (last !== null && day <= last) {
    let i = firstOnOrAfter(history.days, day);
    if (i >= history.days.length || history.days[i] !== day) i -= 1;
    if (i >= 0) return { price: history.closes[i], priceDay: history.days[i], origin: "history" };
  }
  return { price: projectPrice(model, day, scenario), priceDay: day, origin: "projection" };
}

function amount(v: string): Decimal {
  try {
    const d = new Decimal(v || "0");
    return d.isFinite() && d.isPositive() ? d : ZERO;
  } catch {
    return ZERO;
  }
}

export function simulateDca(
  plan: DcaPlan,
  history: PriceHistory,
  model: PowerLawParams,
  scenario: Scenario = "mean",
): DcaResult {
  const feeRate = amount(plan.feePercent).div(100);
  const oneTime = amount(plan.oneTimeEur);
  const recurring = amount(plan.recurringEur);

  const orders: { date: CalendarDate; kind: Purchase["kind"]; gross: Decimal }[] = [];
  if (oneTime.gt(0)) orders.push({ date: plan.start, kind: "oneTime", gross: oneTime });
  if (recurring.gt(0)) {
    for (const date of purchaseDates(plan.start, plan.end, plan.interval)) {
      orders.push({ date, kind: "recurring", gross: recurring });
    }
  }

  const purchases: Purchase[] = [];
  let cumulativeBtc = ZERO;
  let cumulativeEur = ZERO;
  let fees = ZERO;
  let netEur = ZERO;
  for (const order of orders) {
    const p = purchasePrice(history, model, scenario, order.date);
    const feeEur = order.gross.times(feeRate);
    const net = order.gross.minus(feeEur);
    const btc = net.div(p.price);
    cumulativeBtc = cumulativeBtc.plus(btc);
    cumulativeEur = cumulativeEur.plus(order.gross);
    fees = fees.plus(feeEur);
    netEur = netEur.plus(net);
    purchases.push({
      date: order.date,
      kind: order.kind,
      priceDay: p.priceDay,
      origin: p.origin,
      source: p.source,
      price: p.price,
      grossEur: order.gross,
      feeEur,
      btc,
      cumulativeBtc,
      cumulativeEur,
    });
  }

  const end = valuationPrice(history, model, scenario, plan.end);
  const endValue = cumulativeBtc.times(end.price);
  const invested = cumulativeEur;
  const hasHolding = cumulativeBtc.gt(0);

  const irr =
    purchases.length > 0
      ? xirr([
          ...purchases.map((p) => ({
            day: calendarDaysBetween(plan.start, p.date),
            amount: p.grossEur.negated(),
          })),
          { day: calendarDaysBetween(plan.start, plan.end), amount: endValue },
        ])
      : null;

  return {
    purchases,
    invested,
    fees,
    btc: cumulativeBtc,
    endPrice: end.price,
    endPriceOrigin: end.origin,
    endPriceDay: end.priceDay,
    endValue,
    pnl: endValue.minus(invested),
    averagePrice: hasHolding ? netEur.div(cumulativeBtc) : null,
    effectivePrice: hasHolding ? invested.div(cumulativeBtc) : null,
    simpleReturn: invested.gt(0) ? endValue.minus(invested).div(invested) : null,
    irr,
    historyPurchases: purchases.filter((p) => p.origin === "history").length,
    projectedPurchases: purchases.filter((p) => p.origin === "projection").length,
    shiftedPurchases: purchases.filter((p) => p.origin === "history" && p.priceDay !== p.date)
      .length,
  };
}

/** Whether any part of the plan, purchases or valuation, lies past the history. */
export function usesProjection(result: DcaResult): boolean {
  return result.projectedPurchases > 0 || result.endPriceOrigin === "projection";
}
