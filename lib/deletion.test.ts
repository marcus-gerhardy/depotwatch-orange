import { describe, expect, it } from "vitest";
import { deleteAndRelease, deletionImpact } from "./deletion";
import { totalBalance } from "./portfolio";
import { computeFifo } from "./fifo";
import { flattenLedger, type Transaction, type Wallet } from "./types";

const buy = (id: string, amountBtc: string, price = "50000"): Transaction => ({
  id,
  type: "buy",
  date: "2026-01-01T00:00:00.000Z",
  amountBtc,
  pricePerBtcEur: price,
  totalFiatEur: null,
  note: "",
});

function wallets(source: Transaction[], target: Transaction[] = []): Wallet[] {
  return [
    {
      id: "wA",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "aA", name: "Spot", transactions: source }],
    },
    {
      id: "wB",
      name: "Hardware wallet",
      type: "hardware",
      accounts: [{ id: "aB", name: "Cold", transactions: target }],
    },
  ];
}

const find = (ws: Wallet[], id: string) =>
  ws.flatMap((w) => w.accounts.flatMap((a) => a.transactions)).find((t) => t.id === id);

const OUT = {
  type: "transfer_out" as const,
  date: "2026-02-01T00:00:00.000Z",
  pricePerBtcEur: null,
  totalFiatEur: null,
  note: "",
};
const IN = {
  type: "transfer_in" as const,
  date: "2026-02-01T01:00:00.000Z",
  pricePerBtcEur: null,
  totalFiatEur: null,
  note: "",
};

describe("deleting a lot that a disposal points at", () => {
  const ws = wallets([
    buy("b1", "1"),
    buy("b2", "0.5"),
    {
      id: "s1",
      type: "sell",
      date: "2026-03-01T00:00:00.000Z",
      amountBtc: "0.4",
      pricePerBtcEur: "60000",
      totalFiatEur: null,
      note: "",
      lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
    },
  ]);

  it("reports the affected disposal before deleting", () => {
    const impact = deletionImpact(ws, ["b1"]);
    expect(impact.clearedAllocations.map((t) => t.id)).toEqual(["s1"]);
    expect(impact.releasedLegs).toEqual([]);
  });

  it("drops the stale allocation, leaving the sell to be assigned again", () => {
    const after = deleteAndRelease(ws, ["b1"]);
    const sell = find(after, "s1")!;
    expect(find(after, "b1")).toBeUndefined();
    // A reference to a transaction that no longer exists is worse than none:
    // it would keep reporting an amount no lot can ever cover.
    expect(sell.lotAllocations).toBeUndefined();

    // The app does not put a replacement lot in its place — which buy the sale
    // came from is the user's call (§3.2), so it is reported as unassigned
    // until they make it.
    const entries = flattenLedger(after);
    const fifo = computeFifo(entries, 365);
    expect(fifo.disposals[0].uncoveredBtc.toString()).toBe("0.4");
    expect(fifo.openLotsBtc.minus(totalBalance(entries)).toString()).toBe("0.4");
  });

  it("keeps allocations that point at surviving lots", () => {
    const after = deleteAndRelease(ws, ["b2"]);
    expect(find(after, "s1")!.lotAllocations).toEqual([
      { lotTransactionId: "b1", amountBtc: "0.4" },
    ]);
  });
});

describe("deleting one leg of an internal transfer", () => {
  const linked = () =>
    wallets(
      [
        buy("b1", "1"),
        {
          id: "out1",
          ...OUT,
          amountBtc: "0.4",
          feeBtc: "0.0001",
          counterpartyAccountId: "aB",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4001" }],
        },
      ],
      [
        {
          id: "in1",
          ...IN,
          amountBtc: "0.4",
          counterpartyAccountId: "aA",
          transferGroupId: "g1",
        },
      ],
    );

  it("announces the leg that loses its counterpart", () => {
    const impact = deletionImpact(linked(), ["out1"]);
    expect(impact.releasedLegs.map((t) => t.id)).toEqual(["in1"]);
  });

  it("releases the in-leg into an external receive when the out-leg goes", () => {
    const after = deleteAndRelease(linked(), ["out1"]);
    const inLeg = find(after, "in1")!;
    expect(inLeg.transferGroupId).toBeUndefined();
    expect(inLeg.counterpartyAccountId).toBeUndefined();

    // Without the release the received coins would have no lot at all.
    const entries = flattenLedger(after);
    const fifo = computeFifo(entries, 365);
    expect(totalBalance(entries).toString()).toBe("1.4");
    expect(fifo.openLotsBtc.toString()).toBe("1.4");
  });

  it("releases the out-leg into an external send when the in-leg goes", () => {
    const after = deleteAndRelease(linked(), ["in1"]);
    const out = find(after, "out1")!;
    expect(out.transferGroupId).toBeUndefined();
    expect(out.counterpartyAccountId).toBeUndefined();

    const entries = flattenLedger(after);
    // 1 − (0.4 + 0.0001): the coins left the portfolio for good.
    expect(totalBalance(entries).toString()).toBe("0.5999");
    expect(computeFifo(entries, 365).openLotsBtc.toString()).toBe("0.5999");
  });

  it("keeps a group intact while both directions still exist", () => {
    // Two in-legs for one out-leg: deleting one leaves the pairing valid.
    const ws = wallets(
      [
        buy("b1", "1"),
        {
          id: "out1",
          ...OUT,
          amountBtc: "0.4",
          counterpartyAccountId: "aB",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
        },
      ],
      [
        { id: "in1", ...IN, amountBtc: "0.25", counterpartyAccountId: "aA", transferGroupId: "g1" },
        { id: "in2", ...IN, amountBtc: "0.15", counterpartyAccountId: "aA", transferGroupId: "g1" },
      ],
    );

    expect(deletionImpact(ws, ["in2"]).releasedLegs).toEqual([]);
    const after = deleteAndRelease(ws, ["in2"]);
    expect(find(after, "out1")!.transferGroupId).toBe("g1");
    expect(find(after, "in1")!.transferGroupId).toBe("g1");
  });

  it("deleting both legs at once releases nothing", () => {
    const impact = deletionImpact(linked(), ["out1", "in1"]);
    expect(impact.releasedLegs).toEqual([]);
    const after = deleteAndRelease(linked(), ["out1", "in1"]);
    expect(flattenLedger(after).map((t) => t.id)).toEqual(["b1"]);
  });
});
