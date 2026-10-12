// Money-weighted annual return (XIRR) of a savings plan.
//
// The rate r solves  Σ cf_i · (1 + r)^(−d_i / 365) = 0,  with deposits as
// negative and the final value as a positive cash flow, d_i in days from the
// first flow. Computed in Decimal like every other figure here; to keep that
// affordable for a daily plan over a decade, the discount factor is carried
// forward from flow to flow (v^Δd with a small whole Δd) instead of raising
// to a fractional power once per flow.

import { Decimal } from "../decimal";

const D = Decimal.clone({ precision: 24 });

export interface CashFlow {
  /** Days since the first flow (≥ 0, ascending order not required). */
  day: number;
  /** Negative for money paid in, positive for money taken out. */
  amount: Decimal;
}

function prepare(flows: CashFlow[]): { day: number; amount: Decimal }[] {
  const byDay = new Map<number, Decimal>();
  for (const f of flows) {
    byDay.set(f.day, (byDay.get(f.day) ?? new D(0)).plus(f.amount));
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, amount]) => ({ day, amount: new D(amount) }));
}

/** NPV at rate r and its derivative with respect to r. */
function npv(flows: { day: number; amount: Decimal }[], r: Decimal): [Decimal, Decimal] {
  const onePlus = new D(1).plus(r);
  const v = onePlus.pow(new D(-1).div(365));
  let factor = new D(1);
  let lastDay = 0;
  let value = new D(0);
  let weighted = new D(0);
  for (const f of flows) {
    const gap = f.day - lastDay;
    if (gap !== 0) {
      factor = factor.times(gap === 1 ? v : v.pow(gap));
      lastDay = f.day;
    }
    const pv = f.amount.times(factor);
    value = value.plus(pv);
    weighted = weighted.plus(pv.times(f.day));
  }
  // d/dr (1+r)^(−t) = −t · (1+r)^(−t−1), with t = day / 365.
  return [value, weighted.div(onePlus.times(365)).negated()];
}

/**
 * The annual rate, or null when there is none: no money paid in, nothing
 * coming back, or a flow pattern without a sign change.
 */
export function xirr(flows: CashFlow[]): Decimal | null {
  const prepared = prepare(flows);
  const hasIn = prepared.some((f) => f.amount.isNegative() && !f.amount.isZero());
  const hasOut = prepared.some((f) => f.amount.isPositive() && !f.amount.isZero());
  if (!hasIn || !hasOut) return null;

  // Bracket: NPV falls as r rises for "pay in first, take out last". Widen
  // the upper end until the sign flips (a short plan can annualise to a lot).
  let lo = new D("-0.999999");
  let hi = new D(1);
  if (npv(prepared, lo)[0].isNegative()) return null;
  for (let i = 0; npv(prepared, hi)[0].isPositive(); i++) {
    if (i > 60) return null;
    hi = hi.times(4);
  }

  // Newton steps where they stay inside the bracket, bisection otherwise.
  let r = new D("0.1");
  if (r.lte(lo) || r.gte(hi)) r = lo.plus(hi).div(2);
  for (let i = 0; i < 200; i++) {
    const [value, slope] = npv(prepared, r);
    if (value.abs().lt("1e-12")) return r;
    if (value.isPositive()) lo = r;
    else hi = r;
    let next = slope.isZero() ? null : r.minus(value.div(slope));
    if (next === null || next.lte(lo) || next.gte(hi)) next = lo.plus(hi).div(2);
    if (next.minus(r).abs().lt("1e-14")) return next;
    r = next;
  }
  return r;
}
