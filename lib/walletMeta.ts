// What the wallet list shows *about* a wallet, beyond its balance.
//
// Pure functions only. The balance itself is not computed here — that is
// `lib/holdings.ts`, the one implementation every surface reads — and neither
// are the data-quality predicates (`lib/dataQuality.ts`). This module arranges
// what those two answer: which group a wallet belongs to, how the total is
// split between wallets, when a backup check is due, and in which order the
// wallets stand.

import { addCalendarDays, localTimeZone, readStoredCalendarDate, todayCalendarDate } from "./dates";
import { Decimal, ZERO } from "./decimal";
import { hasIssue, issueContext, type DataIssue } from "./dataQuality";
import { dailyBalanceSeries } from "./portfolio";
import type {
  KycStatus,
  LedgerEntry,
  Wallet,
  WalletColorId,
  WalletIconId,
  WalletType,
} from "./types";

/** Coins the owner holds the keys to, and coins somebody else holds for them. */
export type Custody = "self" | "custodial";

export function custodyOf(type: WalletType): Custody {
  return type === "exchange" ? "custodial" : "self";
}

/** Types with a seed of their own, where a backup check means anything. */
export function hasSeedBackup(type: WalletType): boolean {
  return custodyOf(type) === "self";
}

export const WALLET_ICON_IDS: WalletIconId[] = [
  "exchange",
  "hardware",
  "software",
  "paper",
  "vault",
  "piggy",
  "shield",
  "key",
];

export const WALLET_COLOR_IDS: WalletColorId[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "muted",
];

export const KYC_STATUSES: KycStatus[] = ["unknown", "kyc", "non-kyc"];

/** The mark a wallet wears when none was chosen: the one of its type. */
export function walletIconOf(w: Pick<Wallet, "type" | "icon">): WalletIconId {
  return w.icon ?? w.type;
}

/**
 * The accent a wallet wears when none was chosen. Taken from its position, so
 * neighbouring segments of the distribution bar differ without anybody having
 * picked anything; the choice, once made, is what is stored.
 */
export function walletColorOf(w: Pick<Wallet, "color">, index: number): WalletColorId {
  return w.color ?? WALLET_COLOR_IDS[index % 4];
}

/** The fields the wallet dialog may change — never the accounts. */
export type WalletPatch = Partial<Omit<Wallet, "id" | "accounts">>;

/**
 * The wallets in the given order. Ids the list does not name keep their
 * relative order at the end, and unknown ids are ignored: an outdated order
 * can reshuffle the list, but never lose or duplicate a wallet.
 */
export function orderWallets(wallets: Wallet[], orderedIds: string[]): Wallet[] {
  const byId = new Map(wallets.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const out: Wallet[] = [];
  for (const id of orderedIds) {
    const w = byId.get(id);
    if (!w || seen.has(id)) continue;
    seen.add(id);
    out.push(w);
  }
  for (const w of wallets) if (!seen.has(w.id)) out.push(w);
  return out;
}

/**
 * Move one wallet within a group (the self-custody ones, the exchanges, the
 * archive) and return the order of *all* wallets.
 *
 * The groups are views onto one array, so a move inside a group has to leave
 * every other wallet exactly where it was: the group's members are
 * rearranged among the positions they already occupy.
 */
export function moveWithinGroup(
  allIds: string[],
  groupIds: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= groupIds.length ||
    toIndex >= groupIds.length
  ) {
    return allIds;
  }
  const reordered = [...groupIds];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  const inGroup = new Set(groupIds);
  let next = 0;
  return allIds.map((id) => (inGroup.has(id) ? reordered[next++] : id));
}

/** One wallet's part of the total, for the distribution bar and the share column. */
export interface WalletShare {
  walletId: string;
  /** 0…1; zero for a wallet holding nothing or less than nothing. */
  share: number;
}

/**
 * How the total holding splits over the wallets. Archived wallets are part of
 * it like any other: archiving tidies the list, it never takes coins out of a
 * total. A negative balance (a ledger with a gap) has no share of anything
 * and is shown as zero here — the gap itself is reported where it is fixed.
 */
export function walletShares(
  balances: { walletId: string; btc: Decimal }[],
): WalletShare[] {
  const positive = (b: Decimal) => (b.gt(0) ? b : ZERO);
  const total = balances.reduce((sum, b) => sum.plus(positive(b.btc)), ZERO);
  return balances.map((b) => ({
    walletId: b.walletId,
    share: total.gt(0) ? positive(b.btc).div(total).toNumber() : 0,
  }));
}

/** A backup is checked again this long after the last check. */
export const BACKUP_CHECK_INTERVAL_DAYS = 365;

export type BackupStatus =
  /** An exchange: there is no seed of the owner's to check. */
  | { kind: "notApplicable" }
  | { kind: "never" }
  | { kind: "ok"; checkedAt: string; dueAt: string | null }
  | { kind: "due"; checkedAt: string; dueAt: string };


/**
 * Where a wallet's backup check stands. "Due" only when the owner asked to be
 * reminded: a date without a reminder is a record, not a promise the app gets
 * to hold them to.
 */
export function backupStatus(
  w: Pick<Wallet, "type" | "backupCheckedAt" | "backupReminder">,
  now: Date,
): BackupStatus {
  if (!hasSeedBackup(w.type)) return { kind: "notApplicable" };
  if (!w.backupCheckedAt) return { kind: "never" };
  // A calendar date ("YYYY-MM-DD", docs/dates.md); a legacy instant is read
  // as its local day.
  const checkedAt = readStoredCalendarDate(w.backupCheckedAt);
  if (checkedAt === null) return { kind: "never" };
  if (!w.backupReminder) return { kind: "ok", checkedAt, dueAt: null };
  const dueAt = addCalendarDays(checkedAt, BACKUP_CHECK_INTERVAL_DAYS);
  // Today as the user's own calendar shows it — not the UTC date, which is
  // still yesterday in Berlin until 01:00 or 02:00.
  return todayCalendarDate(now, localTimeZone()) >= dueAt
    ? { kind: "due", checkedAt, dueAt }
    : { kind: "ok", checkedAt, dueAt };
}

/** The data-quality issues the wallet list names per wallet. */
export const WALLET_ISSUES = ["unlinkedTransfer", "missingEurValue", "missingTxid"] as const;
export type WalletIssue = (typeof WALLET_ISSUES)[number] & DataIssue;
export type WalletIssueCounts = Record<WalletIssue, number>;

/**
 * Per wallet, how many of its transactions show each issue.
 *
 * The context is built over the *whole* ledger, not per wallet: whether a
 * transfer leg is linked depends on the counterpart, which normally sits in a
 * different wallet. Judged per wallet, every internal transfer would look
 * unlinked.
 */
export function walletIssueCounts(entries: LedgerEntry[]): Map<string, WalletIssueCounts> {
  const ctx = issueContext(entries);
  const out = new Map<string, WalletIssueCounts>();
  for (const e of entries) {
    let counts = out.get(e.walletId);
    if (!counts) {
      counts = { unlinkedTransfer: 0, missingEurValue: 0, missingTxid: 0 };
      out.set(e.walletId, counts);
    }
    for (const issue of WALLET_ISSUES) if (hasIssue(e, issue, ctx)) counts[issue]++;
  }
  return out;
}

/**
 * The shape of a wallet's balance over time, as a handful of points for a
 * sparkline. Read from the same daily series the portfolio chart uses, so it
 * is `balanceDelta` underneath like every other balance; sampled down because
 * forty points draw the same line as four thousand.
 *
 * Plain numbers on purpose: this is a drawing, not an amount — nothing adds,
 * rounds or displays them.
 */
export function balanceSparkline(entries: LedgerEntry[], points = 40): number[] {
  const series = dailyBalanceSeries(entries);
  if (series.length < 2) return [];
  if (series.length <= points) return series.map((d) => d.btc.toNumber());
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const idx = Math.round((i * (series.length - 1)) / (points - 1));
    out.push(series[idx].btc.toNumber());
  }
  return out;
}
