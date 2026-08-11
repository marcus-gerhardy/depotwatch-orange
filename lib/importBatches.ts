// Undoing a CSV import (CLAUDE.md §3.4).
//
// Removing a batch is easy; removing it *safely* is the point. A transaction
// written by an import is an ordinary transaction from the moment it exists:
// a later sale may allocate it as a lot, a transfer leg may be linked to it,
// and both of those references live on *other* transactions. Dropping it would
// leave those pointing at nothing — an allocation with no lot behind it, an
// arrival whose send vanished — which is exactly the kind of silent damage the
// import is supposed to prevent.
//
// So this module never removes anything by itself. It reports what would break
// and lets the caller decide, the same way the duplicate detection marks
// instead of discarding.

import type { ImportBatch, PortfolioFile, Transaction } from "./types";

export type RemovalBlockReason =
  /** Another transaction consumes this one as a lot (a sale, a transfer out). */
  | "allocatedByOther"
  /** It is a leg of a transfer whose counterpart is not part of this batch. */
  | "linkedTransfer"
  /** It allocates lots that are not part of this batch (it closed them). */
  | "allocatesOther";

export interface RemovalBlocker {
  transactionId: string;
  reason: RemovalBlockReason;
  /** The transaction on the other side of the reference, for the message. */
  otherId?: string;
  date: string;
  amountBtc: string;
  type: Transaction["type"];
}

export interface BatchRemoval {
  batch: ImportBatch | null;
  /** Every transaction the batch wrote that is still in the file. */
  transactionIds: string[];
  /** References that would break; empty means the batch can just go. */
  blockers: RemovalBlocker[];
  /** Transactions that can be removed without breaking anything. */
  removableIds: string[];
}

interface Located {
  tx: Transaction;
  accountId: string;
}

function locate(portfolio: PortfolioFile): Located[] {
  const out: Located[] = [];
  for (const w of portfolio.wallets) {
    for (const a of w.accounts) {
      for (const tx of a.transactions) out.push({ tx, accountId: a.id });
    }
  }
  return out;
}

/**
 * What undoing a batch would do, and what it would break.
 *
 * Everything is derived from one pass over the ledger plus map lookups, so this
 * stays usable on a portfolio with thousands of transactions.
 */
export function analyzeBatchRemoval(
  portfolio: PortfolioFile,
  batchId: string,
): BatchRemoval {
  const batch = portfolio.importBatches?.find((b) => b.id === batchId) ?? null;
  const all = locate(portfolio);
  const inBatch = new Set(
    all.filter(({ tx }) => tx.importBatchId === batchId).map(({ tx }) => tx.id),
  );

  const blockers: RemovalBlocker[] = [];
  const byId = new Map(all.map(({ tx }) => [tx.id, tx]));
  const blocked = new Set<string>();

  const block = (id: string, reason: RemovalBlockReason, otherId?: string) => {
    const tx = byId.get(id);
    if (!tx) return;
    blocked.add(id);
    blockers.push({
      transactionId: id,
      reason,
      otherId,
      date: tx.date,
      amountBtc: tx.amountBtc,
      type: tx.type,
    });
  };

  // Legs of the same transfer group that are *not* in the batch: removing our
  // side would orphan theirs.
  const groupOutsiders = new Map<string, string>();
  for (const { tx } of all) {
    if (tx.transferGroupId && !inBatch.has(tx.id)) {
      groupOutsiders.set(tx.transferGroupId, tx.id);
    }
  }

  for (const { tx } of all) {
    if (inBatch.has(tx.id)) continue;
    // Somebody else's allocations pointing into the batch: that transaction
    // was sold, spent or sent on, and the lot it names would disappear.
    for (const a of tx.lotAllocations ?? []) {
      if (inBatch.has(a.lotTransactionId)) {
        block(a.lotTransactionId, "allocatedByOther", tx.id);
      }
    }
  }

  for (const id of inBatch) {
    const tx = byId.get(id)!;
    if (tx.transferGroupId && groupOutsiders.has(tx.transferGroupId)) {
      block(id, "linkedTransfer", groupOutsiders.get(tx.transferGroupId));
    }
    // The other direction: this transaction closed lots that stay behind. Its
    // removal would silently re-open them, which changes the tax history of
    // transactions nobody asked to touch.
    for (const a of tx.lotAllocations ?? []) {
      if (!inBatch.has(a.lotTransactionId) && byId.has(a.lotTransactionId)) {
        block(id, "allocatesOther", a.lotTransactionId);
      }
    }
  }

  const transactionIds = [...inBatch];
  return {
    batch,
    transactionIds,
    blockers,
    removableIds: transactionIds.filter((id) => !blocked.has(id)),
  };
}

/**
 * Remove a batch's transactions and the batch itself.
 *
 * `ids` is what the caller decided to remove — normally `removableIds`, so a
 * reference that would break is left alone rather than quietly severed. The
 * batch record goes only when nothing of it is left; otherwise it stays, with
 * its count corrected, so what remains is still traceable to where it came
 * from.
 */
export function removeBatchTransactions(
  portfolio: PortfolioFile,
  batchId: string,
  ids: string[],
): PortfolioFile {
  const remove = new Set(ids);
  const wallets = portfolio.wallets.map((w) => ({
    ...w,
    accounts: w.accounts.map((a) => ({
      ...a,
      transactions: a.transactions.filter((t) => !remove.has(t.id)),
    })),
  }));
  const left = wallets.some((w) =>
    w.accounts.some((a) => a.transactions.some((t) => t.importBatchId === batchId)),
  );
  const batches = (portfolio.importBatches ?? [])
    .filter((b) => b.id !== batchId || left)
    .map((b) =>
      b.id === batchId
        ? { ...b, transactionCount: b.transactionCount - remove.size }
        : b,
    );
  return {
    ...portfolio,
    wallets,
    importBatches: batches.length > 0 ? batches : undefined,
  };
}

/** Batches a file already knows, newest first — what the list shows. */
export function sortedBatches(portfolio: PortfolioFile): ImportBatch[] {
  return [...(portfolio.importBatches ?? [])].sort((a, b) =>
    b.importedAt.localeCompare(a.importedAt),
  );
}

/** The batch a file with this hash was imported as, if any. */
export function batchForHash(
  portfolio: PortfolioFile,
  fileHash: string,
): ImportBatch | null {
  return (
    sortedBatches(portfolio).find((b) => b.fileHash === fileHash) ?? null
  );
}
