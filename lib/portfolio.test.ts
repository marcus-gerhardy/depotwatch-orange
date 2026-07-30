import { describe, it, expect } from "vitest";
import { accountBalances, balanceDelta, totalBalance } from "./portfolio";
import { computeFifo } from "./fifo";
import { ZERO } from "./decimal";
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

  it("charges the fee on top for an external send (no in-leg absorbs it)", () => {
    expect(
      balanceDelta(entry("transfer_out", "0.2", { feeBtc: "0.00001" })).toString(),
    ).toBe("-0.20001");
  });

  it("charges the transfer fee once, on top of the transferred amount", () => {
    // The out-leg records what is transferred (0.9999) and loses the fee on
    // top of it; the in-leg receives exactly the transferred amount, so across
    // both accounts only the fee leaves the portfolio.
    const out = entry("transfer_out", "0.9999", {
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
      entry("transfer_out", "0.9999", {
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

describe("totalBalance", () => {
  it("is buys + transfer_ins − sells − transfer_outs − spends (BTC fees per convention)", () => {
    const entries = [
      entry("buy", "1"),
      entry("transfer_in", "0.5"),
      entry("sell", "0.2"),
      entry("transfer_out", "0.3"),
      entry("spend", "0.1"),
    ];
    // 1 + 0.5 − 0.2 − 0.3 − 0.1
    expect(totalBalance(entries).toString()).toBe("0.9");
  });

  it("regression: 18 external sends with a 1000 sat fee each cost 0.00018 BTC in fees", () => {
    // Reported case: the withdrawals carry their network fee in feeBtc, and
    // no in-leg absorbs it — the balance has to drop by 18 × 1000 sats too.
    const entries = [
      entry("buy", "0.00554011"),
      ...Array.from({ length: 18 }, () =>
        entry("transfer_out", "0.00000100", { feeBtc: "0.00001" }),
      ),
    ];
    // 0.00554011 − 18 × 0.000001 − 18 × 0.00001
    expect(totalBalance(entries).toString()).toBe("0.00534211");
  });

  it("applies BTC fees: deducted on buys, charged on top for sell/spend", () => {
    const entries = [
      entry("buy", "1", { feeBtc: "0.001" }),
      entry("sell", "0.5", { feeBtc: "0.002" }),
    ];
    expect(totalBalance(entries).toString()).toBe("0.497");
  });

  it("stays the sum of the per-account balances", () => {
    const entries = [
      entry("buy", "1"),
      entry("transfer_out", "0.4", { counterpartyAccountId: "a2" }),
      entry("transfer_in", "0.4", {
        accountId: "a2",
        accountName: "Cold",
        counterpartyAccountId: "a1",
      }),
    ];
    const perAccount = accountBalances(entries).reduce(
      (s, b) => s.plus(b.btc),
      ZERO,
    );
    expect(totalBalance(entries).toString()).toBe(perAccount.toString());
  });

  it("regression: a disposal without a covering lot must not inflate the holding", () => {
    // A CSV export starting mid-history: the sold coins were bought earlier,
    // so the FIFO engine finds no lot to consume and reports 1 BTC of open
    // lots — the actual holding is 0.7.
    const entries = [
      entry("sell", "0.3", { date: "2026-02-01T00:00:00Z", pricePerBtcEur: "50000" }),
      entry("buy", "1", { date: "2026-03-01T00:00:00Z", pricePerBtcEur: "50000" }),
    ];
    const fifo = computeFifo(entries, 365);
    expect(fifo.openLotsBtc.toString()).toBe("1");
    expect(fifo.disposals[0].uncoveredBtc.toString()).toBe("0.3");
    expect(totalBalance(entries).toString()).toBe("0.7");
  });
});

describe("ledger balance vs. FIFO open lots", () => {
  it("agree for every transaction shape when BTC fees are involved", () => {
    const entries = [
      entry("buy", "1", { date: "2026-01-01T00:00:00Z", pricePerBtcEur: "50000", feeBtc: "0.001" }),
      entry("sell", "0.2", { date: "2026-02-01T00:00:00Z", pricePerBtcEur: "60000", feeBtc: "0.0005" }),
      entry("spend", "0.05", { date: "2026-02-15T00:00:00Z", pricePerBtcEur: "60000", feeBtc: "0.0001" }),
      // Internal transfer: the out-leg records the transferred amount and
      // loses the fee on top, the in-leg receives that amount — so only the
      // fee leaves the portfolio.
      entry("transfer_out", "0.29999", {
        date: "2026-03-01T00:00:00Z",
        feeBtc: "0.00001",
        counterpartyAccountId: "a2",
        transferGroupId: "g1",
      }),
      entry("transfer_in", "0.29999", {
        date: "2026-03-01T00:00:01Z",
        accountId: "a2",
        accountName: "Cold",
        counterpartyAccountId: "a1",
        transferGroupId: "g1",
      }),
      // External send: fee on top, nothing absorbs it.
      entry("transfer_out", "0.1", { date: "2026-04-01T00:00:00Z", feeBtc: "0.00002" }),
    ];
    const ledger = totalBalance(entries);
    // (1 − 0.001) − (0.2 + 0.0005) − (0.05 + 0.0001) − (0.29999 + 0.00001)
    //   + 0.29999 − (0.1 + 0.00002)
    expect(ledger.toString()).toBe("0.64837");
    expect(computeFifo(entries, 365).openLotsBtc.toString()).toBe(ledger.toString());
  });
});
