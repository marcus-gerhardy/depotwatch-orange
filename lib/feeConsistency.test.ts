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
import { totalBalance } from "./portfolio";
import { computeFifo } from "./fifo";
import { migrateTransferFeeConvention } from "./store";
import { emptyPortfolio, flattenLedger, type PortfolioFile, type Transaction } from "./types";

/** One buy of 1 BTC in wallet A, plus the transfer legs under test. */
function portfolio(source: Transaction[], target: Transaction[] = []): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wA",
      name: "Kraken",
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
      name: "BitBox02",
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
