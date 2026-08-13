/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "@/lib/types";
import TransactionForm from "./TransactionForm";

const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
const ADDRESS = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

function seedPortfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "walletA",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "acctA",
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
          ],
        },
      ],
    },
    {
      id: "walletB",
      name: "Hardware wallet",
      type: "hardware",
      accounts: [{ id: "acctB", name: "Cold", transactions: [] }],
    },
  ];
  return p;
}

const txs = () => flattenLedger(useAppStore.getState().portfolio!.wallets);

const setType = (value: string) =>
  fireEvent.change(screen.getByLabelText("tx.type"), { target: { value } });

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const save = () => fireEvent.click(screen.getByRole("button", { name: "common.save" }));

/**
 * Secondary field groups are collapsed until they have content, so a test that
 * fills an empty one opens it first — exactly what a user does.
 */
const openSection = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: title }));

beforeEach(() => {
  useAppStore.setState({ portfolio: seedPortfolio(), dirty: false });
});

afterEach(cleanup);

describe("TransactionForm: on-chain fields", () => {
  it("shows them only for transfers and toggles with the type", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    expect(screen.queryByLabelText("tx.txid")).toBeNull();
    expect(screen.queryByLabelText("tx.address")).toBeNull();

    setType("transfer");
    openSection("tx.onChainSection");
    expect(screen.getByLabelText("tx.txid")).toBeTruthy();
    expect(screen.getByLabelText("tx.address")).toBeTruthy();
    expect(screen.getByText("tx.onChainSection")).toBeTruthy();

    setType("sell");
    expect(screen.queryByLabelText("tx.txid")).toBeNull();
    expect(screen.queryByLabelText("tx.address")).toBeNull();
  });

  it("stores normalized values on both legs of an internal transfer", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    setType("transfer");
    fill("tx.amountBtc", "0.5");
    fill("tx.fromAccount", "acctA");
    fill("tx.toAccount", "acctB");
    openSection("tx.onChainSection");
    fill("tx.txid", `  ${TXID.toUpperCase()} `);
    fill("tx.address", ` ${ADDRESS.toUpperCase()} `);
    save();

    const legs = txs().filter((t) => t.type !== "buy");
    expect(legs.map((l) => l.type).sort()).toEqual(["transfer_in", "transfer_out"]);
    for (const leg of legs) {
      expect(leg.txid).toBe(TXID);
      expect(leg.address).toBe(ADDRESS);
    }
  });

  it("blocks saving on a malformed txid and shows an error", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    setType("transfer");
    fill("tx.amountBtc", "0.5");
    fill("tx.toAccount", "acctB");
    openSection("tx.onChainSection");
    fill("tx.txid", "not-a-txid");
    save();

    expect(screen.getAllByText("tx.txidInvalid").length).toBeGreaterThan(0);
    expect(txs()).toHaveLength(1); // nothing added
  });

  it("blocks saving on a malformed address and shows an error", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    setType("transfer");
    fill("tx.amountBtc", "0.5");
    fill("tx.toAccount", "acctB");
    openSection("tx.onChainSection");
    // Valid bech32 characters, broken checksum.
    fill("tx.address", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5");
    save();

    expect(screen.getAllByText("tx.addressInvalid").length).toBeGreaterThan(0);
    expect(txs()).toHaveLength(1);
  });

  it("accepts empty on-chain fields (both are optional)", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    setType("transfer");
    fill("tx.amountBtc", "0.5");
    fill("tx.toAccount", "acctB");
    save();

    const legs = txs().filter((t) => t.type !== "buy");
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.txid === undefined && l.address === undefined)).toBe(
      true,
    );
  });

  it("keeps existing values when editing a transfer leg", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);
    setType("transfer");
    fill("tx.amountBtc", "0.5");
    fill("tx.toAccount", "acctB");
    openSection("tx.onChainSection");
    fill("tx.txid", TXID);
    save();
    cleanup();

    const outLeg = txs().find((t) => t.type === "transfer_out")!;
    render(<TransactionForm existing={outLeg} onClose={() => {}} />);

    expect((screen.getByLabelText("tx.txid") as HTMLInputElement).value).toBe(TXID);
  });
});

describe("TransactionForm: numeric field formatting", () => {
  it("prefills BTC with 8 and fiat with 2 decimals when editing", () => {
    const p = seedPortfolio();
    p.wallets[0].accounts[0].transactions = [
      {
        id: "buy1",
        type: "buy",
        date: "2026-01-01T00:00:00.000Z",
        amountBtc: "0.5",
        pricePerBtcEur: "40000",
        totalFiatEur: "20000",
        feeBtc: "0.0001",
        feeFiatEur: "1.5",
        note: "",
      },
    ];
    useAppStore.setState({ portfolio: p });

    render(<TransactionForm existing={txs()[0]} onClose={() => {}} />);

    const value = (label: string) =>
      (screen.getByLabelText(label) as HTMLInputElement).value;
    // German locale (the test default): comma as the decimal separator, and
    // no grouping inside inputs so the value stays typable.
    expect(value("tx.amountBtc")).toBe("0,50000000");
    expect(value("tx.priceEur")).toBe("40000,00");
    expect(value("tx.totalEur")).toBe("20000,00");
    expect(value("tx.feeBtc (common.optional)")).toBe("0,00010000");
    expect(value("tx.feeEur (common.optional)")).toBe("1,50");
  });

  it("accepts either separator while typing and formats on blur", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    const input = screen.getByLabelText("tx.amountBtc") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(input.value).toBe("0.5"); // untouched while typing
    fireEvent.blur(input);
    expect(input.value).toBe("0,50000000");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0,25" } });
    fireEvent.blur(input);
    expect(input.value).toBe("0,25000000");
  });

  it("stores a comma-typed amount as a canonical decimal string", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("tx.amountBtc"), {
      target: { value: "0,25" },
    });
    fireEvent.change(screen.getByLabelText("tx.priceEur"), {
      target: { value: "40000" },
    });
    save();

    const added = txs().find((e) => e.id !== "buy1")!;
    expect(added.amountBtc).toBe("0.25000000");
    expect(added.pricePerBtcEur).toBe("40000.00");
  });

  it("leaves an unparseable entry alone instead of turning it into 0", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    const input = screen.getByLabelText("tx.amountBtc") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(input.value).toBe("abc");
  });
});
