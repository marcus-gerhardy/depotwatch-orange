import { describe, expect, it } from "vitest";
import { migrateTransferFeeConvention } from "./store";
import { totalBalance } from "./portfolio";
import { computeFifo } from "./fifo";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "./types";

/** Wallet A / Spot holds the out-leg, wallet B / Cold the in-leg. */
function portfolioWith(out: Record<string, unknown>, inAmount: string): PortfolioFile {
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
              id: "buy1",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: "40000",
              totalFiatEur: "40000",
              note: "",
            },
            {
              id: "out1",
              type: "transfer_out",
              date: "2024-02-01T00:00:00.000Z",
              pricePerBtcEur: null,
              totalFiatEur: null,
              counterpartyAccountId: "aB",
              transferGroupId: "g1",
              note: "",
              ...out,
            } as PortfolioFile["wallets"][0]["accounts"][0]["transactions"][0],
          ],
        },
      ],
    },
    {
      id: "wB",
      name: "BitBox02",
      type: "hardware",
      accounts: [
        {
          id: "aB",
          name: "Cold",
          transactions: [
            {
              id: "in1",
              type: "transfer_in",
              date: "2024-02-01T00:05:00.000Z",
              amountBtc: inAmount,
              pricePerBtcEur: null,
              totalFiatEur: null,
              counterpartyAccountId: "aA",
              transferGroupId: "g1",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

const outLeg = (p: PortfolioFile) =>
  p.wallets[0].accounts[0].transactions.find((t) => t.id === "out1")!;

describe("migrateTransferFeeConvention", () => {
  it("converts a legacy out-leg that carried the fee inside its amount", () => {
    // Old shape: amount 0.5 = what left the account, allocations 0.5, in-leg
    // 0.4999. New shape: amount 0.4999 (transferred) + 0.0001 fee on top.
    const p = portfolioWith(
      {
        amountBtc: "0.5",
        feeBtc: "0.0001",
        lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.5" }],
      },
      "0.4999",
    );

    const migrated = migrateTransferFeeConvention(p);

    expect(outLeg(migrated).amountBtc).toBe("0.4999");
    expect(outLeg(migrated).feeBtc).toBe("0.0001");
    // 1 − (0.4999 + 0.0001) + 0.4999 — only the fee leaves the portfolio.
    const entries = flattenLedger(migrated.wallets);
    expect(totalBalance(entries).toString()).toBe("0.9999");
    expect(computeFifo(entries, 365).openLotsBtc.toString()).toBe("0.9999");
  });

  it("also converts a legacy leg without allocations, confirmed by its in-leg", () => {
    const migrated = migrateTransferFeeConvention(
      portfolioWith({ amountBtc: "0.5", feeBtc: "0.0001" }, "0.4999"),
    );
    expect(outLeg(migrated).amountBtc).toBe("0.4999");
  });

  it("leaves a leg written under the current convention untouched", () => {
    const p = portfolioWith(
      {
        amountBtc: "0.4999",
        feeBtc: "0.0001",
        lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.5" }],
      },
      "0.4999",
    );

    const migrated = migrateTransferFeeConvention(p);

    expect(outLeg(migrated).amountBtc).toBe("0.4999");
    expect(migrated).toBe(p); // nothing changed → same object
  });

  it("leaves fee-less transfers and external sends alone", () => {
    const noFee = migrateTransferFeeConvention(
      portfolioWith({ amountBtc: "0.5" }, "0.5"),
    );
    expect(outLeg(noFee).amountBtc).toBe("0.5");

    const external = portfolioWith(
      { amountBtc: "0.5", feeBtc: "0.0001", counterpartyAccountId: undefined },
      "0.4999",
    );
    expect(outLeg(migrateTransferFeeConvention(external)).amountBtc).toBe("0.5");
  });
});
