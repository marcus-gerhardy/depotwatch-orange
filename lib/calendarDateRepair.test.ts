// Finding and rewriting calendar dates an earlier version stored as instants.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyCalendarDateRepair, findCalendarDateIssues } from "./calendarDateRepair";
import { emptyPortfolio, type PortfolioFile } from "./types";

const before = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Berlin";
});
afterAll(() => {
  process.env.TZ = before;
});

function file(targetDate: string | undefined, backupCheckedAt?: string): PortfolioFile {
  const base = emptyPortfolio();
  return {
    ...base,
    settings: {
      ...base.settings,
      savingsGoal: { targetBtc: "1.00000000", ...(targetDate ? { targetDate } : {}) },
    },
    wallets: [
      {
        id: "w1",
        name: "Ledger",
        type: "hardware",
        ...(backupCheckedAt ? { backupCheckedAt } : {}),
        accounts: [
          {
            id: "a1",
            name: "Main",
            transactions: [
              {
                id: "t1",
                type: "buy",
                date: "2026-12-30T23:00:00.000Z",
                amountBtc: "0.1",
                pricePerBtcEur: "50000",
                note: "",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("calendar date repair", () => {
  it("finds the target date the old settings form shifted", () => {
    // 31.12.2026 picked in Berlin, stored as local midnight in UTC.
    const issues = findCalendarDateIssues(file("2026-12-30T23:00:00.000Z"), "Europe/Berlin");
    expect(issues).toEqual([
      {
        field: "savingsGoalTargetDate",
        stored: "2026-12-30T23:00:00.000Z",
        shownBefore: "2026-12-30",
        corrected: "2026-12-31",
        shifted: true,
      },
    ]);
  });

  it("reports a value whose day does not change as a format fix only", () => {
    const [issue] = findCalendarDateIssues(file("2026-12-31T05:00:00.000Z"), "America/New_York");
    expect(issue.corrected).toBe("2026-12-31");
    expect(issue.shifted).toBe(false);
  });

  it("leaves plain dates and unreadable values alone", () => {
    expect(findCalendarDateIssues(file("2026-12-31", "2026-03-01"))).toEqual([]);
    expect(findCalendarDateIssues(file("someday"))).toEqual([]);
  });

  it("covers the backup check date too", () => {
    const issues = findCalendarDateIssues(
      file(undefined, "2026-02-28T23:00:00.000Z"),
      "Europe/Berlin",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      field: "walletBackupCheckedAt",
      walletId: "w1",
      corrected: "2026-03-01",
    });
  });

  it("rewrites exactly the confirmed values and never a transaction timestamp", () => {
    const p = file("2026-12-30T23:00:00.000Z", "2026-02-28T23:00:00.000Z");
    const issues = findCalendarDateIssues(p, "Europe/Berlin");
    const { portfolio, changed } = applyCalendarDateRepair(p, issues);
    expect(changed).toBe(2);
    expect(portfolio.settings.savingsGoal!.targetDate).toBe("2026-12-31");
    expect(portfolio.wallets[0].backupCheckedAt).toBe("2026-03-01");
    expect(portfolio.wallets[0].accounts[0].transactions[0].date).toBe(
      "2026-12-30T23:00:00.000Z",
    );
    expect(findCalendarDateIssues(portfolio)).toEqual([]);
  });

  it("skips a value that changed after the preview", () => {
    const p = file("2026-12-30T23:00:00.000Z");
    const issues = findCalendarDateIssues(p, "Europe/Berlin");
    const edited = file("2027-06-30");
    const { portfolio, changed } = applyCalendarDateRepair(edited, issues);
    expect(changed).toBe(0);
    expect(portfolio).toBe(edited);
  });
});
