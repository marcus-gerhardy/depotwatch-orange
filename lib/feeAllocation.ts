// Repairing an assignment that stops one satoshi short of the network fee.
//
// The defect this exists for (§3.2 fee convention): an outgoing transaction's
// `lotAllocations` have to cover `amountBtc + feeBtc`, because that is what
// actually left the account. An assignment covering only `amountBtc` leaves
// the FIFO engine closing less than the ledger debited, and the difference
// stays behind as an open lot in the source account — a ghost holding worth
// exactly the network fee, in every lot-based view while the balance itself
// looks right.
//
// It happens the ordinary way round: the lots are assigned, and the fee is
// filled in afterwards. Nothing recomputes an assignment when a field changes
// (§3.2), and nothing should — so the gap sits there until somebody closes it.
//
// **Only a gap the user has already decided about is repairable.** A disposal
// with no allocations at all is not this defect: which buys it sold is a
// question nobody has answered yet, and answering it here would be the app
// picking lots by itself, which is the one thing it must never do. So the scan
// requires an existing assignment and only ever *adds* what is missing — from
// the lots that assignment already names, and where those are exhausted from
// the next-oldest lots of the same account.

import { Decimal, ZERO, btcString, dec } from "./decimal";
import { totalDebit } from "./portfolio";
import { allocationSumBtc, lotAvailability } from "./transferLink";
import { isOutflow } from "./types";
import type { LedgerEntry, LotAllocation, PortfolioFile, Transaction } from "./types";

/** One outgoing transaction whose assignment does not cover what left. */
export interface FeeAllocationGap {
  entry: LedgerEntry;
  /** `amountBtc + feeBtc` — what the allocations have to add up to. */
  targetBtc: Decimal;
  assignedBtc: Decimal;
  /** What is missing. */
  missingBtc: Decimal;
  /**
   * The shortfall is exactly the BTC fee, i.e. the assignment covers the
   * amount and nothing else. That is the signature of this defect; a different
   * shortfall is some other half-finished assignment and is only reported.
   */
  exactlyTheFee: boolean;
}

/**
 * Every outgoing transaction with a BTC fee whose allocations fall short.
 *
 * Ordered as the ledger is (causal order), so a repair applied in this order
 * never claims a lot a later transaction of the same file is about to need.
 */
export function feeAllocationGaps(entries: LedgerEntry[]): FeeAllocationGap[] {
  const gaps: FeeAllocationGap[] = [];
  for (const entry of entries) {
    if (!isOutflow(entry.type)) continue;
    const fee = dec(entry.feeBtc);
    if (!fee.gt(0)) continue;
    // No assignment at all is a different problem, with a different answer:
    // the user picks the lots. See the note at the top.
    if (!entry.lotAllocations?.length) continue;
    const targetBtc = totalDebit(entry);
    const assignedBtc = allocationSumBtc(entry.lotAllocations);
    const missingBtc = targetBtc.minus(assignedBtc);
    if (!missingBtc.gt(0)) continue;
    gaps.push({
      entry,
      targetBtc,
      assignedBtc,
      missingBtc,
      exactlyTheFee: missingBtc.eq(fee),
    });
  }
  return gaps;
}

/** One lot the repair would take the missing BTC from. */
export interface FeeRepairAddition {
  lotTxId: string;
  amountBtc: Decimal;
  /** Acquisition date of that lot, for the preview. */
  acquiredDate: string;
  /** It is one of the lots the transaction already points at. */
  sameLot: boolean;
}

export interface FeeRepairItem {
  gap: FeeAllocationGap;
  additions: FeeRepairAddition[];
  /** What the additions cover. */
  coveredBtc: Decimal;
  /**
   * What no lot in that account can cover any more. Left alone rather than
   * forced: an over-allocation would be a second wrong number on top of the
   * first one, and this row keeps its data-quality issue instead.
   */
  shortfallBtc: Decimal;
}

export interface FeeRepairPlan {
  items: FeeRepairItem[];
  /** Transactions the plan would change. */
  repairableCount: number;
  /** BTC the plan would assign in total. */
  totalBtc: Decimal;
  /** Transactions it can only partly fix, or not at all. */
  incompleteCount: number;
}

/**
 * What the repair would do, transaction by transaction.
 *
 * The missing BTC is taken **from the lots the transaction already names**
 * first, in the order it names them: the fee was paid to move those very
 * coins, so those are the lots it came out of. Only where they have nothing
 * left does it fall back to the account's other open lots, oldest first — the
 * same FIFO order every other fallback in the app uses.
 *
 * Availability counts every allocation in the file, this transaction's own
 * included, so the plan can never hand the same satoshi to two transactions:
 * each item is planned against the allocations the previous items would write.
 */
export function planFeeAllocationRepair(
  entries: LedgerEntry[],
  gaps: FeeAllocationGap[] = feeAllocationGaps(entries),
): FeeRepairPlan {
  // The running state: allocations as they would stand after the items planned
  // so far, so availability shrinks as the plan grows.
  const planned = new Map<string, LotAllocation[]>();
  const withPlanned = (): LedgerEntry[] =>
    entries.map((e) => {
      const next = planned.get(e.id);
      return next ? { ...e, lotAllocations: next } : e;
    });

  const items: FeeRepairItem[] = [];
  for (const gap of gaps) {
    const { entry } = gap;
    const available = lotAvailability(withPlanned(), { accountId: entry.accountId });
    const availableById = new Map(available.map((l) => [l.entry.id, l]));
    // The lots this transaction already points at, in its own order, then
    // everything else in the account oldest first (lotAvailability sorts).
    const named = (entry.lotAllocations ?? []).map((a) => a.lotTransactionId);
    const order = [
      ...named,
      ...available.map((l) => l.entry.id).filter((id) => !named.includes(id)),
    ];

    const additions: FeeRepairAddition[] = [];
    let remaining = gap.missingBtc;
    for (const lotTxId of order) {
      if (!remaining.gt(0)) break;
      const lot = availableById.get(lotTxId);
      if (!lot || !lot.availableBtc.gt(0)) continue;
      const take = Decimal.min(lot.availableBtc, remaining);
      additions.push({
        lotTxId,
        amountBtc: take,
        acquiredDate: lot.entry.date,
        sameLot: named.includes(lotTxId),
      });
      remaining = remaining.minus(take);
    }

    const coveredBtc = additions.reduce((s, a) => s.plus(a.amountBtc), ZERO);
    if (coveredBtc.gt(0)) {
      planned.set(entry.id, mergeAllocations(entry.lotAllocations ?? [], additions, entries));
    }
    items.push({ gap, additions, coveredBtc, shortfallBtc: remaining });
  }

  return {
    items,
    repairableCount: items.filter((i) => i.coveredBtc.gt(0)).length,
    totalBtc: items.reduce((s, i) => s.plus(i.coveredBtc), ZERO),
    incompleteCount: items.filter((i) => i.shortfallBtc.gt(0)).length,
  };
}

/**
 * The transaction's allocations with the additions folded in, oldest lot
 * first.
 *
 * The order is not cosmetic: the FIFO engine takes the network fee off the
 * *last* allocation, so it decides which lot pays the fee (§3.2). Oldest first
 * is what every other writer in the app stores, and keeping it here means a
 * repaired transaction is indistinguishable from one assigned by hand.
 */
function mergeAllocations(
  existing: LotAllocation[],
  additions: FeeRepairAddition[],
  entries: LedgerEntry[],
): LotAllocation[] {
  const dateOf = new Map(entries.map((e) => [e.id, e.date]));
  const merged = new Map<string, Decimal>();
  for (const a of existing) {
    merged.set(a.lotTransactionId, (merged.get(a.lotTransactionId) ?? ZERO).plus(dec(a.amountBtc)));
  }
  for (const a of additions) {
    merged.set(a.lotTxId, (merged.get(a.lotTxId) ?? ZERO).plus(a.amountBtc));
  }
  return [...merged.entries()]
    .map(([lotTransactionId, amount]) => ({
      lotTransactionId,
      amountBtc: btcString(amount),
    }))
    .sort((a, b) =>
      (dateOf.get(a.lotTransactionId) ?? "").localeCompare(
        dateOf.get(b.lotTransactionId) ?? "",
      ),
    );
}

/**
 * The plan applied to the portfolio. Pure, like everything else here: the
 * store writes the result and records the change, the dialog previews it.
 *
 * Items the plan could not cover at all are skipped rather than written half
 * way: a transaction that gains a meaningless partial allocation is harder to
 * understand afterwards than one that was left alone.
 */
export function applyFeeAllocationRepair(
  portfolio: PortfolioFile,
  plan: FeeRepairPlan,
  entries: LedgerEntry[],
): PortfolioFile {
  const byId = new Map<string, LotAllocation[]>();
  for (const item of plan.items) {
    if (!item.coveredBtc.gt(0)) continue;
    byId.set(
      item.gap.entry.id,
      mergeAllocations(item.gap.entry.lotAllocations ?? [], item.additions, entries),
    );
  }
  if (byId.size === 0) return portfolio;
  return {
    ...portfolio,
    wallets: portfolio.wallets.map((w) => ({
      ...w,
      accounts: w.accounts.map((a) => ({
        ...a,
        transactions: a.transactions.map((t: Transaction) => {
          const next = byId.get(t.id);
          return next ? { ...t, lotAllocations: next } : t;
        }),
      })),
    })),
  };
}
