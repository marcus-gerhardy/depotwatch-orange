// Duplicate detection for the CSV import.
//
// The failure it exists for is silent: an export imported twice doubles the
// holding and falsifies every tax figure derived from it, and nothing looks
// broken afterwards. So these tests pin both directions — what must be caught,
// and what must *not* be, because two identical transactions can be real.

import { describe, expect, it } from "vitest";
import {
  buildDuplicateIndex,
  candidateOf,
  emptyIndex,
  findDuplicate,
  scanForDuplicates,
} from "./importDuplicates";
import type { Transaction } from "./types";

const tx = (o: Partial<Transaction> & Pick<Transaction, "id">): Transaction => ({
  type: "buy",
  date: "2026-03-02T10:00:00.000Z",
  amountBtc: "0.5",
  pricePerBtcEur: "50000",
  totalFiatEur: "25000",
  note: "",
  ...o,
});

const indexOf = (txs: Transaction[], accountId = "a1") =>
  buildDuplicateIndex(txs.map((t) => ({ transaction: t, accountId })));

describe("findDuplicate", () => {
  it("takes a shared txid in the same account as proof", () => {
    const txid = "a".repeat(64);
    const index = indexOf([
      tx({ id: "existing", type: "transfer_in", txid, amountBtc: "0.4" }),
    ]);
    // Different amount, different minute: the on-chain id still decides.
    const match = findDuplicate(
      candidateOf(
        tx({ id: "new", type: "transfer_in", txid, amountBtc: "0.39", date: "2026-03-02T12:00:00.000Z" }),
        "a1",
      ),
      index,
      2,
    );
    expect(match?.kind).toBe("txid");
    expect(match?.certain).toBe(true);
    expect(match?.existingId).toBe("existing");
  });

  it("does not confuse the same txid in another account or of another type", () => {
    const txid = "b".repeat(64);
    const index = indexOf([tx({ id: "existing", type: "transfer_in", txid })]);
    // The other leg of the same on-chain transaction is a different booking.
    expect(
      findDuplicate(candidateOf(tx({ id: "n", type: "transfer_out", txid }), "a1"), index, 2),
    ).toBeNull();
    expect(
      findDuplicate(candidateOf(tx({ id: "n", type: "transfer_in", txid }), "a2"), index, 2),
    ).toBeNull();
  });

  it("takes identical account, type, timestamp, amount and EUR as proof", () => {
    const index = indexOf([tx({ id: "existing" })]);
    const match = findDuplicate(candidateOf(tx({ id: "new" }), "a1"), index, 2);
    expect(match?.kind).toBe("exact");
    expect(match?.certain).toBe(true);
    expect(match?.minutesApart).toBe(0);
  });

  it("compares amounts and totals by value, not by spelling", () => {
    // One export writes 0.5, the next 0.50000000, and the total as a price.
    const index = indexOf([tx({ id: "existing", amountBtc: "0.50000000" })]);
    const candidate = candidateOf(
      tx({ id: "new", amountBtc: "0.5", totalFiatEur: null, pricePerBtcEur: "50000" }),
      "a1",
    );
    expect(findDuplicate(candidate, index, 2)?.kind).toBe("exact");
  });

  it("flags a timestamp inside the tolerance as probable, not as proof", () => {
    const index = indexOf([tx({ id: "existing" })]);
    const match = findDuplicate(
      candidateOf(tx({ id: "new", date: "2026-03-02T10:01:00.000Z" }), "a1"),
      index,
      2,
    );
    expect(match?.kind).toBe("nearby");
    expect(match?.certain).toBe(false);
    expect(match?.minutesApart).toBe(1);
  });

  it("respects the configured tolerance in both directions", () => {
    const index = indexOf([tx({ id: "existing" })]);
    const tenMinutesLater = candidateOf(
      tx({ id: "new", date: "2026-03-02T10:10:00.000Z" }),
      "a1",
    );
    expect(findDuplicate(tenMinutesLater, index, 2)).toBeNull();
    expect(findDuplicate(tenMinutesLater, index, 15)?.kind).toBe("nearby");
    // Zero switches the tolerance off; exact matches still count.
    expect(findDuplicate(tenMinutesLater, index, 0)).toBeNull();
    expect(findDuplicate(candidateOf(tx({ id: "n" }), "a1"), index, 0)?.kind).toBe("exact");
  });

  it("leaves a different amount alone, however close in time", () => {
    const index = indexOf([tx({ id: "existing" })]);
    expect(
      findDuplicate(
        candidateOf(tx({ id: "new", amountBtc: "0.4", totalFiatEur: "20000" }), "a1"),
        index,
        60,
      ),
    ).toBeNull();
  });
});

describe("scanForDuplicates", () => {
  it("catches the same row twice inside one file, flagging the second", () => {
    const scan = scanForDuplicates(
      [
        { rowId: "r1", transaction: tx({ id: "1" }) },
        { rowId: "r2", transaction: tx({ id: "2" }) },
      ],
      "a1",
      emptyIndex(),
      2,
    );
    // The first occurrence stays importable; only the repeat is marked.
    expect(scan.matches.has("r1")).toBe(false);
    expect(scan.matches.get("r2")?.rowId).toBe("r1");
    expect(scan.certainCount).toBe(1);
  });

  it("does not let a marked row become the reference for the next one", () => {
    // Three copies: the second and third both point back at the first row.
    const scan = scanForDuplicates(
      ["1", "2", "3"].map((n) => ({ rowId: `r${n}`, transaction: tx({ id: n }) })),
      "a1",
      emptyIndex(),
      2,
    );
    expect(scan.matches.get("r2")?.rowId).toBe("r1");
    expect(scan.matches.get("r3")?.rowId).toBe("r1");
    expect(scan.certainCount).toBe(2);
  });

  it("separates certain from probable", () => {
    const scan = scanForDuplicates(
      [
        { rowId: "r1", transaction: tx({ id: "1" }) },
        { rowId: "r2", transaction: tx({ id: "2", date: "2026-03-02T10:01:30.000Z" }) },
      ],
      "a1",
      indexOf([tx({ id: "existing" })]),
      2,
    );
    expect(scan.certainCount).toBe(1);
    expect(scan.probableCount).toBe(1);
    expect(scan.matches.get("r2")?.kind).toBe("nearby");
  });

  it("stays fast on a portfolio of several thousand transactions", () => {
    const existing = Array.from({ length: 5000 }, (_, i) =>
      tx({
        id: `e${i}`,
        date: new Date(Date.UTC(2024, 0, 1) + i * 3_600_000).toISOString(),
        amountBtc: `0.${(i % 900) + 100}`,
      }),
    );
    const index = indexOf(existing);
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      rowId: `r${i}`,
      transaction: existing[i * 5],
    }));

    const started = Date.now();
    const scan = scanForDuplicates(rows, "a1", index, 2);
    // Indexed lookups, not nested loops: 1 000 rows against 5 000 existing
    // transactions is milliseconds, and this fails loudly if that regresses.
    expect(Date.now() - started).toBeLessThan(500);
    expect(scan.certainCount).toBe(1000);
  });
});
