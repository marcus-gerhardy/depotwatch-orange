// The power-law projection (docs/dca.md).
//
// A straight line through log10(price) against log10(days since the genesis
// block). It is a curve fitted to the past, nothing more: no mechanism behind
// it says the line has to continue, and models of this kind have failed
// before. That is why the page shows a band rather than a line, why the
// parameters are on screen and editable, and why every projected figure is
// labelled as one.
//
// The regression itself runs on floating point: it is a statistic over
// logarithms, not an amount of money. What comes out of it is turned into a
// Decimal before any amount is computed from it (CLAUDE.md, invariant 8).

import { Decimal } from "../decimal";
import { calendarDaysBetween, type CalendarDate } from "../dates";

/** The genesis block, 3 January 2009. */
export const GENESIS_DAY: CalendarDate = "2009-01-03";

export interface PowerLawParams {
  /** log10 of the price on day 1. */
  intercept: number;
  /** Exponent: the slope in log-log space. */
  slope: number;
  /**
   * Half-width of the band in log10 units: lower = mean ÷ 10^band,
   * upper = mean × 10^band. 0.3 is roughly a factor of two either way.
   */
  band: number;
}

export interface PowerLawFit extends PowerLawParams {
  /** Standard deviation of the residuals, log10. */
  residualSd: number;
  /** Data the fit was made on. */
  from: CalendarDate;
  to: CalendarDate;
  points: number;
}

/** Band width the fit proposes, in residual standard deviations. */
export const DEFAULT_BAND_SDS = 2;

export type Scenario = "mean" | "lower" | "upper";
export const SCENARIOS: Scenario[] = ["lower", "mean", "upper"];

export function daysSinceGenesis(day: CalendarDate): number {
  return calendarDaysBetween(GENESIS_DAY, day);
}

/** Ordinary least squares in log-log space over daily EUR closes. */
export function fitPowerLaw(days: CalendarDate[], closes: Decimal[]): PowerLawFit {
  if (days.length < 2 || days.length !== closes.length) {
    throw new Error("Not enough data for a power-law fit");
  }
  const xs = days.map((d) => Math.log10(daysSinceGenesis(d)));
  const ys = closes.map((c) => Math.log10(c.toNumber()));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const residualSd = Math.sqrt(ss / Math.max(1, n - 2));
  return {
    intercept,
    slope,
    band: residualSd * DEFAULT_BAND_SDS,
    residualSd,
    from: days[0],
    to: days[n - 1],
    points: n,
  };
}

/** Modelled EUR price on `day` for a scenario. */
export function projectPrice(
  params: PowerLawParams,
  day: CalendarDate,
  scenario: Scenario = "mean",
): Decimal {
  const days = daysSinceGenesis(day);
  if (days <= 0) throw new RangeError("Projection before genesis");
  const offset = scenario === "lower" ? -params.band : scenario === "upper" ? params.band : 0;
  const log = params.intercept + params.slope * Math.log10(days) + offset;
  // The exponent is a float statistic, so the power is taken in floating
  // point too; a Decimal power of a float input would be slow, not exact.
  // Fifteen significant digits are far beyond what the model can claim.
  return new Decimal((10 ** log).toPrecision(15));
}
