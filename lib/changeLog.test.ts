/** @vitest-environment jsdom */
// The change log. Two properties matter: it cannot grow without bound, and an
// undo that cannot be carried out completely says so instead of half-doing it.

import { describe, expect, it } from "vitest";
import {
  MAX_CHANGE_LOG,
  UNDOABLE_ENTRIES,
  appendChange,
  applyUndo,
  isUndoable,
  newChangeEntry,
} from "./changeLog";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "./types";

const tx = (id: string): Transaction => ({
  id,
  type: "buy",
  date: "2025-01-01T00:00:00.000Z",
  amountBtc: "0.1",
  pricePerBtcEur: "50000",
  note: "",
});

function file(ids: string[] = ["t1", "t2"]): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "W",
      type: "exchange",
      accounts: [
        { id: "a1", name: "A", transactions: ids.map(tx) },
        { id: "a2", name: "B", transactions: [] },
      ],
    },
  ];
  return p;
}

describe("the log itself", () => {
  it("keeps the newest 50 and drops the rest", () => {
    let log = undefined as ReturnType<typeof appendChange> | undefined;
    for (let i = 0; i < 60; i++) {
      log = appendChange(log, newChangeEntry({ kind: "add", txIds: [`t${i}`] }));
    }
    expect(log).toHaveLength(MAX_CHANGE_LOG);
    expect(log![0].txIds).toEqual(["t59"]);
    expect(log![MAX_CHANGE_LOG - 1].txIds).toEqual(["t10"]);
  });

  it("keeps the undo payload only for the newest entries", () => {
    // Fifty entries each carrying transactions would put megabytes into the
    // file, and nobody undoes the fortieth-last action.
    let log: ReturnType<typeof appendChange> | undefined = undefined;
    for (let i = 0; i < 15; i++) {
      log = appendChange(
        log,
        newChangeEntry({
          kind: "delete",
          txIds: [`t${i}`],
          undo: { restore: [{ accountId: "a1", transaction: tx(`t${i}`) }] },
        }),
      );
    }
    expect(log!.filter(isUndoable)).toHaveLength(UNDOABLE_ENTRIES);
    // The older ones are still there, just no longer reversible.
    expect(log).toHaveLength(15);
    expect(isUndoable(log![0])).toBe(true);
    expect(isUndoable(log![UNDOABLE_ENTRIES])).toBe(false);
  });

  it("records a big action but does not carry it", () => {
    // A bulk delete of 500 rows is worth knowing about; putting 500
    // transactions into the file twice is not.
    const many = Array.from({ length: 500 }, (_, i) => `t${i}`);
    const entry = newChangeEntry({
      kind: "delete",
      txIds: many,
      undo: { restore: many.map((id) => ({ accountId: "a1", transaction: tx(id) })) },
    });
    expect(entry.count).toBe(500);
    expect(entry.undo).toBeUndefined();
    expect(isUndoable(entry)).toBe(false);
    // The ids are capped too, so the entry itself stays small.
    expect(entry.txIds.length).toBeLessThanOrEqual(200);
  });

  it("keeps the payload for an action that is small enough", () => {
    const entry = newChangeEntry({
      kind: "delete",
      txIds: ["t1"],
      undo: { restore: [{ accountId: "a1", transaction: tx("t1") }] },
    });
    expect(isUndoable(entry)).toBe(true);
  });
});

describe("undoing", () => {
  it("puts a deleted transaction back where it was", () => {
    const before = file(["t1", "t2"]);
    const removed = before.wallets[0].accounts[0].transactions[1];
    const after: PortfolioFile = {
      ...before,
      wallets: [
        {
          ...before.wallets[0],
          accounts: [
            { ...before.wallets[0].accounts[0], transactions: [tx("t1")] },
            before.wallets[0].accounts[1],
          ],
        },
      ],
    };
    const entry = newChangeEntry({
      kind: "delete",
      txIds: ["t2"],
      undo: { restore: [{ accountId: "a1", transaction: removed }] },
    });

    const result = applyUndo(after, entry);
    expect(result.restored).toBe(1);
    expect(
      result.portfolio.wallets[0].accounts[0].transactions.map((t) => t.id).sort(),
    ).toEqual(["t1", "t2"]);
  });

  it("removes what an action added", () => {
    const entry = newChangeEntry({ kind: "add", txIds: ["t2"], undo: { remove: ["t2"] } });
    const result = applyUndo(file(["t1", "t2"]), entry);
    expect(result.removed).toBe(1);
    expect(result.portfolio.wallets[0].accounts[0].transactions.map((t) => t.id)).toEqual([
      "t1",
    ]);
  });

  it("restores an edited transaction to its previous version", () => {
    const edited = file(["t1"]);
    edited.wallets[0].accounts[0].transactions[0] = { ...tx("t1"), amountBtc: "9.9" };
    const entry = newChangeEntry({
      kind: "update",
      txIds: ["t1"],
      undo: { remove: ["t1"], restore: [{ accountId: "a1", transaction: tx("t1") }] },
    });
    const result = applyUndo(edited, entry);
    expect(result.portfolio.wallets[0].accounts[0].transactions[0].amountBtc).toBe("0.1");
  });

  it("skips what it cannot put back rather than inventing a place for it", () => {
    const entry = newChangeEntry({
      kind: "delete",
      txIds: ["gone"],
      undo: { restore: [{ accountId: "deleted-account", transaction: tx("gone") }] },
    });
    const result = applyUndo(file(), entry);
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(1);
    // And the ledger is untouched.
    expect(result.portfolio.wallets[0].accounts[0].transactions).toHaveLength(2);
  });

  it("is safe to apply twice", () => {
    const entry = newChangeEntry({
      kind: "delete",
      txIds: ["t3"],
      undo: { restore: [{ accountId: "a1", transaction: tx("t3") }] },
    });
    const once = applyUndo(file(["t1"]), entry);
    const twice = applyUndo(once.portfolio, entry);
    expect(twice.restored).toBe(0);
    expect(twice.skipped).toBe(1);
    expect(twice.portfolio.wallets[0].accounts[0].transactions).toHaveLength(2);
  });
});
