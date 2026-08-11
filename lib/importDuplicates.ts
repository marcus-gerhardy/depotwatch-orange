// Duplicate detection for the CSV import (CLAUDE.md §3.4).
//
// The failure this exists for: an export imported twice doubles the holding and
// quietly falsifies every tax figure derived from it, and nothing in the app
// would look broken afterwards — the numbers are simply wrong.
//
// Two rules matter more than the detection itself:
//
//  1. **Nothing is ever rejected automatically.** Two identical transactions
//     can be perfectly real (a split order filled twice at the same second, a
//     standing buy that ran twice). So a duplicate is *marked*, defaulted to
//     "do not import", and the user decides.
//  2. **Indexes, not nested loops.** A portfolio with several thousand
//     transactions must not turn a preview into a freeze, so the comparison
//     keys are built once and every candidate is an O(1) lookup.

import { dec } from "./decimal";
import type { Transaction } from "./types";

/** How a duplicate was recognised, strongest evidence first. */
export type DuplicateKind =
  /** Same on-chain transaction id in the same account and of the same type. */
  | "txid"
  /** Account, type, timestamp, amount and EUR figure all identical. */
  | "exact"
  /** The same, but the timestamps differ inside the configured tolerance. */
  | "nearby";

export interface DuplicateMatch {
  kind: DuplicateKind;
  /**
   * Whether the match is proof. txid and exact are; "nearby" rests on a
   * tolerance and is therefore offered as a suspicion, which is why the UI
   * words the two differently.
   */
  certain: boolean;
  /** The colliding transaction already in the portfolio, when it is one. */
  existingId?: string;
  /** The colliding earlier row of the same file, when it is one. */
  rowId?: string;
  /** Minutes between the two timestamps; 0 for an exact match. */
  minutesApart: number;
}

/** What the comparison actually looks at, normalised. */
interface Candidate {
  accountId: string;
  type: string;
  time: number;
  /** Amount with the ledger's precision, so "0.5" and "0.50000000" agree. */
  amount: string;
  /** EUR total to the cent; "" when the transaction carries none. */
  eur: string;
  txid?: string;
}

const MINUTE = 60_000;

function eurOf(t: Transaction): string {
  if (t.totalFiatEur != null) return dec(t.totalFiatEur).toFixed(2);
  if (t.pricePerBtcEur != null) {
    return dec(t.pricePerBtcEur).mul(dec(t.amountBtc)).toFixed(2);
  }
  return "";
}

/**
 * The comparable shape of a transaction. Exported because the import builds
 * candidates from rows it has not written yet.
 */
export function candidateOf(t: Transaction, accountId: string): Candidate {
  return {
    accountId,
    type: t.type,
    time: new Date(t.date).getTime(),
    amount: dec(t.amountBtc).toFixed(8),
    eur: eurOf(t),
    txid: t.txid,
  };
}

const txidKey = (c: Candidate) => `${c.accountId}|${c.type}|${c.txid}`;
const valueKey = (c: Candidate) => `${c.accountId}|${c.type}|${c.amount}|${c.eur}`;
const exactKey = (c: Candidate) => `${valueKey(c)}|${c.time}`;

/** One entry in the index: what it is, and what to point the user at. */
interface Indexed {
  candidate: Candidate;
  existingId?: string;
  rowId?: string;
}

export interface DuplicateIndex {
  byTxid: Map<string, Indexed>;
  byExact: Map<string, Indexed>;
  /** Same values, any timestamp — scanned only inside one bucket. */
  byValues: Map<string, Indexed[]>;
  size: number;
}

export function emptyIndex(): DuplicateIndex {
  return { byTxid: new Map(), byExact: new Map(), byValues: new Map(), size: 0 };
}

/** Add one transaction to an index (existing transaction or earlier row). */
export function indexAdd(index: DuplicateIndex, entry: Indexed): void {
  const c = entry.candidate;
  if (Number.isNaN(c.time)) return;
  if (c.txid) {
    const key = txidKey(c);
    if (!index.byTxid.has(key)) index.byTxid.set(key, entry);
  }
  const exact = exactKey(c);
  if (!index.byExact.has(exact)) index.byExact.set(exact, entry);
  const values = valueKey(c);
  const bucket = index.byValues.get(values);
  if (bucket) bucket.push(entry);
  else index.byValues.set(values, [entry]);
  index.size += 1;
}

/**
 * Index the transactions already in an account. Built once per preview, so a
 * portfolio of several thousand transactions costs one pass rather than one
 * pass per imported row.
 */
export function buildDuplicateIndex(
  existing: { transaction: Transaction; accountId: string }[],
): DuplicateIndex {
  const index = emptyIndex();
  for (const { transaction, accountId } of existing) {
    indexAdd(index, {
      candidate: candidateOf(transaction, accountId),
      existingId: transaction.id,
    });
  }
  return index;
}

/**
 * The strongest match for a candidate, or null.
 *
 * The order is the order of evidence: a shared on-chain id in the same account
 * is the same send; identical values at the identical second are the same
 * booking; identical values a minute apart are *probably* the same booking
 * seen through two exports that disagree about time zones or rounding.
 */
export function findDuplicate(
  candidate: Candidate,
  index: DuplicateIndex,
  toleranceMinutes: number,
): DuplicateMatch | null {
  if (Number.isNaN(candidate.time)) return null;

  if (candidate.txid) {
    const hit = index.byTxid.get(txidKey(candidate));
    if (hit) {
      return {
        kind: "txid",
        certain: true,
        existingId: hit.existingId,
        rowId: hit.rowId,
        minutesApart: Math.abs(hit.candidate.time - candidate.time) / MINUTE,
      };
    }
  }

  const exact = index.byExact.get(exactKey(candidate));
  if (exact) {
    return {
      kind: "exact",
      certain: true,
      existingId: exact.existingId,
      rowId: exact.rowId,
      minutesApart: 0,
    };
  }

  if (toleranceMinutes > 0) {
    const bucket = index.byValues.get(valueKey(candidate));
    if (bucket) {
      let best: Indexed | null = null;
      let bestDistance = Infinity;
      for (const entry of bucket) {
        const distance = Math.abs(entry.candidate.time - candidate.time);
        if (distance <= toleranceMinutes * MINUTE && distance < bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      }
      if (best) {
        return {
          kind: "nearby",
          // A tolerance is a guess, and the UI has to say so.
          certain: false,
          existingId: best.existingId,
          rowId: best.rowId,
          minutesApart: bestDistance / MINUTE,
        };
      }
    }
  }

  return null;
}

export interface RowCandidate {
  rowId: string;
  transaction: Transaction;
}

export interface DuplicateScan {
  /** Row id → what it collides with; rows without a match are absent. */
  matches: Map<string, DuplicateMatch>;
  certainCount: number;
  probableCount: number;
}

/**
 * Check every row of an import against what the account already holds *and*
 * against the earlier rows of the same file — a file that contains the same
 * line twice is the other half of this problem.
 *
 * Rows are walked in file order, and each one joins the index afterwards, so
 * the *second* occurrence is the one flagged and the first stays importable.
 */
export function scanForDuplicates(
  rows: RowCandidate[],
  accountId: string,
  existingIndex: DuplicateIndex,
  toleranceMinutes: number,
): DuplicateScan {
  // Copy, so the caller's index of existing transactions is not grown by rows
  // that may never be imported.
  const index: DuplicateIndex = {
    byTxid: new Map(existingIndex.byTxid),
    byExact: new Map(existingIndex.byExact),
    byValues: new Map(
      [...existingIndex.byValues].map(([k, v]) => [k, [...v]] as const),
    ),
    size: existingIndex.size,
  };

  const matches = new Map<string, DuplicateMatch>();
  let certainCount = 0;
  let probableCount = 0;

  for (const row of rows) {
    const candidate = candidateOf(row.transaction, accountId);
    const match = findDuplicate(candidate, index, toleranceMinutes);
    if (match) {
      matches.set(row.rowId, match);
      if (match.certain) certainCount += 1;
      else probableCount += 1;
    }
    indexAdd(index, { candidate, rowId: row.rowId });
  }

  return { matches, certainCount, probableCount };
}

/**
 * SHA-256 of a file's raw bytes, hex — what identifies "the same file again".
 * The bytes, not the parsed rows: a re-export with one row appended is a
 * different file and has to be treated as one.
 */
export async function hashFile(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
