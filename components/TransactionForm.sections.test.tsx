/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "@/lib/types";
import TransactionForm from "./TransactionForm";

const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

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
              feeBtc: "0.0001",
              note: "Sparplan",
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

/** The disclosure header of a section, matched on its title. */
const sectionHeader = (title: string) =>
  screen
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").includes(title))!;

beforeEach(() => {
  useAppStore.setState({ portfolio: seedPortfolio(), dirty: false });
});

afterEach(cleanup);

describe("TransactionForm: collapsible sections", () => {
  it("keeps secondary groups collapsed while they are empty", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    expect(sectionHeader("tx.section.fees").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("tx.feeBtc (common.optional)")).toBeNull();

    fireEvent.click(sectionHeader("tx.section.fees"));
    expect(screen.getByLabelText("tx.feeBtc (common.optional)")).toBeTruthy();
  });

  it("opens a group that has content and previews it in the header", () => {
    render(<TransactionForm existing={txs()[0]} onClose={() => {}} />);

    // A fee and a note are worth seeing without hunting for them.
    expect(sectionHeader("tx.section.fees").getAttribute("aria-expanded")).toBe("true");
    expect(sectionHeader("tx.note").textContent).toContain("Sparplan");
  });

  it("keeps an invalid field visible instead of letting it be collapsed away", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("tx.type"), {
      target: { value: "transfer" },
    });
    fireEvent.click(sectionHeader("tx.onChainSection"));
    fireEvent.change(screen.getByLabelText("tx.txid"), {
      target: { value: "not-a-txid" },
    });

    // Collapsing it would hide the reason the transaction cannot be saved.
    fireEvent.click(sectionHeader("tx.onChainSection"));
    expect(sectionHeader("tx.onChainSection").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("tx.txid")).toBeTruthy();
  });

  it("keeps values of a collapsed group when saving", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("tx.type"), {
      target: { value: "transfer" },
    });
    fireEvent.change(screen.getByLabelText("tx.amountBtc"), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("tx.toAccount"), {
      target: { value: "acctB" },
    });
    fireEvent.click(sectionHeader("tx.onChainSection"));
    fireEvent.change(screen.getByLabelText("tx.txid"), { target: { value: TXID } });
    fireEvent.click(sectionHeader("tx.onChainSection")); // collapse again
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(txs().find((e) => e.type === "transfer_out")!.txid).toBe(TXID);
  });
});
