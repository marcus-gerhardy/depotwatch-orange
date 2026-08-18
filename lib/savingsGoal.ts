// A savings target, and what can honestly be said about it (CLAUDE.md §4.4).
//
// The rule this file is written under: **it reports, it does not urge.** No
// "you are behind", no streak to lose, no suggestion to buy — somebody's
// savings are not a game with a scoreboard, and an app that nags about a
// target the user set themselves has misunderstood who it works for. What it
// says is what is true: how far along, how much is left, what rate that
// implies, and what the rate so far would reach.
//
// Everything here is a pure function over figures the app already has, so the
// widget renders and does not calculate.

import { Decimal, dec, ZERO } from "./decimal";
import type { LedgerEntry, SavingsGoal } from "./types";

const MS_PER_DAY = 86_400_000;

export interface GoalProgress {
  targetBtc: Decimal;
  currentBtc: Decimal;
  /** What is still missing; zero once the target is reached. */
  remainingBtc: Decimal;
  /** 0…1, clamped — a target that was overshot is reached, not 130 % reached. */
  fraction: number;
  reached: boolean;
  /** Set only when the goal names a date. */
  byDate: DateBoundGoal | null;
  /** What has been saved per month so far, over the whole history. */
  paceBtcPerMonth: Decimal | null;
  /**
   * When the current pace would reach the target. Null when the pace is zero
   * or the target is already reached — an "in 4 000 years" is not information.
   */
  projectedDate: Date | null;
}

export interface DateBoundGoal {
  date: Date;
  daysLeft: number;
  /** What is left, spread over the months left. Null once the date has passed. */
  requiredBtcPerMonth: Decimal | null;
  /** The date is in the past and the target was not reached. */
  overdue: boolean;
}

/** Months between two instants, as a fraction and never below a day's worth. */
function monthsBetween(from: number, to: number): Decimal {
  const days = Math.max((to - from) / MS_PER_DAY, 1 / 24);
  return dec(days).div(dec(365.25).div(12));
}

/**
 * Where the goal stands.
 *
 * `currentBtc` is the ledger's holding (§11), never the engine's open lots:
 * the target is about coins held, and the two differ wherever a disposal is
 * unassigned.
 */
export function goalProgress(
  goal: SavingsGoal,
  currentBtc: Decimal,
  entries: LedgerEntry[],
  now: Date = new Date(),
): GoalProgress | null {
  const target = dec(goal.targetBtc);
  if (!target.gt(0)) return null; // no target, no goal

  const remaining = Decimal.max(ZERO, target.minus(currentBtc));
  const reached = currentBtc.gte(target);
  const fraction = target.gt(0)
    ? Math.min(1, Math.max(0, currentBtc.div(target).toNumber()))
    : 0;

  // The pace so far, measured from the first transaction: the honest average,
  // including the months nothing happened in.
  const firstDate = entries.reduce<number | null>((min, e) => {
    const t = new Date(e.date).getTime();
    return Number.isNaN(t) ? min : min === null || t < min ? t : min;
  }, null);
  const months =
    firstDate === null ? null : monthsBetween(firstDate, now.getTime());
  const pace =
    months === null || months.lte(0) || currentBtc.lte(0)
      ? null
      : currentBtc.div(months);

  const projectedDate =
    pace === null || pace.lte(0) || reached
      ? null
      : new Date(
          now.getTime() + remaining.div(pace).mul(dec(365.25).div(12)).toNumber() * MS_PER_DAY,
        );

  let byDate: DateBoundGoal | null = null;
  if (goal.targetDate) {
    const date = new Date(goal.targetDate);
    if (!Number.isNaN(date.getTime())) {
      const daysLeft = Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
      const monthsLeft = monthsBetween(now.getTime(), date.getTime());
      byDate = {
        date,
        daysLeft,
        // Past the date there is no rate to state: what is left would have to
        // be saved in no time at all, which is a division by zero dressed up
        // as advice.
        requiredBtcPerMonth:
          daysLeft <= 0 || reached ? null : remaining.div(monthsLeft),
        overdue: daysLeft < 0 && !reached,
      };
    }
  }

  return {
    targetBtc: target,
    currentBtc,
    remainingBtc: remaining,
    fraction,
    reached,
    byDate,
    paceBtcPerMonth: pace,
    projectedDate,
  };
}
