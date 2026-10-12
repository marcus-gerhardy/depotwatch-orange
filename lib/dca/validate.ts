// Whether a savings plan can be calculated, and if not, why.

import { addCalendarYears, calendarDaysBetween, isCalendarDate } from "../dates";
import { Decimal } from "../decimal";
import { EARLIEST_PRICE_DAY } from "./prices";
import { purchaseDates } from "./schedule";
import type { DcaPlan } from "./simulate";

/** Plans longer than this are refused: decades of daily purchases are slow and meaningless. */
export const MAX_YEARS = 30;

export type ValidationError =
  | "startTooEarly"
  | "endBeforeStart"
  | "noMoney"
  | "fee"
  | "tooLong"
  | "dates";

export function validatePlan(plan: DcaPlan): ValidationError | null {
  if (!isCalendarDate(plan.start) || !isCalendarDate(plan.end)) return "dates";
  if (plan.start < EARLIEST_PRICE_DAY) return "startTooEarly";
  if (calendarDaysBetween(plan.start, plan.end) < 0) return "endBeforeStart";
  if (plan.end > addCalendarYears(plan.start, MAX_YEARS)) return "tooLong";
  const num = (v: string) => {
    try {
      return new Decimal(v || "0");
    } catch {
      return new Decimal(NaN);
    }
  };
  const fee = num(plan.feePercent);
  if (fee.isNaN() || fee.lt(0) || fee.gte(100)) return "fee";
  if (!num(plan.oneTimeEur).gt(0) && !num(plan.recurringEur).gt(0)) return "noMoney";
  try {
    purchaseDates(plan.start, plan.end, plan.interval);
  } catch {
    return "tooLong";
  }
  return null;
}

