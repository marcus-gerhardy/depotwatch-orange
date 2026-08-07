import { describe, it, expect } from "vitest";
import {
  allocationSumBtc,
  allocationTargetBtc,
  amountDifference,
  linkTransferLegs,
  lotAvailability,
  rankOutLegCandidates,
  setLotAllocations,
  unlinkTransferLeg,
} from "./transferLink";
import { computeFifo } from "./fifo";
import { indexLedger, resolveProvenance } from "./provenance";
import { emptyPortfolio, flattenLedger } from "./types";
import type { PortfolioFile, Transaction } from "./types";

const tx = (t: Partial<Transaction> & Pick<Transaction, "id" | "type">): Transaction => ({
  date: "2024-01-01T00:00:00.000Z",
  amountBtc: "1",
  pricePerBtcEur: null,
  note: "",
  ...t,
});

/** Wallet A (exchange, two buys + an out-leg) and wallet B (hardware). */
function portfolio(
  aTransactions: Transaction[],
  bTransactions: Transaction[] = [],
): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wA",
      name: "Kraken",
      type: "exchange",
      accounts: [{ id: "aA", name: "Spot", transactions: aTransactions }],
    },
    {
      id: "wB",
      name: "BitBox02",
      type: "hardware",
      accounts: [{ id: "aB", name: "Cold", transactions: bTransactions }],
    },
  ];
  return p;
}

const entriesOf = (p: PortfolioFile) => flattenLedger(p.wallets);
const find = (p: PortfolioFile, id: string) =>
  entriesOf(p).find((e) => e.id === id)!;

describe("allocationTargetBtc", () => {
  it("is the amount plus the BTC fee charged on top of it", () => {
    // §3.2: an out-leg debits amount + fee, and that is what its allocations
    // close. Targeting amountBtc alone leaves every fee permanently unassigned.
    expect(allocationTargetBtc({ amountBtc: "0.4999", feeBtc: "0.0001" }).toString()).toBe(
      "0.5",
    );
    expect(allocationTargetBtc({ amountBtc: "0.5" }).toString()).toBe("0.5");
  });
});

describe("lotAvailability", () => {
  const base = [
    tx({ id: "b1", type: "buy", amountBtc: "0.5", pricePerBtcEur: "20000" }),
    tx({
      id: "b2",
      type: "buy",
      date: "2024-03-01T00:00:00.000Z",
      amountBtc: "1",
      feeBtc: "0.01",
      pricePerBtcEur: "30000",
    }),
  ];

  it("credits a buy net of its BTC fee and sorts by date", () => {
    const lots = lotAvailability(entriesOf(portfolio(base)), { accountId: "aA" });
    expect(lots.map((l) => l.entry.id)).toEqual(["b1", "b2"]);
    expect(lots[1].creditedBtc.toString()).toBe("0.99");
    expect(lots[1].availableBtc.toString()).toBe("0.99");
  });

  it("subtracts what other transactions already claim", () => {
    const p = portfolio([
      ...base,
      tx({
        id: "s1",
        type: "sell",
        date: "2024-04-01T00:00:00.000Z",
        amountBtc: "0.2",
        pricePerBtcEur: "40000",
        lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.2" }],
      }),
    ]);
    const lots = lotAvailability(entriesOf(p), { accountId: "aA" });
    expect(lots.find((l) => l.entry.id === "b1")!.availableBtc.toString()).toBe("0.3");
  });

  it("does not count the edited transaction's own claim against itself", () => {
    const p = portfolio([
      ...base,
      tx({
        id: "o1",
        type: "transfer_out",
        date: "2024-04-01T00:00:00.000Z",
        amountBtc: "0.5",
        lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.5" }],
      }),
    ]);
    const withOwn = lotAvailability(entriesOf(p), { accountId: "aA" });
    expect(withOwn.find((l) => l.entry.id === "b1")!.availableBtc.toString()).toBe("0");

    const editing = lotAvailability(entriesOf(p), {
      accountId: "aA",
      excludeTxId: "o1",
    });
    expect(editing.find((l) => l.entry.id === "b1")!.availableBtc.toString()).toBe("0.5");
  });

  it("never reports a negative availability", () => {
    const p = portfolio([
      tx({ id: "b1", type: "buy", amountBtc: "0.5", pricePerBtcEur: "20000" }),
      tx({
        id: "s1",
        type: "sell",
        amountBtc: "0.9",
        pricePerBtcEur: "40000",
        lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.9" }],
      }),
    ]);
    const lots = lotAvailability(entriesOf(p), { accountId: "aA" });
    expect(lots[0].availableBtc.toString()).toBe("0");
  });
});

describe("rankOutLegCandidates", () => {
  const arrival = tx({
    id: "in1",
    type: "transfer_in",
    date: "2024-05-02T00:00:00.000Z",
    amountBtc: "0.4999",
    txid: "a".repeat(64),
  });

  const candidates = [
    tx({
      id: "far",
      type: "transfer_out",
      date: "2024-01-01T00:00:00.000Z",
      amountBtc: "0.9",
    }),
    tx({
      id: "close",
      type: "transfer_out",
      date: "2024-05-01T00:00:00.000Z",
      amountBtc: "0.5",
    }),
    tx({
      id: "sameTxid",
      type: "transfer_out",
      date: "2023-11-01T00:00:00.000Z",
      amountBtc: "3",
      txid: "a".repeat(64),
    }),
  ];

  it("puts an exact txid match first, however far off amount and date are", () => {
    const p = portfolio(candidates, [arrival]);
    const ranked = rankOutLegCandidates(find(p, "in1"), entriesOf(p));
    expect(ranked[0].entry.id).toBe("sameTxid");
    expect(ranked[0].txidMatch).toBe(true);
    expect(ranked[1].entry.id).toBe("close");
  });

  it("reports the amount difference and the day distance per candidate", () => {
    const p = portfolio(candidates, [arrival]);
    const close = rankOutLegCandidates(find(p, "in1"), entriesOf(p)).find(
      (c) => c.entry.id === "close",
    )!;
    expect(close.amountDiffBtc.toString()).toBe("0.0001");
    expect(close.dayDiff).toBe(1);
  });

  it("offers only unpaired out-legs from other accounts", () => {
    const p = portfolio(
      [
        ...candidates,
        tx({
          id: "taken",
          type: "transfer_out",
          amountBtc: "0.4999",
          transferGroupId: "g",
        }),
      ],
      [
        arrival,
        tx({ id: "arrived", type: "transfer_in", transferGroupId: "g" }),
        // Same account as the arrival: never the other side of it.
        tx({ id: "ownAccount", type: "transfer_out", amountBtc: "0.4999" }),
      ],
    );
    const ids = rankOutLegCandidates(find(p, "in1"), entriesOf(p)).map((c) => c.entry.id);
    expect(ids).not.toContain("taken");
    expect(ids).not.toContain("ownAccount");
    expect(ids).toHaveLength(3);
  });

  it("still offers a leg whose group id pairs it with nothing", () => {
    // A group id is not a link: an interrupted assignment or an import can
    // leave one behind, and hiding such a leg makes it unrepairable from both
    // sides — it is invisible on the arrival *and* not editable on the send.
    const p = portfolio(
      [tx({ id: "stale", type: "transfer_out", amountBtc: "0.4999", transferGroupId: "g" })],
      [arrival],
    );
    const candidate = rankOutLegCandidates(find(p, "in1"), entriesOf(p));
    expect(candidate.map((c) => c.entry.id)).toEqual(["stale"]);
    expect(candidate[0].linkedInLegs).toEqual([]);
  });

  it("offers paired out-legs only on request, and names their arrivals", () => {
    const p = portfolio(
      [tx({ id: "taken", type: "transfer_out", amountBtc: "0.4999", transferGroupId: "g" })],
      [arrival, tx({ id: "arrived", type: "transfer_in", transferGroupId: "g" })],
    );
    const entries = entriesOf(p);
    const inLeg = find(p, "in1");
    expect(rankOutLegCandidates(inLeg, entries)).toHaveLength(0);
    const withPaired = rankOutLegCandidates(inLeg, entries, { includePaired: true });
    expect(withPaired.map((c) => c.entry.id)).toEqual(["taken"]);
    expect(withPaired[0].linkedInLegs.map((l) => l.id)).toEqual(["arrived"]);
  });

  it("filters by wallet, account and period", () => {
    const p = portfolio(candidates, [arrival]);
    const entries = entriesOf(p);
    const inLeg = find(p, "in1");
    expect(rankOutLegCandidates(inLeg, entries, { walletId: "wB" })).toHaveLength(0);
    expect(
      rankOutLegCandidates(inLeg, entries, { from: "2024-04-01" }).map((c) => c.entry.id),
    ).toEqual(["close"]);
    // Both older candidates survive the cutoff; the txid match still leads.
    expect(
      rankOutLegCandidates(inLeg, entries, { to: "2024-01-31" }).map((c) => c.entry.id),
    ).toEqual(["sameTxid", "far"]);
  });
});

describe("amountDifference", () => {
  it("treats a small positive difference as a plausible network fee", () => {
    const d = amountDifference({ amountBtc: "0.5" }, { amountBtc: "0.4999" });
    expect(d.diffBtc.toString()).toBe("0.0001");
    expect(d.plausibleFee).toBe(true);
    expect(d.implausible).toBe(false);
  });

  it("flags a difference above one percent as an unlikely match", () => {
    const d = amountDifference({ amountBtc: "1" }, { amountBtc: "0.9" });
    expect(d.plausibleFee).toBe(false);
    expect(d.implausible).toBe(true);
  });

  it("flags more arriving than leaving, which is never a fee", () => {
    const d = amountDifference({ amountBtc: "0.5" }, { amountBtc: "0.6" });
    expect(d.diffBtc.toString()).toBe("-0.1");
    expect(d.plausibleFee).toBe(false);
    expect(d.implausible).toBe(true);
  });
});

describe("linkTransferLegs", () => {
  const linkable = () =>
    portfolio(
      [
        tx({ id: "b1", type: "buy", amountBtc: "0.5", pricePerBtcEur: "20000" }),
        tx({
          id: "o1",
          type: "transfer_out",
          date: "2024-05-01T00:00:00.000Z",
          amountBtc: "0.5",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.5" }],
        }),
      ],
      [
        tx({
          id: "in1",
          type: "transfer_in",
          date: "2024-05-01T01:00:00.000Z",
          amountBtc: "0.4999",
        }),
      ],
    );

  it("gives both legs one group and points them at each other", () => {
    const p = linkTransferLegs(linkable(), "in1", "o1");
    const inLeg = find(p, "in1");
    const outLeg = find(p, "o1");
    expect(inLeg.transferGroupId).toBeTruthy();
    expect(outLeg.transferGroupId).toBe(inLeg.transferGroupId);
    expect(inLeg.counterpartyAccountId).toBe("aA");
    expect(outLeg.counterpartyAccountId).toBe("aB");
  });

  it("makes the origin resolvable, with the original acquisition date", () => {
    const p = linkTransferLegs(linkable(), "in1", "o1");
    const entries = entriesOf(p);
    const prov = resolveProvenance(find(p, "in1"), indexLedger(entries));
    expect(prov.status).toBe("resolved");
    expect(prov.origins[0].lotTxId).toBe("b1");
    expect(prov.origins[0].acquiredDate).toBe("2024-01-01T00:00:00.000Z");
  });

  it("adopting the fee moves the difference out of the amount, not on top of it", () => {
    const p = linkTransferLegs(linkable(), "in1", "o1", { adoptFeeBtc: true });
    const outLeg = find(p, "o1");
    expect(outLeg.amountBtc).toBe("0.4999");
    expect(outLeg.feeBtc).toBe("0.0001");
    // The lots this transfer closes are unchanged, so the allocations still fit.
    expect(allocationTargetBtc(outLeg).toString()).toBe("0.5");
    expect(allocationSumBtc(outLeg.lotAllocations).toString()).toBe("0.5");
    // And the transfer costs the portfolio exactly the network fee.
    const fifo = computeFifo(entriesOf(p), 365);
    expect(fifo.openLotsBtc.toString()).toBe("0.4999");
  });

  it("leaves the amounts alone when the fee is not adopted", () => {
    const p = linkTransferLegs(linkable(), "in1", "o1");
    expect(find(p, "o1").amountBtc).toBe("0.5");
    expect(find(p, "o1").feeBtc).toBeUndefined();
  });

  it("joins an existing pairing instead of tearing it apart", () => {
    // One send can arrive in several pieces (§3.2). Minting a fresh group id
    // here would orphan the arrival that is already linked.
    const base = linkTransferLegs(linkable(), "in1", "o1");
    const group = find(base, "o1").transferGroupId;
    const withSecond = {
      ...base,
      wallets: base.wallets.map((w) =>
        w.id === "wB"
          ? {
              ...w,
              accounts: w.accounts.map((a) => ({
                ...a,
                transactions: [
                  ...a.transactions,
                  tx({ id: "in2", type: "transfer_in", amountBtc: "0.1" }),
                ],
              })),
            }
          : w,
      ),
    };

    const p = linkTransferLegs(withSecond, "in2", "o1", { adoptFeeBtc: true });
    expect(find(p, "in2").transferGroupId).toBe(group);
    expect(find(p, "in1").transferGroupId).toBe(group);
    // The amount belongs to the whole transfer, not to this one arrival, so
    // the difference to it is never adopted as a fee.
    expect(find(p, "o1").amountBtc).toBe("0.5");
    expect(find(p, "o1").feeBtc).toBeUndefined();
  });

  it("gives a leg with a counterpart-less group id a fresh one", () => {
    const p = portfolio(
      [tx({ id: "o1", type: "transfer_out", amountBtc: "0.5", transferGroupId: "stale" })],
      [tx({ id: "in1", type: "transfer_in", amountBtc: "0.5" })],
    );
    const linked = linkTransferLegs(p, "in1", "o1");
    const group = find(linked, "o1").transferGroupId;
    expect(group).toBeTruthy();
    expect(group).not.toBe("stale");
    expect(find(linked, "in1").transferGroupId).toBe(group);
    expect(find(linked, "o1").counterpartyAccountId).toBe("aB");
  });

  it("never turns a negative difference into a fee", () => {
    const p = portfolio(
      [tx({ id: "o1", type: "transfer_out", amountBtc: "0.4" })],
      [tx({ id: "in1", type: "transfer_in", amountBtc: "0.5" })],
    );
    const linked = linkTransferLegs(p, "in1", "o1", { adoptFeeBtc: true });
    expect(find(linked, "o1").amountBtc).toBe("0.4");
    expect(find(linked, "o1").feeBtc).toBeUndefined();
  });
});

describe("unlinkTransferLeg", () => {
  const linked = () =>
    portfolio(
      [
        tx({
          id: "o1",
          type: "transfer_out",
          amountBtc: "0.5",
          transferGroupId: "g1",
          counterpartyAccountId: "aB",
        }),
      ],
      [
        tx({
          id: "in1",
          type: "transfer_in",
          amountBtc: "0.5",
          transferGroupId: "g1",
          counterpartyAccountId: "aA",
        }),
      ],
    );

  it("clears the group on both legs, leaving no orphan reference", () => {
    const p = unlinkTransferLeg(linked(), "in1");
    for (const id of ["in1", "o1"]) {
      expect(find(p, id).transferGroupId).toBeUndefined();
      expect(find(p, id).counterpartyAccountId).toBeUndefined();
    }
  });

  it("works from either side", () => {
    const p = unlinkTransferLeg(linked(), "o1");
    expect(find(p, "in1").transferGroupId).toBeUndefined();
  });

  it("keeps a group that still pairs an out-leg with an in-leg", () => {
    const p = portfolio(
      [
        tx({
          id: "o1",
          type: "transfer_out",
          amountBtc: "1",
          transferGroupId: "g1",
          counterpartyAccountId: "aB",
        }),
      ],
      [
        tx({
          id: "in1",
          type: "transfer_in",
          amountBtc: "0.5",
          transferGroupId: "g1",
          counterpartyAccountId: "aA",
        }),
        tx({
          id: "in2",
          type: "transfer_in",
          amountBtc: "0.5",
          transferGroupId: "g1",
          counterpartyAccountId: "aA",
        }),
      ],
    );
    const after = unlinkTransferLeg(p, "in1");
    expect(find(after, "in1").transferGroupId).toBeUndefined();
    expect(find(after, "in2").transferGroupId).toBe("g1");
    expect(find(after, "o1").transferGroupId).toBe("g1");
  });

  it("does nothing for a leg that has no group", () => {
    const p = portfolio([tx({ id: "o1", type: "transfer_out", amountBtc: "1" })]);
    expect(unlinkTransferLeg(p, "o1")).toEqual(p);
  });
});

describe("setLotAllocations", () => {
  const base = () =>
    portfolio([
      tx({ id: "b1", type: "buy", amountBtc: "1", pricePerBtcEur: "20000" }),
      tx({ id: "o1", type: "transfer_out", amountBtc: "0.5" }),
    ]);

  it("writes the allocations and drops an empty list entirely", () => {
    const p = setLotAllocations(base(), "o1", [
      { lotTransactionId: "b1", amountBtc: "0.5" },
    ]);
    expect(find(p, "o1").lotAllocations).toEqual([
      { lotTransactionId: "b1", amountBtc: "0.5" },
    ]);
    expect(find(setLotAllocations(p, "o1", []), "o1").lotAllocations).toBeUndefined();
  });

  it("changes which lot a later disposal is valued against", () => {
    const p = portfolio([
      tx({ id: "b1", type: "buy", amountBtc: "1", pricePerBtcEur: "20000" }),
      tx({
        id: "b2",
        type: "buy",
        date: "2024-02-01T00:00:00.000Z",
        amountBtc: "1",
        pricePerBtcEur: "60000",
      }),
      tx({
        id: "o1",
        type: "transfer_out",
        date: "2024-03-01T00:00:00.000Z",
        amountBtc: "1",
        transferGroupId: "g1",
        counterpartyAccountId: "aB",
        lotAllocations: [{ lotTransactionId: "b1", amountBtc: "1" }],
      }),
    ], [
      tx({
        id: "in1",
        type: "transfer_in",
        date: "2024-03-01T01:00:00.000Z",
        amountBtc: "1",
        transferGroupId: "g1",
        counterpartyAccountId: "aA",
      }),
    ]);

    const before = resolveProvenance(find(p, "in1"), indexLedger(entriesOf(p)));
    expect(before.origins[0].lotTxId).toBe("b1");

    const after = setLotAllocations(p, "o1", [
      { lotTransactionId: "b2", amountBtc: "1" },
    ]);
    const prov = resolveProvenance(find(after, "in1"), indexLedger(entriesOf(after)));
    expect(prov.origins[0].lotTxId).toBe("b2");
    expect(prov.origins[0].acquiredDate).toBe("2024-02-01T00:00:00.000Z");
    expect(prov.origins[0].pricePerBtcEur!.toString()).toBe("60000");
  });
});
