// Gaps in the ledger that are worth fixing but never block anything.
//
// The dashboard's data-quality widget counts them and the transaction table
// filters by them, so both must agree on what "missing" means — hence one
// predicate per issue here rather than a copy on each side.

import { unresolvedOriginIds } from "./provenance";
import {
  allocationSumBtc,
  allocationTargetBtc,
  isLegPaired,
  pairedGroupIds,
} from "./transferLink";
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
   * An outgoing transfer whose lot allocations do not cover what left the
   * account, so which coins it moved is (partly) undecided. The counterpart of
   * `unresolvedOrigin`: that one is a missing link, this one a missing
   * assignment, and each is fixed in a different place.
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
}

export function issueContext(entries: LedgerEntry[]): IssueContext {
  return {
    unresolvedOrigin: unresolvedOriginIds(entries),
    pairedGroups: pairedGroupIds(entries),
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
      return (
        tx.type === "transfer_out" &&
        !allocationSumBtc(tx.lotAllocations).eq(allocationTargetBtc(tx))
      );
    case "missingTxid":
      return isTransferLeg(tx) && !tx.txid;
    case "missingEurValue":
      return (
        (tx.type === "buy" || tx.type === "sell" || tx.type === "spend") &&
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
