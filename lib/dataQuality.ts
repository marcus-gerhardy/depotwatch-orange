// Gaps in the ledger that are worth fixing but never block anything.
//
// The dashboard's data-quality widget counts them and the transaction table
// filters by them, so both must agree on what "missing" means — hence one
// predicate per issue here rather than a copy on each side.

import type { LedgerEntry, Transaction } from "./types";

export type DataIssue =
  /** A transfer leg with no counterpart leg linked to it (§3.2 transferGroupId). */
  | "unlinkedTransfer"
  /** A transfer leg without its on-chain transaction id. */
  | "missingTxid"
  /** A buy/sell/spend with no EUR figure at all, so FIFO cannot value it. */
  | "missingEurValue";

export const DATA_ISSUES: DataIssue[] = [
  "unlinkedTransfer",
  "missingTxid",
  "missingEurValue",
];

function isTransferLeg(tx: Transaction): boolean {
  return tx.type === "transfer_in" || tx.type === "transfer_out";
}

/**
 * Whether a transaction shows this issue. Only transfers can lack a link or a
 * txid, and only buy/sell/spend need a EUR value (a transfer's value is traced
 * from the lots it moves), so every predicate is scoped to its own types.
 */
export function hasIssue(tx: Transaction, issue: DataIssue): boolean {
  switch (issue) {
    case "unlinkedTransfer":
      return isTransferLeg(tx) && !tx.transferGroupId;
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
    missingTxid: 0,
    missingEurValue: 0,
  };
  for (const e of entries) {
    for (const issue of DATA_ISSUES) if (hasIssue(e, issue)) counts[issue]++;
  }
  return counts;
}
