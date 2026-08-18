// Gaps in the ledger that are worth fixing but never block anything.
//
// The dashboard's data-quality widget counts them and the transaction table
// filters by them, so both must agree on what "missing" means — hence one
// predicate per issue here rather than a copy on each side.

import { unresolvedOriginIds } from "./provenance";
import {
  allocationSumBtc,
  allocationTargetBtc,
  effectiveOnChain,
  groupOnChain,
  isLegPaired,
  pairedGroupIds,
  type GroupOnChain,
} from "./transferLink";
import { isOutflow, isPriced } from "./types";
import type { LedgerEntry, Transaction } from "./types";

export type DataIssue =
  /** A transfer leg with no counterpart leg linked to it (§3.2 transferGroupId). */
  | "unlinkedTransfer"
  /**
   * An incoming transfer whose coins cannot be traced back to an acquisition,
   * so their holding period is undeterminable. Not the same as an unlinked leg:
   * an outgoing leg without a link has no holding period to lose, and a linked
   * arrival can still dead-end on a broken reference further back.
   */
  | "unresolvedOrigin"
  /**
   * A disposal — sell, spend or outgoing transfer — whose lot allocations do
   * not cover what left the account, so which buys it took its coins from is
   * (partly) undecided. Nothing decides that for the user (§3.2), so until it
   * is assigned the disposal closes no lots: its cost basis, holding period
   * and gain are unknown. The counterpart of `unresolvedOrigin`: that one is a
   * missing link, this one a missing assignment, each fixed in its own place.
   */
  | "incompleteAllocation"
  /** A transfer leg without its on-chain transaction id. */
  | "missingTxid"
  /** A buy/sell/spend with no EUR figure at all, so FIFO cannot value it. */
  | "missingEurValue";

export const DATA_ISSUES: DataIssue[] = [
  "unlinkedTransfer",
  "unresolvedOrigin",
  "incompleteAllocation",
  "missingTxid",
  "missingEurValue",
];

/**
 * What a predicate cannot see from a single transaction. Origin resolution
 * walks the whole ledger backwards, so it is computed once and handed in.
 */
export interface IssueContext {
  unresolvedOrigin: Set<string>;
  /** Groups that really pair an out-leg with an in-leg (`pairedGroupIds`). */
  pairedGroups: Set<string>;
  /** On-chain data each transfer group shares (`groupOnChain`). */
  onChainByGroup: Map<string, GroupOnChain>;
}

export function issueContext(entries: LedgerEntry[]): IssueContext {
  return {
    unresolvedOrigin: unresolvedOriginIds(entries),
    pairedGroups: pairedGroupIds(entries),
    onChainByGroup: groupOnChain(entries),
  };
}

function isTransferLeg(tx: Transaction): boolean {
  return tx.type === "transfer_in" || tx.type === "transfer_out";
}

/**
 * Whether a transaction shows this issue. Only transfers can lack a link, an
 * origin or a txid, and only buy/sell/spend need a EUR value (a transfer's
 * value is traced from the lots it moves), so every predicate is scoped to its
 * own types. Without a context, ledger-wide issues report false rather than
 * guessing — a caller that wants them passes `issueContext(entries)`.
 */
export function hasIssue(
  tx: Transaction,
  issue: DataIssue,
  ctx?: IssueContext,
): boolean {
  switch (issue) {
    case "unlinkedTransfer":
      // A group id whose counterpart does not exist is not a link. Without a
      // context only the field can be judged, which is the safe half of it.
      return (
        isTransferLeg(tx) &&
        (ctx === undefined ? !tx.transferGroupId : !isLegPaired(tx, ctx.pairedGroups))
      );
    case "unresolvedOrigin":
      return ctx?.unresolvedOrigin.has(tx.id) ?? false;
    case "incompleteAllocation":
      // Every outgoing type has to say which lots it closes — a gift as much
      // as a sale, since it decides what the given coins had cost.
      return (
        isOutflow(tx.type) &&
        !allocationSumBtc(tx.lotAllocations).eq(allocationTargetBtc(tx))
      );
    case "missingTxid":
      // The counterpart leg's txid is this leg's txid — one transaction, one
      // id — so a leg is only missing it when the whole group is.
      return (
        isTransferLeg(tx) &&
        !(ctx === undefined
          ? tx.txid
          : effectiveOnChain(tx, ctx.onChainByGroup).txid)
      );
    case "missingEurValue":
      // Income needs a EUR value as much as a trade does: it *is* taxed at
      // that value, and it becomes the cost basis of the coins.
      return (
        isPriced(tx.type) &&
        (tx.totalFiatEur === null || tx.totalFiatEur === undefined) &&
        (tx.pricePerBtcEur === null || tx.pricePerBtcEur === undefined)
      );
  }
}

export type IssueCounts = Record<DataIssue, number>;

export function countIssues(entries: LedgerEntry[]): IssueCounts {
  const counts: IssueCounts = {
    unlinkedTransfer: 0,
    unresolvedOrigin: 0,
    incompleteAllocation: 0,
    missingTxid: 0,
    missingEurValue: 0,
  };
  const ctx = issueContext(entries);
  for (const e of entries) {
    for (const issue of DATA_ISSUES) if (hasIssue(e, issue, ctx)) counts[issue]++;
  }
  return counts;
}
