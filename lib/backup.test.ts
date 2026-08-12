/** @vitest-environment jsdom */
// Backups: the naming, the schedule, and above all the pruner.
//
// The pruner is the one piece here that can destroy data, and it can do it
// quietly — nobody notices a backup that was deleted until they need it. So
// every safety it has is pinned by a test: the newest survives whatever the
// policy says, and nothing is deleted while nothing verified would be left.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION,
  backupDue,
  backupFileName,
  backupMetaOf,
  backupReminderDue,
  backupTimeOf,
  daysSinceBackup,
  pruneBackups,
  uniqueBackupName,
  DEFAULT_BACKUP_SETTINGS,
  type BackupEntry,
} from "./backup";
import { emptyPortfolio, type Transaction } from "./types";

const DAY = 86_400_000;

/** A backup written `daysAgo` days before `now`, at noon. */
function entry(now: number, daysAgo: number, hour = 12): BackupEntry {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return {
    fileName: backupFileName(d),
    time: d.getTime(),
    sizeBytes: 1024,
  };
}

const NOW = new Date("2026-08-12T18:00:00").getTime();

describe("the file name", () => {
  it("carries a sortable timestamp and no colons", () => {
    const name = backupFileName(new Date(2026, 7, 12, 14, 32, 5));
    expect(name).toBe("portfolio-2026-08-12T14-32-05.dwp");
    // Windows refuses a colon in a file name, and a backup that cannot be
    // written on one platform is not a backup.
    expect(name).not.toContain(":");
  });

  it("round-trips through the parser, and ignores foreign files", () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(backupTimeOf(backupFileName(d))).toBe(d.getTime());
    expect(backupTimeOf("notes.txt")).toBeNull();
    expect(backupTimeOf("portfolio.dwp")).toBeNull();
  });

  it("sorts by age when sorted by name", () => {
    const older = backupFileName(new Date(2026, 7, 12, 9, 0, 0));
    const newer = backupFileName(new Date(2026, 7, 12, 10, 0, 0));
    expect([newer, older].sort()).toEqual([older, newer]);
  });
});

describe("a name that is already taken", () => {
  it("gets a counter rather than overwriting a backup", () => {
    const base = "portfolio-2026-08-12T14-32-05.dwp";
    expect(uniqueBackupName(base, new Set())).toBe(base);
    expect(uniqueBackupName(base, new Set([base]))).toBe(
      "portfolio-2026-08-12T14-32-05-2.dwp",
    );
    expect(
      uniqueBackupName(base, new Set([base, "portfolio-2026-08-12T14-32-05-2.dwp"])),
    ).toBe("portfolio-2026-08-12T14-32-05-3.dwp");
    // And the suffixed name is still recognised as a backup of that second.
    expect(backupTimeOf("portfolio-2026-08-12T14-32-05-2.dwp")).toBe(
      new Date(2026, 7, 12, 14, 32, 5).getTime(),
    );
  });
});

describe("when a backup is due", () => {
  const now = new Date("2026-08-12T09:00:00");
  it("follows the trigger", () => {
    expect(backupDue("manual", undefined, now)).toBe(false);
    expect(backupDue("everySave", new Date().toISOString(), now)).toBe(true);
  });

  it("means once per calendar day, not every 24 hours", () => {
    // Saved yesterday evening, saving again this morning: that is a new day.
    // Built in local time on purpose — "once a day" means the user's day.
    expect(backupDue("daily", new Date(2026, 7, 11, 22, 0, 0).toISOString(), now)).toBe(
      true,
    );
    expect(backupDue("daily", new Date("2026-08-12T01:00:00").toISOString(), now)).toBe(
      false,
    );
    expect(backupDue("daily", undefined, now)).toBe(true);
  });
});

describe("pruning", () => {
  const verifiedAll = (entries: BackupEntry[]) =>
    new Set(entries.map((e) => e.fileName));

  it("keeps the newest ten whatever else the policy says", () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry(NOW, i, 12 - (i % 6)));
    const { keep, remove } = pruneBackups(
      entries,
      { keepLatest: 10, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 },
      NOW,
      verifiedAll(entries),
    );
    expect(keep).toHaveLength(10);
    expect(remove).toHaveLength(10);
    expect(keep[0].time).toBeGreaterThan(remove[0].time);
  });

  it("thins out a long history into days, weeks and months", () => {
    // Two backups a day for two years.
    const entries: BackupEntry[] = [];
    for (let d = 0; d < 730; d++) {
      entries.push(entry(NOW, d, 9), entry(NOW, d, 18));
    }
    const { keep, remove } = pruneBackups(
      entries,
      DEFAULT_RETENTION,
      NOW,
      verifiedAll(entries),
    );
    expect(remove.length).toBeGreaterThan(1000);
    // Ten recent + a day each for a week + a week each for a month + a month
    // each for a year, with the sets overlapping.
    expect(keep.length).toBeGreaterThanOrEqual(12);
    expect(keep.length).toBeLessThan(40);
    // Something from a year ago survives.
    expect(keep.some((e) => NOW - e.time > 300 * DAY)).toBe(true);
  });

  it("never deletes the newest, even with a policy of zero", () => {
    const entries = [entry(NOW, 0), entry(NOW, 1), entry(NOW, 2)];
    const { keep, remove } = pruneBackups(
      entries,
      { keepLatest: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 },
      NOW,
      verifiedAll(entries),
    );
    expect(keep).toHaveLength(1);
    expect(keep[0].time).toBe(entries[0].time);
    expect(remove).toHaveLength(2);
  });

  it("refuses to delete anything when nothing verified would be left", () => {
    // Three backups, none of them ever read back successfully: rotating now
    // could throw away the only good copy there is.
    const entries = [entry(NOW, 0), entry(NOW, 40), entry(NOW, 80)];
    const result = pruneBackups(
      entries,
      { keepLatest: 1, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 },
      NOW,
      new Set(),
    );
    expect(result.refused).toBe(true);
    expect(result.remove).toEqual([]);
    expect(result.keep).toHaveLength(3);
  });

  it("prunes as soon as one of the survivors is known to be good", () => {
    const entries = [entry(NOW, 0), entry(NOW, 40), entry(NOW, 80)];
    const result = pruneBackups(
      entries,
      { keepLatest: 1, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 },
      NOW,
      new Set([entries[0].fileName]),
    );
    expect(result.refused).toBe(false);
    expect(result.remove).toHaveLength(2);
  });

  it("does nothing to an empty or single-entry directory", () => {
    expect(pruneBackups([], DEFAULT_RETENTION, NOW).remove).toEqual([]);
    const one = [entry(NOW, 500)];
    expect(pruneBackups(one, DEFAULT_RETENTION, NOW, verifiedAll(one)).remove).toEqual([]);
  });
});

describe("the reminder", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("stays quiet for a file that was never saved anywhere", () => {
    expect(backupReminderDue(undefined, DEFAULT_BACKUP_SETTINGS, false, now)).toBe(false);
  });

  it("asks when there has never been a verified backup", () => {
    expect(backupReminderDue({}, DEFAULT_BACKUP_SETTINGS, true, now)).toBe(true);
  });

  it("counts from the last backup that actually verified", () => {
    const state = {
      lastBackupAt: "2026-08-12T00:00:00.000Z",
      lastVerified: false,
      lastVerifiedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(daysSinceBackup(state, now)).toBe(11);
    expect(backupReminderDue(state, DEFAULT_BACKUP_SETTINGS, true, now)).toBe(true);
    expect(
      backupReminderDue(state, { ...DEFAULT_BACKUP_SETTINGS, reminderDays: 30 }, true, now),
    ).toBe(false);
  });
});

describe("what a backup says about itself", () => {
  it("counts transactions and finds the newest date", () => {
    const p = emptyPortfolio();
    const tx = (id: string, date: string): Transaction => ({
      id,
      type: "buy",
      date,
      amountBtc: "0.1",
      pricePerBtcEur: "50000",
      note: "",
    });
    p.wallets = [
      {
        id: "w1",
        name: "W",
        type: "exchange",
        accounts: [
          { id: "a1", name: "A", transactions: [tx("t1", "2025-01-01T00:00:00.000Z")] },
          { id: "a2", name: "B", transactions: [tx("t2", "2026-03-04T00:00:00.000Z")] },
        ],
      },
    ];
    expect(backupMetaOf(p, "ok")).toEqual({
      transactionCount: 2,
      lastTransactionDate: "2026-03-04T00:00:00.000Z",
      walletCount: 1,
      integrity: "ok",
    });
  });
});
