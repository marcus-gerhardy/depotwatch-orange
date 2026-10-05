// Calendar dates that an earlier version stored as instants (docs/dates.md).
//
// Until calendar dates were kept apart, the savings goal's target day was
// written as the picked day's *local midnight* run through `toISOString()` —
// "2026-12-30T23:00:00.000Z" for a 31 December picked in Berlin — and read
// back by slicing off the first ten characters: the 30th. Every save shifted
// it one more day.
//
// This module finds such values and proposes the plain "YYYY-MM-DD" they
// stand for: the instant's day in the local zone, which is the day that was
// picked as long as the zone has not changed since. It never rewrites
// anything by itself — the store applies a plan only after the user has seen
// it and confirmed, with a backup first (CLAUDE.md: Datenqualität sichtbar
// machen). Transaction timestamps are instants and are not looked at at all.
//
// Pure functions over the file, like lib/migrations.ts.

import { isCalendarDate, localTimeZone, readStoredCalendarDate, type CalendarDate } from "./dates";
import type { PortfolioFile } from "./types";

export type CalendarDateField = "savingsGoalTargetDate" | "walletBackupCheckedAt";

export interface CalendarDateIssue {
  field: CalendarDateField;
  /** Set for a wallet field. */
  walletId?: string;
  walletName?: string;
  /** The value as it is in the file. */
  stored: string;
  /** What the app showed for it so far (the UTC date part). */
  shownBefore: string;
  /** The calendar date it is rewritten to. */
  corrected: CalendarDate;
  /** Whether the day changes, not only the format. */
  shifted: boolean;
}

function issueOf(
  field: CalendarDateField,
  value: string | undefined,
  timeZone: string,
  wallet?: { id: string; name: string },
): CalendarDateIssue | null {
  if (value === undefined || isCalendarDate(value)) return null;
  const corrected = readStoredCalendarDate(value, timeZone);
  // Unreadable values are left alone: there is nothing to propose.
  if (corrected === null) return null;
  const shownBefore = value.slice(0, 10);
  return {
    field,
    ...(wallet ? { walletId: wallet.id, walletName: wallet.name } : {}),
    stored: value,
    shownBefore,
    corrected,
    shifted: shownBefore !== corrected,
  };
}

/** Every calendar-date field in the file that is not a plain "YYYY-MM-DD". */
export function findCalendarDateIssues(
  p: PortfolioFile,
  timeZone: string = localTimeZone(),
): CalendarDateIssue[] {
  const out: CalendarDateIssue[] = [];
  const goal = issueOf("savingsGoalTargetDate", p.settings.savingsGoal?.targetDate, timeZone);
  if (goal) out.push(goal);
  for (const w of p.wallets) {
    const backup = issueOf("walletBackupCheckedAt", w.backupCheckedAt, timeZone, w);
    if (backup) out.push(backup);
  }
  return out;
}

/**
 * The file with exactly the given issues rewritten. A value that changed since
 * the plan was made is left as it is rather than overwritten with a stale
 * proposal.
 */
export function applyCalendarDateRepair(
  p: PortfolioFile,
  issues: CalendarDateIssue[],
): { portfolio: PortfolioFile; changed: number } {
  let next = p;
  let changed = 0;
  for (const issue of issues) {
    if (issue.field === "savingsGoalTargetDate") {
      const goal = next.settings.savingsGoal;
      if (!goal || goal.targetDate !== issue.stored) continue;
      changed += 1;
      next = {
        ...next,
        settings: { ...next.settings, savingsGoal: { ...goal, targetDate: issue.corrected } },
      };
    } else {
      const wallet = next.wallets.find((w) => w.id === issue.walletId);
      if (!wallet || wallet.backupCheckedAt !== issue.stored) continue;
      changed += 1;
      next = {
        ...next,
        wallets: next.wallets.map((w) =>
          w.id === issue.walletId && w.backupCheckedAt === issue.stored
            ? { ...w, backupCheckedAt: issue.corrected }
            : w,
        ),
      };
    }
  }
  return { portfolio: next, changed };
}
