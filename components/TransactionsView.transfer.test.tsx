/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "@/lib/types";
import { totalBalance } from "@/lib/portfolio";
import { computeFifo } from "@/lib/fifo";
import TransactionsView from "./TransactionsView";

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
              amountBtc: "0.5",
              pricePerBtcEur: "40000",
              totalFiatEur: "20000",
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
      accounts: [{ id: "acctB", name: "Main", transactions: [] }],
    },
  ];
  return p;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: seedPortfolio(),
    fileMode: "fallback",
    fileHandle: null,
    fileName: "test.dwp",
    password: null,
    encryptionEnabled: false,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    privacyMode: false,
  });
});

afterEach(cleanup);

describe("TransferDialog (via TransactionsView)", () => {
  it("enables the submit button once a valid target account is chosen", async () => {
    render(<TransactionsView />);

    // Select the buy row.
    const rowCheckbox = screen.getByLabelText("tx.selectRow");
    fireEvent.click(rowCheckbox);

    // Open the bulk transfer dialog.
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));

    // Choose the target wallet + account.
    const walletSelect = screen.getByLabelText("tx.wallet") as HTMLSelectElement;
    fireEvent.change(walletSelect, { target: { value: "walletB" } });
    const accountSelect = screen.getByLabelText("tx.account") as HTMLSelectElement;
    fireEvent.change(accountSelect, { target: { value: "acctB" } });

    const submitButton = screen.getByRole("button", {
      name: "tx.transferSubmit",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
  });

  it("enables submit after linking both legs to pre-existing, independently imported transactions", () => {
    const p = seedPortfolio();
    p.wallets[0].accounts[0].transactions.push({
      id: "sent1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.5",
      pricePerBtcEur: null,
      totalFiatEur: null,
      note: "sent",
    });
    p.wallets[1].accounts[0].transactions.push({
      id: "received1",
      type: "transfer_in",
      date: "2024-02-01T00:10:00.000Z",
      amountBtc: "0.5",
      pricePerBtcEur: null,
      totalFiatEur: null,
      note: "received",
    });
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);

    // Select only the buy row (not the other two seeded transfer legs).
    const buyTypeIcon = screen.getByRole("img", { name: "tx.types.buy" });
    const buyRow = buyTypeIcon.closest("tr")!;
    fireEvent.click(buyRow.querySelector('input[type="checkbox"]')!);
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));

    const walletSelect = screen.getByLabelText("tx.wallet") as HTMLSelectElement;
    fireEvent.change(walletSelect, { target: { value: "walletB" } });
    const accountSelect = screen.getByLabelText("tx.account") as HTMLSelectElement;
    fireEvent.change(accountSelect, { target: { value: "acctB" } });

    // Candidate radios (unlike the mode-toggle radios) have no "name" attribute.
    const candidateRadios = () =>
      (screen.getAllByRole("radio") as HTMLInputElement[]).filter((r) => !r.name);

    // Link the out-leg to the pre-existing "sent" transaction.
    fireEvent.click(screen.getByLabelText("tx.transferOutModeExisting"));
    fireEvent.click(candidateRadios()[0]);

    // Link the in-leg to the pre-existing "received" transaction.
    fireEvent.click(screen.getByLabelText("tx.transferInModeExisting"));
    const afterIn = candidateRadios();
    fireEvent.click(afterIn[afterIn.length - 1]);

    const submitButton = screen.getByRole("button", {
      name: "tx.transferSubmit",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
  });

  it("links an existing out-leg whose amount plus fee equals the selected lots", () => {
    // Imported withdrawal: the transaction records the transferred amount
    // (0.4999) and its network fee (0.0001) separately, so the lots it closes
    // add up to 0.5. Linking must report no mismatch and leave the amount
    // untouched.
    const p = seedPortfolio();
    p.wallets[0].accounts[0].transactions.push({
      id: "sent1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.4999",
      pricePerBtcEur: null,
      totalFiatEur: null,
      feeBtc: "0.0001",
      note: "withdrawal",
    });
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);

    const buyRow = screen.getByRole("img", { name: "tx.types.buy" }).closest("tr")!;
    fireEvent.click(buyRow.querySelector('input[type="checkbox"]')!);
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));

    fireEvent.change(screen.getByLabelText("tx.wallet"), {
      target: { value: "walletB" },
    });
    fireEvent.change(screen.getByLabelText("tx.account"), {
      target: { value: "acctB" },
    });

    fireEvent.click(screen.getByLabelText("tx.transferOutModeExisting"));
    const candidateRadios = (screen.getAllByRole("radio") as HTMLInputElement[]).filter(
      (r) => !r.name,
    );
    fireEvent.click(candidateRadios[0]);

    // The transaction's own fee is adopted, so amount + fee matches the lots.
    // Adopted BTC fee, shown with 8 decimals and the locale separator.
    expect((screen.getByLabelText("tx.transferFeeBtc") as HTMLInputElement).value).toBe(
      "0,00010000",
    );
    expect(screen.queryByText(/transferMismatch/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "tx.transferSubmit" }));

    const after = flattenLedger(useAppStore.getState().portfolio!.wallets);
    const out = after.find((e) => e.id === "sent1")!;
    expect(out.amountBtc).toBe("0.4999"); // unchanged
    expect(out.feeBtc).toBe("0.0001");
    expect(out.counterpartyAccountId).toBe("acctB");
    expect(out.lotAllocations).toEqual([
      { lotTransactionId: "buy1", amountBtc: "0.50000000" },
    ]);

    const inLeg = after.find((e) => e.type === "transfer_in")!;
    expect(inLeg.amountBtc).toBe("0.4999");
    expect(inLeg.transferGroupId).toBe(out.transferGroupId);

    // The source is emptied (0.5 − 0.5), the target receives the net amount,
    // and exactly the network fee leaves the portfolio.
    expect(totalBalance(after).toString()).toBe("0.4999");
    expect(computeFifo(after, 365).openLotsBtc.toString()).toBe("0.4999");
  });

  it("still warns when amount plus fee does not add up to the selected lots", () => {
    const p = seedPortfolio();
    p.wallets[0].accounts[0].transactions.push({
      id: "sent1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.3",
      pricePerBtcEur: null,
      totalFiatEur: null,
      feeBtc: "0.0001",
      note: "withdrawal",
    });
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);

    const buyRow = screen.getByRole("img", { name: "tx.types.buy" }).closest("tr")!;
    fireEvent.click(buyRow.querySelector('input[type="checkbox"]')!);
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));
    fireEvent.change(screen.getByLabelText("tx.wallet"), {
      target: { value: "walletB" },
    });
    fireEvent.change(screen.getByLabelText("tx.account"), {
      target: { value: "acctB" },
    });
    fireEvent.click(screen.getByLabelText("tx.transferOutModeExisting"));
    fireEvent.click(
      (screen.getAllByRole("radio") as HTMLInputElement[]).filter((r) => !r.name)[0],
    );

    expect(screen.getByText(/transferMismatchOut/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "tx.transferSubmit" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows the quantity-weighted average cost and total cost basis, not a plain average", () => {
    const p = seedPortfolio();
    // Overwrite the single seeded buy with two lots of different size/price:
    // naive averaging of (30000 + 45000) / 2 = 37500 would be wrong; the
    // correct quantity-weighted average is (0.3*30000 + 0.2*45000) / 0.5 = 36000.
    p.wallets[0].accounts[0].transactions = [
      {
        id: "buyA",
        type: "buy",
        date: "2024-01-01T00:00:00.000Z",
        amountBtc: "0.3",
        pricePerBtcEur: "30000",
        totalFiatEur: null,
        note: "",
      },
      {
        id: "buyB",
        type: "buy",
        date: "2024-02-01T00:00:00.000Z",
        amountBtc: "0.2",
        pricePerBtcEur: "45000",
        totalFiatEur: null,
        note: "",
      },
    ];
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);

    for (const cb of screen.getAllByLabelText("tx.selectRow")) {
      fireEvent.click(cb);
    }
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));

    const walletSelect = screen.getByLabelText("tx.wallet") as HTMLSelectElement;
    fireEvent.change(walletSelect, { target: { value: "walletB" } });
    const accountSelect = screen.getByLabelText("tx.account") as HTMLSelectElement;
    fireEvent.change(accountSelect, { target: { value: "acctB" } });

    expect(screen.getByText("tx.transferSummaryAvgCost")).toBeTruthy();
    const body = document.body.textContent!;
    expect(body).toContain("36.000"); // weighted average cost per BTC
    expect(body).toContain("18.000"); // total cost basis (0.3*30000 + 0.2*45000)
    expect(body).not.toContain("37.500"); // would be the (wrong) plain average
  });
});

describe("TransferDialog: average cost carried onto the legs", () => {
  it("writes the weighted average price and the transferred value to both legs", () => {
    const p = seedPortfolio();
    // 0.3 @ 30 000 and 0.2 @ 45 000 → weighted average 36 000, basis 18 000.
    p.wallets[0].accounts[0].transactions = [
      {
        id: "buyA",
        type: "buy",
        date: "2024-01-01T00:00:00.000Z",
        amountBtc: "0.3",
        pricePerBtcEur: "30000",
        totalFiatEur: null,
        note: "",
      },
      {
        id: "buyB",
        type: "buy",
        date: "2024-02-01T00:00:00.000Z",
        amountBtc: "0.2",
        pricePerBtcEur: "45000",
        totalFiatEur: null,
        note: "",
      },
    ];
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);

    for (const cb of screen.getAllByLabelText("tx.selectRow")) fireEvent.click(cb);
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));
    fireEvent.change(screen.getByLabelText("tx.wallet"), {
      target: { value: "walletB" },
    });
    fireEvent.change(screen.getByLabelText("tx.account"), {
      target: { value: "acctB" },
    });
    // 1000 sats network fee on top of the transferred amount.
    fireEvent.change(screen.getByLabelText("tx.transferFeeBtc"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "tx.transferSubmit" }));

    const after = flattenLedger(useAppStore.getState().portfolio!.wallets);
    const out = after.find((e) => e.type === "transfer_out")!;
    const inLeg = after.find((e) => e.type === "transfer_in")!;

    expect(out.amountBtc).toBe("0.49999");
    for (const leg of [out, inLeg]) {
      // The value is the sum of the buys the transfer moves — 0.3 × 30 000 plus
      // 0.2 × 45 000 — including the coins the network fee burned, which were
      // paid for with those same euros. The rate follows from value ÷ amount.
      expect(leg.totalFiatEur).toBe("18000.00");
      expect(leg.pricePerBtcEur).toBe("36000.72");
    }

    // The engine still derives the cost basis from the moved lots (0.3 at
    // 30 000 plus 0.19999 at 45 000), not from the price on the leg.
    const fifo = computeFifo(after, 365);
    expect(fifo.openCostBasisEur.toFixed(2)).toBe("17999.55");
    expect(fifo.openLotsBtc.toString()).toBe(totalBalance(after).toString());
  });

  it("does not overwrite a price an existing linked transaction already has", () => {
    const p = seedPortfolio();
    p.wallets[0].accounts[0].transactions.push({
      id: "sent1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.5",
      pricePerBtcEur: "55000",
      totalFiatEur: "27500",
      note: "imported",
    });
    useAppStore.setState({ portfolio: p });

    render(<TransactionsView />);

    const buyRow = screen.getByRole("img", { name: "tx.types.buy" }).closest("tr")!;
    fireEvent.click(buyRow.querySelector('input[type="checkbox"]')!);
    fireEvent.click(screen.getByRole("button", { name: "tx.transferAction" }));
    fireEvent.change(screen.getByLabelText("tx.wallet"), {
      target: { value: "walletB" },
    });
    fireEvent.change(screen.getByLabelText("tx.account"), {
      target: { value: "acctB" },
    });
    fireEvent.click(screen.getByLabelText("tx.transferOutModeExisting"));
    fireEvent.click(
      (screen.getAllByRole("radio") as HTMLInputElement[]).filter((r) => !r.name)[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "tx.transferSubmit" }));

    const out = flattenLedger(useAppStore.getState().portfolio!.wallets).find(
      (e) => e.id === "sent1",
    )!;
    expect(out.pricePerBtcEur).toBe("55000");
    expect(out.totalFiatEur).toBe("27500");
  });
});
