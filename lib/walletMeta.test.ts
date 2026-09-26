import { describe, expect, it } from "vitest";
import { dec } from "./decimal";
import type { LedgerEntry, TransactionType, Wallet } from "./types";
import {
  backupStatus,
  balanceSparkline,
  custodyOf,
  moveWithinGroup,
  orderWallets,
  walletColorOf,
  walletIconOf,
  walletIssueCounts,
  walletShares,
} from "./walletMeta";

const wallet = (id: string, extra: Partial<Wallet> = {}): Wallet => ({
  id,
  name: id,
  type: "hardware",
  accounts: [],
  ...extra,
});

let seq = 0;
function entry(
  type: TransactionType,
  amountBtc: string,
  extra: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    id: `tx-${++seq}`,
    type,
    date: "2024-01-01T00:00:00Z",
    amountBtc,
    pricePerBtcEur: "40000",
    note: "",
    walletId: "wA",
    walletName: "Exchange",
    accountId: "aA",
    accountName: "Spot",
    ...extra,
  };
}

describe("custody", () => {
  it("puts exchanges apart from everything the owner holds the keys to", () => {
    expect(custodyOf("exchange")).toBe("custodial");
    expect(custodyOf("hardware")).toBe("self");
    expect(custodyOf("software")).toBe("self");
    expect(custodyOf("paper")).toBe("self");
  });
});

describe("look", () => {
  it("falls back to the type's icon and a colour by position", () => {
    expect(walletIconOf({ type: "paper" })).toBe("paper");
    expect(walletIconOf({ type: "paper", icon: "vault" })).toBe("vault");
    expect(walletColorOf({}, 1)).toBe("chart-2");
    expect(walletColorOf({ color: "muted" }, 1)).toBe("muted");
  });
});

describe("ordering", () => {
  it("follows the given ids and never loses a wallet", () => {
    const ws = [wallet("a"), wallet("b"), wallet("c")];
    expect(orderWallets(ws, ["c", "a"]).map((w) => w.id)).toEqual(["c", "a", "b"]);
    expect(orderWallets(ws, ["x", "b", "b"]).map((w) => w.id)).toEqual(["b", "a", "c"]);
  });

  it("moves inside a group without touching the wallets outside it", () => {
    // a, c are self-custody; b, d exchanges.
    const all = ["a", "b", "c", "d"];
    expect(moveWithinGroup(all, ["a", "c"], 1, 0)).toEqual(["c", "b", "a", "d"]);
    expect(moveWithinGroup(all, ["b", "d"], 0, 1)).toEqual(["a", "d", "c", "b"]);
  });

  it("ignores a move out of range", () => {
    const all = ["a", "b"];
    expect(moveWithinGroup(all, ["a", "b"], 0, 2)).toBe(all);
    expect(moveWithinGroup(all, ["a", "b"], -1, 0)).toBe(all);
  });
});

describe("shares", () => {
  it("splits the positive total, archived wallets included", () => {
    const shares = walletShares([
      { walletId: "a", btc: dec("0.75") },
      { walletId: "b", btc: dec("0.25") },
      { walletId: "c", btc: dec("-0.1") },
    ]);
    expect(shares.map((s) => s.share)).toEqual([0.75, 0.25, 0]);
  });

  it("is zero everywhere with nothing held", () => {
    expect(walletShares([{ walletId: "a", btc: dec(0) }])[0].share).toBe(0);
  });
});

describe("backup check", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("does not apply to an exchange", () => {
    expect(backupStatus({ type: "exchange" }, now).kind).toBe("notApplicable");
  });

  it("says when it was never recorded", () => {
    expect(backupStatus({ type: "hardware" }, now).kind).toBe("never");
  });

  it("is never due without a reminder", () => {
    const s = backupStatus({ type: "hardware", backupCheckedAt: "2020-01-01" }, now);
    expect(s).toEqual({ kind: "ok", checkedAt: "2020-01-01", dueAt: null });
  });

  it("is due a year after the check, with the reminder on", () => {
    expect(
      backupStatus(
        { type: "paper", backupCheckedAt: "2025-06-01", backupReminder: true },
        now,
      ).kind,
    ).toBe("due");
    expect(
      backupStatus(
        { type: "paper", backupCheckedAt: "2025-06-02", backupReminder: true },
        now,
      ),
    ).toEqual({ kind: "ok", checkedAt: "2025-06-02", dueAt: "2026-06-02" });
  });
});

describe("issue counts per wallet", () => {
  it("judges a transfer link across wallets, not inside one", () => {
    const out = entry("transfer_out", "0.1", {
      transferGroupId: "g1",
      txid: "a".repeat(64),
      pricePerBtcEur: null,
    });
    const arrival = entry("transfer_in", "0.1", {
      transferGroupId: "g1",
      pricePerBtcEur: null,
      walletId: "wB",
      accountId: "aB",
    });
    const counts = walletIssueCounts([out, arrival]);
    expect(counts.get("wA")!.unlinkedTransfer).toBe(0);
    expect(counts.get("wB")!.unlinkedTransfer).toBe(0);
    // One transaction, one id: the arrival inherits the send's txid.
    expect(counts.get("wB")!.missingTxid).toBe(0);
  });

  it("counts unlinked legs, missing txids and missing EUR values", () => {
    const counts = walletIssueCounts([
      entry("transfer_in", "0.1", { pricePerBtcEur: null }),
      entry("buy", "0.2", { pricePerBtcEur: null, totalFiatEur: null }),
    ]);
    expect(counts.get("wA")).toEqual({
      unlinkedTransfer: 1,
      missingEurValue: 1,
      missingTxid: 1,
    });
  });
});

describe("sparkline", () => {
  it("is empty without history and bounded in length with a long one", () => {
    expect(balanceSparkline([])).toEqual([]);
    const points = balanceSparkline(
      [entry("buy", "0.5", { date: "2020-01-01T00:00:00Z" })],
      10,
    );
    expect(points).toHaveLength(10);
    expect(points[points.length - 1]).toBe(0.5);
  });
});
