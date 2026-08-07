/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import { emptyPortfolio, flattenLedger, type PortfolioFile, type Transaction } from "./types";

const tx = (t: Partial<Transaction> & Pick<Transaction, "id" | "type">): Transaction => ({
  date: "2024-01-01T00:00:00.000Z",
  amountBtc: "1",
  pricePerBtcEur: null,
  note: "",
  ...t,
});

/** An internal transfer from wallet A / Spot to wallet B / Cold, plus a spare account. */
function seed(): PortfolioFile {
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
            tx({
              id: "out1",
              type: "transfer_out",
              transferGroupId: "g1",
              counterpartyAccountId: "aB",
            }),
          ],
        },
        { id: "aA2", name: "Savings", transactions: [] },
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
            tx({
              id: "in1",
              type: "transfer_in",
              transferGroupId: "g1",
              counterpartyAccountId: "aA",
            }),
          ],
        },
      ],
    },
  ];
  return p;
}

const current = (id: string) =>
  flattenLedger(useAppStore.getState().portfolio!.wallets).find((e) => e.id === id)!;

beforeEach(() => {
  useAppStore.setState({
    portfolio: seed(),
    fileMode: "fallback",
    fileHandle: null,
    dirty: false,
  });
});

describe("updateTransaction", () => {
  it("retargets the counterpart when a linked leg moves to another account", () => {
    // The out-leg moves from Kraken/Spot to Kraken/Savings; the arrival still
    // pointed at the account the leg just left (CLAUDE.md §3.2).
    const out = current("out1");
    useAppStore.getState().updateTransaction("out1", { ...out }, "aA2");

    expect(current("out1").accountId).toBe("aA2");
    expect(current("in1").counterpartyAccountId).toBe("aA2");
    expect(current("in1").transferGroupId).toBe("g1");
  });

  it("leaves the counterpart alone when nothing moved", () => {
    const out = current("out1");
    useAppStore.getState().updateTransaction("out1", { ...out, note: "edited" }, "aA");

    expect(current("out1").note).toBe("edited");
    expect(current("in1").counterpartyAccountId).toBe("aA");
  });

  it("touches only legs of the same transfer group", () => {
    const p = seed();
    p.wallets[1].accounts[0].transactions.push(
      tx({ id: "other", type: "transfer_in", counterpartyAccountId: "aA" }),
    );
    useAppStore.setState({ portfolio: p });

    useAppStore.getState().updateTransaction("out1", { ...current("out1") }, "aA2");
    expect(current("other").counterpartyAccountId).toBe("aA");
  });
});
