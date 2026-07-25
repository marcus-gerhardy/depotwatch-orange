import { describe, it, expect } from "vitest";
import { accountBalances, balanceDelta } from "./portfolio";
import type { LedgerEntry, TransactionType } from "./types";

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
    pricePerBtcEur: null,
    note: "",
    walletId: "w1",
    walletName: "Kraken",
    accountId: "a1",
    accountName: "Spot",
    ...extra,
  };
}

describe("balanceDelta", () => {
  it("credits buys net of the BTC fee", () => {
    expect(balanceDelta(entry("buy", "1", { feeBtc: "0.001" })).toString()).toBe(
      "0.999",
    );
  });

  it("charges the fee on top for sell/spend", () => {
    expect(balanceDelta(entry("sell", "1", { feeBtc: "0.001" })).toString()).toBe(
      "-1.001",
    );
    expect(balanceDelta(entry("spend", "0.5", { feeBtc: "0.001" })).toString()).toBe(
      "-0.501",
    );
  });

  it("treats the transfer fee as part of the sent amount (no double count)", () => {
    // Source loses exactly amountBtc; the in-leg already records the net
    // arrival (amountBtc − feeBtc), so across both accounts only the fee
    // leaves the portfolio.
    const out = entry("transfer_out", "1", {
      feeBtc: "0.0001",
      counterpartyAccountId: "a2",
    });
    const inn = entry("transfer_in", "0.9999", {
      counterpartyAccountId: "a1",
      accountId: "a2",
      accountName: "Cold",
    });
    expect(balanceDelta(out).toString()).toBe("-1");
    expect(balanceDelta(inn).toString()).toBe("0.9999");
    expect(balanceDelta(out).plus(balanceDelta(inn)).toString()).toBe("-0.0001");
  });
});

describe("accountBalances", () => {
  it("keeps per-account balances consistent for an internal transfer", () => {
    const balances = accountBalances([
      entry("buy", "1", { pricePerBtcEur: "40000" }),
      entry("transfer_out", "1", {
        feeBtc: "0.0001",
        counterpartyAccountId: "a2",
      }),
      entry("transfer_in", "0.9999", {
        counterpartyAccountId: "a1",
        accountId: "a2",
        accountName: "Cold",
      }),
    ]);
    const a1 = balances.find((b) => b.accountId === "a1")!;
    const a2 = balances.find((b) => b.accountId === "a2")!;
    expect(a1.btc.toString()).toBe("0");
    expect(a2.btc.toString()).toBe("0.9999");
  });
});
