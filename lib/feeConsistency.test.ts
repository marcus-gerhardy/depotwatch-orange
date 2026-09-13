// Guard rail for the fee convention (CLAUDE.md §3.2): for every shape a
// transfer can have in a portfolio file — current, legacy, internal, external
// — the ledger balance and the FIFO engine's open lots must agree, as long as
// the disposals carry the lot assignment the app requires. If they drift apart,
// the dashboard shows a holding that its own wallet breakdown contradicts.
//
// A disposal *without* an assignment is the one deliberate exception: the
// engine never picks lots by itself (§3.2), so those coins stay in the lots and
// the gap is reported instead of being closed against a guess. The last block
// pins exactly that down.

import { describe, expect, it } from "vitest";
import { Decimal, ZERO, dec } from "./decimal";
import { accountBalances, totalBalance } from "./portfolio";
import { computeFifo } from "./fifo";
import { migrateTransferFeeConvention } from "./store";
import {
  applyFeeAllocationRepair,
  feeAllocationGaps,
  planFeeAllocationRepair,
} from "./feeAllocation";
import {
  emptyPortfolio,
  flattenLedger,
  isOutflow,
  type PortfolioFile,
  type Transaction,
} from "./types";

/** One buy of 1 BTC in wallet A, plus the transfer legs under test. */
function portfolio(source: Transaction[], target: Transaction[] = []): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wA",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "aA",
          name: "Spot",
          transactions: [
            {
              id: "b1",
              type: "buy",
              date: "2026-01-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: "50000",
              totalFiatEur: "50000",
              note: "",
            },
            ...source,
          ],
        },
      ],
    },
    {
      id: "wB",
      name: "Hardware wallet",
      type: "hardware",
      accounts: [{ id: "aB", name: "Cold", transactions: target }],
    },
  ];
  return p;
}

const OUT = {
  type: "transfer_out",
  date: "2026-02-01T00:00:00.000Z",
  pricePerBtcEur: null,
  totalFiatEur: null,
  note: "",
} satisfies Partial<Transaction>;

const IN = {
  type: "transfer_in",
  date: "2026-02-01T01:00:00.000Z",
  pricePerBtcEur: null,
  totalFiatEur: null,
  note: "",
} satisfies Partial<Transaction>;

/** Ledger balance and FIFO open lots, which must always be equal. */
function balances(p: PortfolioFile) {
  const entries = flattenLedger(p.wallets);
  return {
    ledger: totalBalance(entries).toString(),
    fifo: computeFifo(entries, 365).openLotsBtc.toString(),
  };
}

function expectConsistent(p: PortfolioFile, expected: string) {
  const { ledger, fifo } = balances(p);
  expect(ledger).toBe(expected);
  expect(fifo).toBe(expected);
}

describe("fee convention: ledger and FIFO agree for every transfer shape", () => {
  it("external send whose allocations cover amount + fee", () => {
    expectConsistent(
      portfolio([
        {
          id: "o",
          ...OUT,
          amountBtc: "0.4",
          feeBtc: "0.0001",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4001" }],
        },
      ]),
      "0.5999",
    );
  });

  it("internal transfer in the current shape", () => {
    expectConsistent(
      portfolio(
        [
          {
            id: "o",
            ...OUT,
            amountBtc: "0.4",
            feeBtc: "0.0001",
            counterpartyAccountId: "aB",
            transferGroupId: "g",
            lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4001" }],
          },
        ],
        [
          {
            id: "i",
            ...IN,
            amountBtc: "0.4",
            counterpartyAccountId: "aA",
            transferGroupId: "g",
          },
        ],
      ),
      "0.9999", // only the network fee leaves the portfolio
    );
  });

  it("internal transfer written by an older version, after the migration", () => {
    const legacy = portfolio(
      [
        {
          id: "o",
          ...OUT,
          amountBtc: "0.4", // included the fee back then
          feeBtc: "0.0001",
          counterpartyAccountId: "aB",
          transferGroupId: "g",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
        },
      ],
      [
        {
          id: "i",
          ...IN,
          amountBtc: "0.3999",
          counterpartyAccountId: "aA",
          transferGroupId: "g",
        },
      ],
    );

    // Before the migration the file contradicts itself — its allocation
    // covers the amount while amount + fee left the account — which is the
    // reason the migration exists.
    const before = balances(legacy);
    expect(before.ledger).toBe("0.9998");
    expect(before.fifo).toBe("0.9999");
    // After it: exactly the fee is gone, not twice the fee, and both agree.
    expectConsistent(migrateTransferFeeConvention(legacy), "0.9999");
  });

  it("does not mistake a missing fee assignment for a legacy file", () => {
    // The same shape as the legacy case above — allocations covering the
    // amount while a fee sits next to it — but the arrival says the amount
    // came through in full, so this file is in the current convention and the
    // assignment is simply short. Shrinking the amount here used to make the
    // arrival bigger than the send: the file gained the fee instead of paying
    // it. It stays as it is, and `feeAllocationGaps` reports it.
    const p = portfolio(
      [
        {
          id: "o",
          ...OUT,
          amountBtc: "0.4",
          feeBtc: "0.0001",
          counterpartyAccountId: "aB",
          transferGroupId: "g",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
        },
      ],
      [{ id: "i", ...IN, amountBtc: "0.4", counterpartyAccountId: "aA", transferGroupId: "g" }],
    );
    const migrated = migrateTransferFeeConvention(p);
    const outLeg = flattenLedger(migrated.wallets).find((e) => e.id === "o")!;
    expect(outLeg.amountBtc).toBe("0.4");

    const gaps = feeAllocationGaps(flattenLedger(migrated.wallets));
    expect(gaps).toHaveLength(1);
    expect(gaps[0].missingBtc.toString()).toBe("0.0001");
    expect(gaps[0].exactlyTheFee).toBe(true);

    // And repairing it is what makes the two agree again.
    const fixed = applyFeeAllocationRepair(
      migrated,
      planFeeAllocationRepair(flattenLedger(migrated.wallets)),
      flattenLedger(migrated.wallets),
    );
    expectConsistent(fixed, "0.9999");
    expectNoGhost(fixed);
  });

  it("internal transfer without a group (legacy leg, lots stay put)", () => {
    // Neither leg moves lots, so the engine keeps the full buy while the
    // ledger has already paid the network fee — the gap is the fee.
    const p = portfolio(
      [{ id: "o", ...OUT, amountBtc: "0.4", feeBtc: "0.0001", counterpartyAccountId: "aB" }],
      [{ id: "i", ...IN, amountBtc: "0.4", counterpartyAccountId: "aA" }],
    );
    const { ledger, fifo } = balances(p);
    expect(ledger).toBe("0.9999");
    expect(fifo).toBe("1");
  });

  it("sell and spend with a BTC fee", () => {
    expectConsistent(
      portfolio([
        {
          id: "s",
          type: "sell",
          date: "2026-02-01T00:00:00.000Z",
          amountBtc: "0.4",
          pricePerBtcEur: "60000",
          totalFiatEur: null,
          feeBtc: "0.0001",
          note: "",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4001" }],
        },
        {
          id: "sp",
          type: "spend",
          date: "2026-03-01T00:00:00.000Z",
          amountBtc: "0.1",
          pricePerBtcEur: "60000",
          totalFiatEur: null,
          feeBtc: "0.00005",
          note: "",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.10005" }],
        },
      ]),
      "0.49985",
    );
  });
});

describe("a disposal without an assignment closes nothing", () => {
  it("leaves the lots untouched and reports the gap", () => {
    // The engine must not decide which buy was sold (§3.2). The ledger says
    // 0.5999 BTC are left, the lots still hold the whole buy, and the
    // difference is exactly what nobody has assigned yet.
    const p = portfolio([{ id: "o", ...OUT, amountBtc: "0.4", feeBtc: "0.0001" }]);
    const entries = flattenLedger(p.wallets);
    const fifo = computeFifo(entries, 365);

    expect(totalBalance(entries).toString()).toBe("0.5999");
    expect(fifo.openLotsBtc.toString()).toBe("1");
    expect(fifo.openLotsBtc.minus(totalBalance(entries)).toString()).toBe("0.4001");
  });

  it("reports a sale it cannot cover as uncovered, with no cost basis", () => {
    const p = portfolio([
      {
        id: "s",
        type: "sell",
        date: "2026-02-01T00:00:00.000Z",
        amountBtc: "0.4",
        pricePerBtcEur: "60000",
        totalFiatEur: null,
        note: "",
      },
    ]);
    const fifo = computeFifo(flattenLedger(p.wallets), 365);
    expect(fifo.disposals[0].uncoveredBtc.toString()).toBe("0.4");
    expect(fifo.disposals[0].costBasisEur.toString()).toBe("0");
    expect(fifo.openLotsBtc.toString()).toBe("1");
  });
});

/**
 * The identity every ledger has to satisfy, whatever it contains.
 *
 * From the fee convention alone (`totalCredit` − `totalDebit` per transaction):
 * what the accounts hold, plus what left them, plus every satoshi burned as a
 * fee, is exactly what ever came in. So a fee that is not accounted for shows
 * up here as a mismatch, wherever it went missing.
 */
function expectFeeInvariant(p: PortfolioFile) {
  const entries = flattenLedger(p.wallets);
  const sum = (fn: (e: (typeof entries)[number]) => Decimal) =>
    entries.reduce((acc, e) => acc.plus(fn(e)), ZERO);

  const inflow = sum((e) => (isOutflow(e.type) ? ZERO : dec(e.amountBtc)));
  const outflow = sum((e) => (isOutflow(e.type) ? dec(e.amountBtc) : ZERO));
  // Every fee the portfolio actually paid: a transfer_in's fee belongs to its
  // out-leg and a gift arriving is charged nothing.
  const fees = sum((e) =>
    e.type === "transfer_in" || e.type === "gift_in" ? ZERO : dec(e.feeBtc),
  );
  const held = totalBalance(entries);

  expect(held.plus(outflow).plus(fees).toString()).toBe(inflow.toString());
  // And the accounts have to add up to the same total as the ledger does.
  expect(
    accountBalances(entries).reduce((s, b) => s.plus(b.btc), ZERO).toString(),
  ).toBe(held.toString());
}

/**
 * The whole point of the convention, in one assertion: with every disposal
 * assigned, the FIFO engine must hold exactly what the ledger says — per
 * account, not only in total. A fee left out of an assignment shows up here as
 * a ghost lot in the account the coins left.
 */
function expectNoGhost(p: PortfolioFile) {
  const entries = flattenLedger(p.wallets);
  const fifo = computeFifo(entries, 365);
  for (const b of accountBalances(entries)) {
    const lots = fifo.openLots
      .filter((l) => l.accountId === b.accountId)
      .reduce((s, l) => s.plus(l.remainingBtc), ZERO);
    expect(`${b.accountId}=${lots.toString()}`).toBe(`${b.accountId}=${b.btc.toString()}`);
  }
}

describe("the fee identity holds, and no account keeps a ghost", () => {
  /** A transfer of part of one lot, with a fee. */
  const partial = () =>
    portfolio(
      [
        {
          id: "o",
          ...OUT,
          amountBtc: "0.25",
          feeBtc: "0.00002",
          counterpartyAccountId: "aB",
          transferGroupId: "g",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.25002" }],
        },
      ],
      [{ id: "i", ...IN, amountBtc: "0.25", counterpartyAccountId: "aA", transferGroupId: "g" }],
    );

  it("a partial transfer with a fee", () => {
    expectFeeInvariant(partial());
    expectNoGhost(partial());
  });

  it("several lots bundled into one transfer, plus the fee", () => {
    const p = portfolio(
      [
        {
          id: "b2",
          type: "buy",
          date: "2026-01-15T00:00:00.000Z",
          amountBtc: "0.5",
          pricePerBtcEur: "52000",
          totalFiatEur: null,
          note: "",
        },
        {
          id: "o",
          ...OUT,
          amountBtc: "1.4999",
          feeBtc: "0.0001",
          counterpartyAccountId: "aB",
          transferGroupId: "g",
          // The fee comes off the last allocation, so the two lots add up to
          // amount + fee between them.
          lotAllocations: [
            { lotTransactionId: "b1", amountBtc: "1" },
            { lotTransactionId: "b2", amountBtc: "0.5" },
          ],
        },
      ],
      [{ id: "i", ...IN, amountBtc: "1.4999", counterpartyAccountId: "aA", transferGroupId: "g" }],
    );
    expectFeeInvariant(p);
    expectNoGhost(p);
    expect(balances(p).ledger).toBe("1.4999");
  });

  it("a sale with a BTC fee", () => {
    const p = portfolio([
      {
        id: "s",
        type: "sell",
        date: "2026-05-01T00:00:00.000Z",
        amountBtc: "0.25",
        pricePerBtcEur: "60000",
        totalFiatEur: null,
        feeBtc: "0.0002",
        note: "",
        lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.2502" }],
      },
    ]);
    expectFeeInvariant(p);
    expectNoGhost(p);
    expect(balances(p).ledger).toBe("0.7498");
  });

  it("a buy whose fee is charged in BTC", () => {
    // The fee comes off what the buy credits, so the account never had it.
    const p = portfolio([]);
    p.wallets[0].accounts[0].transactions[0] = {
      ...p.wallets[0].accounts[0].transactions[0],
      feeBtc: "0.002",
    };
    expectFeeInvariant(p);
    expectNoGhost(p);
    expect(balances(p).ledger).toBe("0.998");
  });
});

describe("a fee at every hop of a chain", () => {
  /** A → B → C, each hop paying its own network fee. */
  function chain(): PortfolioFile {
    const p = portfolio(
      [
        {
          id: "o1",
          ...OUT,
          amountBtc: "0.9999",
          feeBtc: "0.0001",
          counterpartyAccountId: "aB",
          transferGroupId: "g1",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "1" }],
        },
      ],
      [
        {
          id: "i1",
          ...IN,
          amountBtc: "0.9999",
          counterpartyAccountId: "aA",
          transferGroupId: "g1",
        },
        {
          id: "o2",
          ...OUT,
          date: "2026-03-01T00:00:00.000Z",
          amountBtc: "0.9997",
          feeBtc: "0.0002",
          counterpartyAccountId: "aC",
          transferGroupId: "g2",
          lotAllocations: [{ lotTransactionId: "i1", amountBtc: "0.9999" }],
        },
      ],
    );
    p.wallets.push({
      id: "wC",
      name: "Paper",
      type: "paper",
      accounts: [
        {
          id: "aC",
          name: "Vault",
          transactions: [
            {
              id: "i2",
              ...IN,
              date: "2026-03-01T02:00:00.000Z",
              amountBtc: "0.9997",
              counterpartyAccountId: "aB",
              transferGroupId: "g2",
            },
          ],
        },
      ],
    });
    return p;
  }

  it("burns exactly the two fees and leaves nothing behind on the way", () => {
    const p = chain();
    expectFeeInvariant(p);
    expectNoGhost(p);
    expectConsistent(p, "0.9997");

    // And the coins keep their original acquisition across both hops.
    const fifo = computeFifo(flattenLedger(p.wallets), 365);
    expect(fifo.openLots).toHaveLength(1);
    expect(fifo.openLots[0].accountId).toBe("aC");
    expect(fifo.openLots[0].acquiredDate).toBe("2026-01-01T00:00:00.000Z");
  });
});
