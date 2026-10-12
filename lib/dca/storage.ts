// The calculator's last inputs, remembered on this device.
//
// localStorage rather than the portfolio's `uiSettings`: the calculator stays
// out of the portfolio file entirely — it neither reads nor writes it, and
// running it must never mark the file as changed. The inputs are a
// hypothetical plan, not portfolio data. Saved once per calculation, not per
// keystroke.

import { isCalendarDate } from "../dates";
import { DCA_INTERVALS } from "./schedule";
import type { DcaPlan } from "./simulate";

const KEY = "depotwatch.dcaCalculator.v1";

function isNumberText(v: unknown): v is string {
  return typeof v === "string" && /^\d*(\.\d*)?$/.test(v);
}

/** The stored plan, or null when there is none or it is unreadable. */
export function readStoredPlan(): DcaPlan | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DcaPlan>;
    if (
      !isNumberText(v.oneTimeEur) ||
      !isNumberText(v.recurringEur) ||
      !isNumberText(v.feePercent) ||
      !DCA_INTERVALS.includes(v.interval as DcaPlan["interval"]) ||
      !isCalendarDate(v.start) ||
      !isCalendarDate(v.end)
    ) {
      return null;
    }
    return v as DcaPlan;
  } catch {
    return null;
  }
}

export function storePlan(plan: DcaPlan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    // Private mode or storage full: the inputs simply are not remembered.
  }
}
