// Guard rail for the fee convention (CLAUDE.md §3.2): for every shape a
// transfer can have in a portfolio file — current, legacy, allocated,
// unallocated, internal, external — the ledger balance and the FIFO engine's
// open lots must agree. If they drift apart, the dashboard shows a holding
// that its own wallet breakdown contradicts.

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
  it("external send without allocations", () => {
    expectConsistent(
      portfolio([{ id: "o", ...OUT, amountBtc: "0.4", feeBtc: "0.0001" }]),
      "0.5999",
    );
  });

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

  it("external send whose allocations only cover the amount (older files)", () => {
    // The fee left the account too — the lots have to give it up as well,
    // even though the stored allocation does not mention it.
    expectConsistent(
      portfolio([
        {
          id: "o",
          ...OUT,
          amountBtc: "0.4",
          feeBtc: "0.0001",
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
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

    // Consistent even before the migration…
    const before = balances(legacy);
    expect(before.ledger).toBe(before.fifo);
    // …and correct after it: exactly the fee is gone, not twice the fee.
    expectConsistent(migrateTransferFeeConvention(legacy), "0.9999");
  });

  it("internal transfer without a group (legacy leg, lots stay put)", () => {
    expectConsistent(
      portfolio(
        [{ id: "o", ...OUT, amountBtc: "0.4", feeBtc: "0.0001", counterpartyAccountId: "aB" }],
        [{ id: "i", ...IN, amountBtc: "0.4", counterpartyAccountId: "aA" }],
      ),
      "0.9999",
    );
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
          lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
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
        },
      ]),
      "0.49985",
    );
  });
});
