// What a deletion leaves behind, and how to repair it.
//
// Transactions reference each other in two ways (CLAUDE.md §3.2): a disposal
// pins the lots it consumed via `lotAllocations`, and the legs of an internal
// transfer share a `transferGroupId`. Deleting a transaction without touching
// those references leaves dangling links: a sell would keep pointing at a buy
// that no longer exists (reported as an uncovered amount forever), and the
// surviving leg of a transfer would have no counterpart, so its coins drop out
// of the FIFO engine while the balance still counts them.
//
// Both are released here: stale allocations are dropped so the disposal falls
// back to dynamic FIFO, and a leg whose counterpart is gone becomes a plain
// external transfer.

import type { Transaction, Wallet } from "./types";

export interface DeletionImpact {
  /** Transactions whose lot allocations reference something being deleted. */
  clearedAllocations: Transaction[];
  /** Transfer legs that lose their counterpart and become external. */
  releasedLegs: Transaction[];
}

function allTransactions(wallets: Wallet[]): Transaction[] {
  return wallets.flatMap((w) => w.accounts.flatMap((a) => a.transactions));
}

/**
 * Groups that no longer have both directions once `deleted` is gone. Their
 * surviving legs must be released; a group that still has an out-leg and at
 * least one in-leg stays intact (one transfer can have several in-legs).
 */
function brokenGroups(wallets: Wallet[], deleted: Set<string>): Set<string> {
  const survivors = new Map<string, { out: boolean; in: boolean }>();
  for (const t of allTransactions(wallets)) {
    if (!t.transferGroupId || deleted.has(t.id)) continue;
    const state = survivors.get(t.transferGroupId) ?? { out: false, in: false };
    if (t.type === "transfer_out") state.out = true;
    if (t.type === "transfer_in") state.in = true;
    survivors.set(t.transferGroupId, state);
  }
  const affected = new Set<string>();
  for (const t of allTransactions(wallets)) {
    if (!deleted.has(t.id) || !t.transferGroupId) continue;
    affected.add(t.transferGroupId);
  }
  const broken = new Set<string>();
  for (const group of affected) {
    const state = survivors.get(group);
    if (!state || !state.out || !state.in) broken.add(group);
  }
  return broken;
}

/** Which surviving transactions a deletion would touch (for the confirm dialog). */
export function deletionImpact(
  wallets: Wallet[],
  deletedIds: string[],
): DeletionImpact {
  const deleted = new Set(deletedIds);
  const broken = brokenGroups(wallets, deleted);
  const clearedAllocations: Transaction[] = [];
  const releasedLegs: Transaction[] = [];
  for (const t of allTransactions(wallets)) {
    if (deleted.has(t.id)) continue;
    if (t.lotAllocations?.some((a) => deleted.has(a.lotTransactionId))) {
      clearedAllocations.push(t);
    }
    if (t.transferGroupId && broken.has(t.transferGroupId)) releasedLegs.push(t);
  }
  return { clearedAllocations, releasedLegs };
}

/**
 * Remove the given transactions and release everything that referenced them.
 * Returns the wallets unchanged when nothing matched.
 */
export function deleteAndRelease(wallets: Wallet[], deletedIds: string[]): Wallet[] {
  const deleted = new Set(deletedIds);
  const broken = brokenGroups(wallets, deleted);

  const release = (t: Transaction): Transaction => {
    let next = t;
    const stale = t.lotAllocations?.some((a) => deleted.has(a.lotTransactionId));
    if (stale) {
      const kept = t.lotAllocations!.filter((a) => !deleted.has(a.lotTransactionId));
      next = { ...next, lotAllocations: kept.length > 0 ? kept : undefined };
    }
    if (t.transferGroupId && broken.has(t.transferGroupId)) {
      // No counterpart left: this is an external send/receive now.
      next = {
        ...next,
        transferGroupId: undefined,
        counterpartyAccountId: undefined,
      };
    }
    return next;
  };

  return wallets.map((w) => ({
    ...w,
    accounts: w.accounts.map((a) => ({
      ...a,
      transactions: a.transactions
        .filter((t) => !deleted.has(t.id))
        .map(release),
    })),
  }));
}
