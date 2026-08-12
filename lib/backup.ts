// Backups (CLAUDE.md §6.5).
//
// The app's whole premise is one file the user owns. The price of that is that
// one damaged file is everything, so backups are not a nicety here — they are
// what makes the premise survivable.
//
// Two rules run through this module:
//
// **A backup that was never read back is not a backup.** Every write is
// immediately re-read, decrypted, parsed and compared against what it was made
// from. An unverified copy is worse than none, because it is the one somebody
// will rely on at the worst possible moment.
//
// **Retention may never leave you with nothing.** The pruner is a pure
// function over the list, it always keeps the newest, and it refuses to delete
// anything at all unless a verified backup remains. Everything about it is
// testable without a file system, which is why it lives here rather than in
// the code that touches the directory.

import type { PortfolioFile } from "./types";

/** How often a backup is written. */
export type BackupTrigger = "everySave" | "daily" | "manual";

export interface RetentionPolicy {
  /** The most recent N, whatever their dates. */
  keepLatest: number;
  /** One per day for the last N days. */
  keepDaily: number;
  /** One per ISO week for the last N weeks. */
  keepWeekly: number;
  /** One per month for the last N months. */
  keepMonthly: number;
}

export interface BackupSettings {
  trigger: BackupTrigger;
  retention: RetentionPolicy;
  /** Remind when the newest backup is older than this many days. */
  reminderDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  keepLatest: 10,
  keepDaily: 7,
  keepWeekly: 4,
  keepMonthly: 12,
};

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  trigger: "daily",
  retention: DEFAULT_RETENTION,
  reminderDays: 7,
};

/** What the file records about how backups are going. */
export interface BackupState {
  /** When the last backup was written, ISO-8601. */
  lastBackupAt?: string;
  /** File name of that backup. */
  lastFileName?: string;
  /** Whether reading it back worked — the only thing that makes it a backup. */
  lastVerified?: boolean;
  /** Why verification failed, for the warning. */
  lastError?: string;
  /** The newest backup that *did* verify, for the reminder. */
  lastVerifiedAt?: string;
}

/** One backup found in the directory. */
export interface BackupEntry {
  fileName: string;
  /** Parsed from the name, which is where the timestamp lives. */
  time: number;
  sizeBytes: number;
}

/** Metadata a backup gives up once it has been decrypted. */
export interface BackupMeta {
  transactionCount: number;
  /** Newest transaction date in the backup, ISO-8601; null when it has none. */
  lastTransactionDate: string | null;
  walletCount: number;
  /** Whether the file's own checksum matched (§6.5). */
  integrity: "ok" | "missing" | "mismatch" | "unavailable";
}

const PREFIX = "portfolio-";

/**
 * `portfolio-2026-08-12T14-32-00.dwp` — an ISO timestamp with the colons
 * replaced, because a colon is not a legal file-name character on Windows and
 * a backup that cannot be written on one platform is not a backup either.
 * Sorting the names alphabetically therefore sorts them by age, which is what
 * makes a directory listing readable without parsing every entry.
 */
export function backupFileName(date: Date, extension = "dwp"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${PREFIX}${stamp}.${extension}`;
}

/**
 * The timestamp in a backup's name, or null when it is not one of ours. The
 * optional `-2`, `-3` … is the collision suffix (`uniqueBackupName`).
 */
export function backupTimeOf(fileName: string): number | null {
  const m =
    /^portfolio-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-\d+)?\.[A-Za-z0-9]+$/.exec(
      fileName,
    );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const t = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * A name that is not already in the folder.
 *
 * The timestamp resolves to the second, and two backups can genuinely land in
 * the same one — a save-triggered backup and the safety copy a restore writes,
 * for instance. Reusing the name would silently overwrite an existing backup,
 * and in that particular case it would overwrite the very file being restored
 * from. So a collision gets a counter instead.
 */
export function uniqueBackupName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  const dot = base.lastIndexOf(".");
  const stem = base.slice(0, dot);
  const ext = base.slice(dot);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

const DAY = 86_400_000;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;
/** Monday-based week, the same rule the rest of the app uses. */
const weekKey = (d: Date) => {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return String(Math.floor((Math.floor(local / DAY) + 3) / 7));
};

export interface PruneResult {
  keep: BackupEntry[];
  remove: BackupEntry[];
  /**
   * Nothing was removed because nothing may be: no verified backup would have
   * been left behind. The caller says so rather than reporting a clean prune.
   */
  refused: boolean;
}

/**
 * Which backups to keep and which to delete.
 *
 * The policy is the usual grandfather-father-son: the newest N unconditionally,
 * then the newest one of each of the last days, weeks and months. A backup is
 * kept when *any* of those claims it, so the sets overlap harmlessly.
 *
 * Two safeties that matter more than the policy itself:
 *  - the newest backup is always kept, whatever the numbers say;
 *  - nothing is deleted unless at least one backup that verified remains, so a
 *    run of broken backups cannot rotate away the last good one.
 */
export function pruneBackups(
  entries: BackupEntry[],
  policy: RetentionPolicy,
  now: number,
  /** Names known to have verified. Empty means "nothing is known to be good". */
  verified: ReadonlySet<string> = new Set(),
): PruneResult {
  const sorted = [...entries].sort((a, b) => b.time - a.time);
  if (sorted.length === 0) return { keep: [], remove: [], refused: false };

  const keep = new Set<string>();
  // The newest, always and regardless of the policy.
  keep.add(sorted[0].fileName);
  for (const e of sorted.slice(0, Math.max(1, policy.keepLatest))) keep.add(e.fileName);

  const claim = (
    limit: number,
    key: (d: Date) => string,
    windowMs: number,
  ) => {
    const seen = new Set<string>();
    for (const e of sorted) {
      if (now - e.time > windowMs) break; // sorted newest first
      const k = key(new Date(e.time));
      if (seen.has(k)) continue;
      seen.add(k);
      if (seen.size > limit) break;
      keep.add(e.fileName);
    }
  };
  claim(policy.keepDaily, dayKey, policy.keepDaily * DAY);
  claim(policy.keepWeekly, weekKey, policy.keepWeekly * 7 * DAY);
  claim(policy.keepMonthly, monthKey, policy.keepMonthly * 31 * DAY);

  const kept = sorted.filter((e) => keep.has(e.fileName));
  const remove = sorted.filter((e) => !keep.has(e.fileName));
  if (remove.length === 0) return { keep: kept, remove, refused: false };

  // The last safety: never prune down to a set with nothing verified in it.
  // With no verification history at all (an older file, a directory somebody
  // copied in) that is precisely the situation to leave alone.
  const keptVerified = kept.some((e) => verified.has(e.fileName));
  if (!keptVerified) return { keep: sorted, remove: [], refused: true };

  return { keep: kept, remove, refused: false };
}

/** Is a backup due, given the trigger and when the last one was written? */
export function backupDue(
  trigger: BackupTrigger,
  lastBackupAt: string | undefined,
  now: Date,
): boolean {
  if (trigger === "manual") return false;
  if (trigger === "everySave") return true;
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return true;
  // "Once a day" means once per calendar day, not every 24 hours: somebody who
  // saves at 09:00 every morning should get a backup every morning.
  return (
    last.getFullYear() !== now.getFullYear() ||
    last.getMonth() !== now.getMonth() ||
    last.getDate() !== now.getDate()
  );
}

/** Days since the newest verified backup; null when there has never been one. */
export function daysSinceBackup(state: BackupState | undefined, now: Date): number | null {
  if (!state?.lastVerifiedAt) return null;
  const t = new Date(state.lastVerifiedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/** Should the (dismissible) reminder be shown? */
export function backupReminderDue(
  state: BackupState | undefined,
  settings: BackupSettings,
  hasEverSaved: boolean,
  now: Date,
): boolean {
  if (!hasEverSaved) return false;
  const days = daysSinceBackup(state, now);
  return days === null || days >= settings.reminderDays;
}

/** What a backup contains, for the list and for the restore confirmation. */
export function backupMetaOf(
  portfolio: PortfolioFile,
  integrity: BackupMeta["integrity"],
): BackupMeta {
  let transactionCount = 0;
  let lastTransactionDate: string | null = null;
  for (const w of portfolio.wallets) {
    for (const a of w.accounts) {
      for (const t of a.transactions) {
        transactionCount += 1;
        if (lastTransactionDate === null || t.date > lastTransactionDate) {
          lastTransactionDate = t.date;
        }
      }
    }
  }
  return {
    transactionCount,
    lastTransactionDate,
    walletCount: portfolio.wallets.length,
    integrity,
  };
}
