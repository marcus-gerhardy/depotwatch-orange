// When a savings plan buys (docs/dca.md).
//
// Every date is a calendar date and every step is calendar arithmetic from
// lib/dates.ts — a plan that buys "on the 15th" buys on the 15th wherever the
// browser happens to be, and never drifts by an hour of daylight saving.

import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  type CalendarDate,
} from "../dates";

export type DcaInterval = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";

export const DCA_INTERVALS: DcaInterval[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
];

/** A plan longer than this is refused rather than computed for minutes. */
export const MAX_PURCHASES = 20_000;

/**
 * The k-th purchase day (k = 0 is the start date).
 *
 * Monthly and quarterly plans count **from the start date every time**, and a
 * day the month does not have becomes that month's last day: started on the
 * 31st, the plan buys on 28/29 February, 31 March, 30 April, 31 May … — it
 * never drifts down to the 28th for good after the first short month.
 */
export function nthPurchaseDate(
  start: CalendarDate,
  interval: DcaInterval,
  k: number,
): CalendarDate {
  switch (interval) {
    case "daily":
      return addCalendarDays(start, k);
    case "weekly":
      return addCalendarDays(start, 7 * k);
    case "biweekly":
      return addCalendarDays(start, 14 * k);
    case "monthly":
      return addCalendarMonths(start, k);
    case "quarterly":
      return addCalendarMonths(start, 3 * k);
  }
}

/** All purchase days from `start` to `end`, both inclusive. */
export function purchaseDates(
  start: CalendarDate,
  end: CalendarDate,
  interval: DcaInterval,
): CalendarDate[] {
  if (calendarDaysBetween(start, end) < 0) return [];
  const out: CalendarDate[] = [];
  for (let k = 0; ; k++) {
    const day = nthPurchaseDate(start, interval, k);
    if (calendarDaysBetween(day, end) < 0) break;
    out.push(day);
    if (out.length > MAX_PURCHASES) throw new RangeError("Too many purchases");
  }
  return out;
}
