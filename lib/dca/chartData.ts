// What the savings-plan chart draws, derived from a finished calculation.
//
// Numbers rather than Decimals because a canvas plots numbers: this is the
// display end of the pipeline (CLAUDE.md, invariant 8 — rounding only for
// display), and nothing computed here flows back into a figure.

import { addCalendarDays, calendarDaysBetween, type CalendarDate } from "../dates";
import { projectPrice, type PowerLawParams } from "./powerLaw";
import { lastHistoryDay, type DcaPlan, type DcaResult, type PriceHistory } from "./simulate";

export interface Point {
  time: CalendarDate;
  value: number;
}

export interface DcaChartData {
  priceHistory: Point[];
  priceMean: Point[];
  priceLower: Point[];
  priceUpper: Point[];
  /** Cumulative amount paid in, one point per purchase (drawn as steps). */
  deposits: Point[];
  valueHistory: Point[];
  valueProjection: Point[];
  /** Last day of real prices inside the plan, where the projection takes over. */
  boundary: CalendarDate | null;
}

/** At most this many points per projected line; long plans are sampled. */
const MAX_PROJECTION_POINTS = 1500;

export function buildChartData(
  plan: DcaPlan,
  history: PriceHistory,
  result: DcaResult,
  model: PowerLawParams,
): DcaChartData {
  const out: DcaChartData = {
    priceHistory: [],
    priceMean: [],
    priceLower: [],
    priceUpper: [],
    deposits: [],
    valueHistory: [],
    valueProjection: [],
    boundary: null,
  };
  const purchases = result.purchases;
  let next = 0;
  let btc = 0;
  const holdingOn = (day: CalendarDate) => {
    while (next < purchases.length && purchases[next].date <= day) {
      btc = purchases[next].cumulativeBtc.toNumber();
      next++;
    }
    return btc;
  };

  // History: every candle inside the plan.
  const last = lastHistoryDay(history);
  for (let i = 0; i < history.days.length; i++) {
    const day = history.days[i];
    if (day < plan.start) continue;
    if (day > plan.end) break;
    const price = history.closes[i].toNumber();
    out.priceHistory.push({ time: day, value: price });
    out.valueHistory.push({ time: day, value: holdingOn(day) * price });
  }

  // Projection: from the day after the history to the end of the plan.
  if (last === null || last < plan.end) {
    const from = last === null || last < plan.start ? plan.start : addCalendarDays(last, 1);
    out.boundary = last !== null && last >= plan.start ? last : null;
    const span = calendarDaysBetween(from, plan.end);
    const step = Math.max(1, Math.ceil((span + 1) / MAX_PROJECTION_POINTS));
    // Not joined to the history: the model does not continue from the last
    // close, and a line drawn between the two would read as a price move.
    for (let k = 0; k <= span; k += step) {
      const day = addCalendarDays(from, k);
      pushProjected(out, model, day, holdingOn(day));
    }
    // The end day itself, whatever the sampling step skipped.
    const tail = out.priceMean.at(-1)?.time;
    if (tail !== plan.end) pushProjected(out, model, plan.end, holdingOn(plan.end));
  }

  for (const p of purchases) {
    const point = { time: p.date, value: p.cumulativeEur.toNumber() };
    // Two purchases on one day (one-off plus first instalment) are one step.
    if (out.deposits.at(-1)?.time === p.date) out.deposits[out.deposits.length - 1] = point;
    else out.deposits.push(point);
  }
  // Carry the last level to the end of the plan, so the step does not stop
  // short of the other lines.
  const lastDeposit = out.deposits.at(-1);
  if (lastDeposit && lastDeposit.time < plan.end) {
    out.deposits.push({ time: plan.end, value: lastDeposit.value });
  }
  return out;
}

function pushProjected(out: DcaChartData, model: PowerLawParams, day: CalendarDate, btc: number) {
  const mean = projectPrice(model, day, "mean").toNumber();
  out.priceMean.push({ time: day, value: mean });
  out.priceLower.push({ time: day, value: projectPrice(model, day, "lower").toNumber() });
  out.priceUpper.push({ time: day, value: projectPrice(model, day, "upper").toNumber() });
  out.valueProjection.push({ time: day, value: btc * mean });
}
