// The change log inside the portfolio file (CLAUDE.md §6.6).
//
// Deliberately **not** a disaster measure — that is what the backups are for
// (§6.5). This is for the other kind of accident: a bulk delete that hit ten
// rows too many, an import into the wrong account, an edit that turned out to
// be on the wrong transaction. Those are recoverable from the file itself if
// the file remembers what happened, and unrecoverable if it does not.
//
// Which is why it is bounded in two directions. The list is capped at 50
// entries, and an entry only carries the data an undo needs while that data is
// small: a bulk action over hundreds of transactions is *recorded* (so it can
// be understood) but not *reversible* (so the file does not grow by the size of
// the action). An import is the exception that needs no payload — it already
// has `importBatchId` on every row it wrote and its own undo (§3.4).
//
// Pure functions over the ledger, so what an undo would do is testable without
// a store.

import type { PortfolioFile, Transaction, Wallet } from "./types";

export type ChangeKind =
  | "add"
  | "update"
  | "delete"
  | "move"
  | "import"
  | "importUndo"
  | "restore";

/** A transaction plus where it lived, which is what putting it back needs. */
export interface TransactionSnapshot {
  accountId: string;
  transaction: Transaction;
}

export interface ChangeLogEntry {
  id: string;
  /** When it happened, ISO-8601. */
  at: string;
  kind: ChangeKind;
  /** Transactions the action touched. */
  txIds: string[];
  /** How many — `txIds` is capped for large actions, this never is. */
  count: number;
  /**
   * What it takes to reverse the action: put these back, remove those.
   * Absent when the action is recorded for traceability only.
   */
  undo?: {
    restore?: TransactionSnapshot[];
    remove?: string[];
  };
  /** Free-text detail the UI shows, e.g. an import's file name. */
  note?: string;
}

/** The file keeps at most this many entries; the oldest fall off the end. */
export const MAX_CHANGE_LOG = 50;

/**
 * Above this many transactions an action keeps no undo payload. A bulk delete
 * of a thousand rows would otherwise put a thousand transactions into the file
 * — twice, once in the log and once in whatever the user does next.
 */
export const MAX_UNDO_TRANSACTIONS = 100;

/** Ids beyond this are not listed individually; `count` still tells the truth. */
const MAX_LISTED_IDS = 200;

/**
 * Only the newest entries keep the data an undo needs. Fifty entries each
 * carrying up to a hundred transactions would be megabytes inside the file,
 * and an undo of the fortieth-last action is not something anybody reaches
 * for: what is wanted is "take back what I just did". Older entries stay in
 * the log as a record, without their payload.
 */
export const UNDOABLE_ENTRIES = 10;

export function newChangeEntry(o: {
  kind: ChangeKind;
  txIds: string[];
  at?: Date;
  undo?: ChangeLogEntry["undo"];
  note?: string;
}): ChangeLogEntry {
  const restoreCount = o.undo?.restore?.length ?? 0;
  const removeCount = o.undo?.remove?.length ?? 0;
  const tooBig = restoreCount + removeCount > MAX_UNDO_TRANSACTIONS;
  return {
    id: crypto.randomUUID(),
    at: (o.at ?? new Date()).toISOString(),
    kind: o.kind,
    txIds: o.txIds.slice(0, MAX_LISTED_IDS),
    count: o.txIds.length,
    // Recorded either way; reversible only while the payload stays small.
    undo: tooBig || (restoreCount === 0 && removeCount === 0) ? undefined : o.undo,
    ...(o.note ? { note: o.note } : {}),
  };
}

/** Add an entry, newest first, capped in count and in weight. */
export function appendChange(
  log: ChangeLogEntry[] | undefined,
  entry: ChangeLogEntry,
): ChangeLogEntry[] {
  return [entry, ...(log ?? [])]
    .slice(0, MAX_CHANGE_LOG)
    .map((e, i) =>
      i < UNDOABLE_ENTRIES || e.undo === undefined ? e : { ...e, undo: undefined },
    );
}

export function isUndoable(entry: ChangeLogEntry): boolean {
  return (
    (entry.undo?.restore?.length ?? 0) > 0 || (entry.undo?.remove?.length ?? 0) > 0
  );
}

/**
 * Work out what an action did by comparing the ledger before and after it.
 *
 * Deriving the entry rather than letting each action describe itself is what
 * makes the undo *correct* rather than plausible. Deleting a transaction does
 * not only remove that transaction: it drops the lot allocations that pointed
 * at it and turns a transfer leg whose counterpart is gone into an external one
 * (§3.2). An undo that put the deleted row back and left those alone would
 * restore a ledger that never existed. A diff sees all of it.
 *
 * Unchanged transactions keep their object identity through an immutable
 * update, so the common case is a walk of reference comparisons and only the
 * handful that actually differ are compared by value.
 */
export function diffChange(
  before: PortfolioFile,
  after: PortfolioFile,
  kind: ChangeKind,
  o: { at?: Date; note?: string } = {},
): ChangeLogEntry | null {
  const was = snapshotAll(before.wallets);
  const is = snapshotAll(after.wallets);

  const restore: TransactionSnapshot[] = [];
  const remove: string[] = [];
  const txIds: string[] = [];

  for (const [id, prev] of was) {
    const now = is.get(id);
    if (now === undefined) {
      // Gone: putting it back is the whole undo for this one.
      restore.push(prev);
      txIds.push(id);
      continue;
    }
    if (now.transaction === prev.transaction && now.accountId === prev.accountId) continue;
    if (
      now.accountId === prev.accountId &&
      JSON.stringify(now.transaction) === JSON.stringify(prev.transaction)
    ) {
      continue; // a new object with the same content is not a change
    }
    // Changed or moved: take the current version out, put the old one back.
    restore.push(prev);
    remove.push(id);
    txIds.push(id);
  }
  for (const [id] of is) {
    if (was.has(id)) continue;
    remove.push(id);
    txIds.push(id);
  }

  if (txIds.length === 0) return null;
  return newChangeEntry({ kind, txIds, at: o.at, note: o.note, undo: { restore, remove } });
}

/** Every transaction of the file with the account it sits in. */
function snapshotAll(wallets: Wallet[]): Map<string, TransactionSnapshot> {
  const out = new Map<string, TransactionSnapshot>();
  for (const w of wallets) {
    for (const a of w.accounts) {
      for (const t of a.transactions) out.set(t.id, { accountId: a.id, transaction: t });
    }
  }
  return out;
}

/**
 * Apply an entry's undo to the portfolio: remove what the action added, put
 * back what it removed or changed.
 *
 * Both halves are idempotent about what they cannot find. A transaction that
 * has since been deleted by hand is simply not removed again, and an account
 * that no longer exists drops its restores rather than inventing one — the
 * result is reported, so the UI can say "3 of 5 restored" instead of claiming
 * an undo that did not fully happen.
 */
export function applyUndo(
  portfolio: PortfolioFile,
  entry: ChangeLogEntry,
): { portfolio: PortfolioFile; restored: number; removed: number; skipped: number } {
  const removeIds = new Set(entry.undo?.remove ?? []);
  const restores = entry.undo?.restore ?? [];
  const existing = snapshotAll(portfolio.wallets);

  const accountIds = new Set<string>();
  for (const w of portfolio.wallets) for (const a of w.accounts) accountIds.add(a.id);

  let removed = 0;
  let restored = 0;
  let skipped = 0;

  const byAccount = new Map<string, Transaction[]>();
  for (const s of restores) {
    if (!accountIds.has(s.accountId)) {
      skipped += 1;
      continue;
    }
    // Already there (a partial undo, a repeated click): leave it alone —
    // unless this same undo is about to remove it, which is what reverting an
    // *edit* looks like: take the current version out, put the old one back.
    if (existing.has(s.transaction.id) && !removeIds.has(s.transaction.id)) {
      skipped += 1;
      continue;
    }
    const list = byAccount.get(s.accountId) ?? [];
    list.push(s.transaction);
    byAccount.set(s.accountId, list);
    restored += 1;
  }

  const wallets = portfolio.wallets.map((w) => ({
    ...w,
    accounts: w.accounts.map((a) => {
      const kept = a.transactions.filter((t) => {
        if (!removeIds.has(t.id)) return true;
        removed += 1;
        return false;
      });
      const added = byAccount.get(a.id) ?? [];
      return added.length === 0 && kept.length === a.transactions.length
        ? a
        : { ...a, transactions: [...kept, ...added] };
    }),
  }));

  return { portfolio: { ...portfolio, wallets }, restored, removed, skipped };
}
