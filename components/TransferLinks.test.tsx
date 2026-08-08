/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import TransactionsView from "./TransactionsView";

const tx = (t: Partial<Transaction> & Pick<Transaction, "id" | "type">): Transaction => ({
  date: "2024-01-01T00:00:00.000Z",
  amountBtc: "1",
  pricePerBtcEur: null,
  note: "",
  ...t,
});

/**
 * Wallet A holds two buys and an outgoing transfer of 0.5 BTC (0.4999 sent
 * plus a 0.0001 fee); wallet B holds the matching arrival. `linked` decides
 * whether the two legs already know about each other.
 */
function seed({ linked = false, allocated = true } = {}): PortfolioFile {
  const p = emptyPortfolio();
  const group = linked
    ? { transferGroupId: "g1", counterpartyAccountId: "acctB" }
    : {};
  p.wallets = [
    {
      id: "walletA",
      name: "Kraken",
      type: "exchange",
      accounts: [
        {
          id: "acctA",
          name: "Spot",
          transactions: [
            tx({
              id: "buy1",
              type: "buy",
              date: "2023-01-01T00:00:00.000Z",
              amountBtc: "0.4",
              pricePerBtcEur: "20000",
            }),
            tx({
              id: "buy2",
              type: "buy",
              date: "2023-06-01T00:00:00.000Z",
              amountBtc: "0.6",
              pricePerBtcEur: "30000",
            }),
            tx({
              id: "out1",
              type: "transfer_out",
              date: "2024-02-01T00:00:00.000Z",
              amountBtc: "0.4999",
              feeBtc: "0.0001",
              ...(allocated
                ? { lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.4" }] }
                : {}),
              ...group,
            }),
          ],
        },
      ],
    },
    {
      id: "walletB",
      name: "BitBox02",
      type: "hardware",
      accounts: [
        {
          id: "acctB",
          name: "Cold",
          transactions: [
            tx({
              id: "in1",
              type: "transfer_in",
              date: "2024-02-01T01:00:00.000Z",
              amountBtc: "0.4999",
              ...(linked
                ? { transferGroupId: "g1", counterpartyAccountId: "acctA" }
                : {}),
            }),
          ],
        },
      ],
    },
  ];
  return p;
}

function load(portfolio: PortfolioFile) {
  useAppStore.setState({
    portfolio,
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
}

/** Open the edit dialog of the row carrying the given type icon. */
function openEdit(type: "transfer_in" | "transfer_out") {
  const row = screen.getByRole("img", { name: `tx.types.${type}` }).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "common.edit" }));
}

/**
 * The dialog's sections are collapsed once nothing is missing in them, so a
 * test that inspects a complete one opens it first (the header carries a
 * chevron and the section's summary besides its title, hence the loose match).
 */
function openSection(title: string) {
  const header = screen
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").includes(title));
  if (header && header.getAttribute("aria-expanded") === "false") {
    fireEvent.click(header);
  }
}

const currentTx = (id: string) =>
  useAppStore
    .getState()
    .portfolio!.wallets.flatMap((w) => w.accounts.flatMap((a) => a.transactions))
    .find((t) => t.id === id)!;

beforeEach(() => {
  localStorage.clear();
  load(seed());
});

afterEach(cleanup);

describe("editing an outgoing transfer's lot assignments", () => {
  it("lists the assigned buy with its date, source account and cost", () => {
    render(<TransactionsView />);
    openEdit("transfer_out");

    const section = screen.getByText("tx.allocations.intro").closest("div")!;
    expect(within(section).getByText("01.01.2023")).toBeTruthy();
    expect(within(section).getByText("Kraken / Spot")).toBeTruthy();
    expect(within(section).getByText("20.000,00")).toBeTruthy();
  });

  it("reports the shortfall against amount plus network fee", () => {
    render(<TransactionsView />);
    openEdit("transfer_out");

    // 0.4999 + 0.0001 left the account, only 0.4 is assigned.
    expect(screen.getByText(/tx\.allocations\.unassigned/)).toBeTruthy();
    expect(screen.queryByText(/tx\.allocations\.complete/)).toBeNull();
  });

  it("adds a second lot, defaulting to what the transfer still needs", () => {
    render(<TransactionsView />);
    openEdit("transfer_out");

    fireEvent.click(screen.getByRole("button", { name: /tx\.allocations\.add/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "tx.allocations.pickAria" }));
    fireEvent.click(screen.getByRole("button", { name: "tx.lotPicker.confirm" }));

    // 0.1 of buy2 closes the gap exactly, so nothing is left unassigned.
    expect(screen.getByText(/tx\.allocations\.complete/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(currentTx("out1").lotAllocations).toEqual([
      { lotTransactionId: "buy1", amountBtc: "0.4" },
      { lotTransactionId: "buy2", amountBtc: "0.10000000" },
    ]);
  });

  it("removes an assignment and saves the transfer without it", () => {
    render(<TransactionsView />);
    openEdit("transfer_out");

    fireEvent.click(screen.getByRole("button", { name: "tx.allocations.remove" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(currentTx("out1").lotAllocations).toBeUndefined();
  });

  it("flags an amount above what the lot has left", () => {
    render(<TransactionsView />);
    openEdit("transfer_out");

    const input = screen
      .getByText("tx.allocations.intro")
      .closest("div")!
      .querySelector("input")!;
    fireEvent.change(input, { target: { value: "0,9" } });
    fireEvent.blur(input);

    expect(screen.getByText(/tx\.allocations\.exceedsLot/)).toBeTruthy();
  });

  it("previews the origin the assignment produces", () => {
    render(<TransactionsView />);
    openEdit("transfer_out");

    const preview = screen.getByText("tx.allocations.preview").closest("div")!;
    expect(within(preview).getByText("01.01.2023")).toBeTruthy();
  });
});

describe("the lot picker", () => {
  /** Both buys unassigned, so the picker has more than one row to work with. */
  function openPicker() {
    load(seed({ allocated: false }));
    render(<TransactionsView />);
    openEdit("transfer_out");
    fireEvent.click(screen.getByRole("button", { name: /tx\.allocations\.add/ }));
    return screen.getByText("tx.allocations.pickIntro").closest("div")!;
  }

  const dataRows = (picker: HTMLElement) =>
    within(picker)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent ?? "");

  it("lists the newest buy first and sorts the other way on demand", () => {
    const picker = openPicker();

    expect(dataRows(picker)[0]).toContain("01.06.2023");

    fireEvent.click(within(picker).getByRole("button", { name: /tx\.allocations\.acquired/ }));
    expect(dataRows(picker)[0]).toContain("01.01.2023");
  });

  it("narrows the table by the search field", () => {
    const picker = openPicker();

    fireEvent.change(within(picker).getByLabelText("tx.lotPicker.search"), {
      target: { value: "01.01.2023" },
    });

    expect(dataRows(picker)).toHaveLength(1);
    expect(dataRows(picker)[0]).toContain("01.01.2023");
  });

  it("assigns several lots at once, filling up what is still missing", () => {
    const picker = openPicker();

    // 0.4999 + 0.0001 fee are open; the newest lot covers it on its own, so
    // the older one is selected but contributes nothing and is left out.
    fireEvent.click(within(picker).getByRole("checkbox", { name: "tx.selectAll" }));
    fireEvent.click(screen.getByRole("button", { name: "tx.lotPicker.confirm" }));

    expect(screen.getByText(/tx\.allocations\.complete/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(currentTx("out1").lotAllocations).toEqual([
      { lotTransactionId: "buy2", amountBtc: "0.50000000" },
    ]);
  });

  it("assigns every selected lot in full once the need is unchecked", () => {
    const picker = openPicker();

    fireEvent.click(within(picker).getByRole("checkbox", { name: "tx.selectAll" }));
    fireEvent.click(within(picker).getByRole("checkbox", { name: /tx\.lotPicker\.needOnly/ }));
    fireEvent.click(screen.getByRole("button", { name: "tx.lotPicker.confirm" }));

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    // Stored oldest first, whatever the table's sort order — that order
    // decides which lot the network fee comes off.
    expect(currentTx("out1").lotAllocations).toEqual([
      { lotTransactionId: "buy1", amountBtc: "0.40000000" },
      { lotTransactionId: "buy2", amountBtc: "0.60000000" },
    ]);
  });
});

describe("editing an arrival's out-leg link", () => {
  it("shows the linked out-leg with wallet, account, date and amount", () => {
    load(seed({ linked: true }));
    render(<TransactionsView />);
    openEdit("transfer_in");
    openSection("tx.section.origin");

    const section = screen.getByText("tx.outLeg.section").closest("div")!;
    expect(within(section).getByText("Kraken / Spot")).toBeTruthy();
    expect(within(section).getByText("0,49990000")).toBeTruthy();
  });

  it("removes the link on both legs, leaving no orphan reference", () => {
    load(seed({ linked: true }));
    render(<TransactionsView />);
    openEdit("transfer_in");
    openSection("tx.section.origin");

    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.unlink" }));

    expect(currentTx("in1").transferGroupId).toBeUndefined();
    expect(currentTx("in1").counterpartyAccountId).toBeUndefined();
    expect(currentTx("out1").transferGroupId).toBeUndefined();
    expect(currentTx("out1").counterpartyAccountId).toBeUndefined();
  });

  it("offers the unlinked out-leg and adopts the difference as the fee", () => {
    // The out-leg records 0.5 leaving while 0.4999 arrived: the 0.0001
    // difference is the network fee.
    const p = seed();
    p.wallets[0].accounts[0].transactions[2] = tx({
      id: "out1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.5",
      lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.4" }],
    });
    load(p);

    render(<TransactionsView />);
    openEdit("transfer_in");
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.assign" }));

    // The difference is only computed once a candidate is chosen.
    fireEvent.click(screen.getByRole("radio"));
    expect(screen.getByText(/tx\.outLeg\.diffFee/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.confirm" }));

    const outLeg = currentTx("out1");
    expect(outLeg.transferGroupId).toBe(currentTx("in1").transferGroupId);
    // The fee sits next to the amount, not on top of it (§3.2).
    expect(outLeg.amountBtc).toBe("0.4999");
    expect(outLeg.feeBtc).toBe("0.0001");
  });

  it("offers an out-leg whose group id pairs it with nothing", () => {
    // The state an interrupted assignment or an import leaves behind: the send
    // carries a group id, but no arrival ever joined it. Hiding it here made
    // the transfer unfixable from both sides.
    const p = seed();
    p.wallets[0].accounts[0].transactions[2] = tx({
      id: "out1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.4999",
      feeBtc: "0.0001",
      transferGroupId: "ghost",
      counterpartyAccountId: "acctB",
      lotAllocations: [{ lotTransactionId: "buy1", amountBtc: "0.4" }],
    });
    load(p);

    render(<TransactionsView />);
    openEdit("transfer_in");
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.assign" }));
    fireEvent.click(screen.getByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.confirm" }));

    const group = currentTx("in1").transferGroupId;
    expect(group).toBeTruthy();
    expect(group).not.toBe("ghost");
    expect(currentTx("out1").transferGroupId).toBe(group);
  });

  it("warns when the difference is too large to be a network fee", () => {
    const p = seed();
    p.wallets[0].accounts[0].transactions[2] = tx({
      id: "out1",
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      amountBtc: "0.9",
    });
    load(p);

    render(<TransactionsView />);
    openEdit("transfer_in");
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.assign" }));
    fireEvent.click(screen.getByRole("radio"));

    expect(screen.getByText(/tx\.outLeg\.diffTooLarge/)).toBeTruthy();
  });

  it("keeps the assignment when the dialog is saved afterwards", () => {
    // The link lives on two transactions and is applied immediately, so the
    // dialog's save must not write back the state it was opened with.
    render(<TransactionsView />);
    openEdit("transfer_in");
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.assign" }));
    fireEvent.click(screen.getByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.confirm" }));

    const group = currentTx("in1").transferGroupId;
    expect(group).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(currentTx("in1").transferGroupId).toBe(group);
    expect(currentTx("in1").counterpartyAccountId).toBe("acctA");
    expect(currentTx("out1").transferGroupId).toBe(group);
    expect(currentTx("out1").counterpartyAccountId).toBe("acctB");
  });

  it("keeps the release when the dialog is saved afterwards", () => {
    load(seed({ linked: true }));
    render(<TransactionsView />);
    openEdit("transfer_in");
    openSection("tx.section.origin");
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.unlink" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(currentTx("in1").transferGroupId).toBeUndefined();
    expect(currentTx("in1").counterpartyAccountId).toBeUndefined();
    expect(currentTx("out1").transferGroupId).toBeUndefined();
  });

  it("previews the origin the link would produce before it is applied", () => {
    render(<TransactionsView />);
    openEdit("transfer_in");
    fireEvent.click(screen.getByRole("button", { name: "tx.outLeg.assign" }));
    fireEvent.click(screen.getByRole("radio"));

    const preview = screen.getByText("tx.outLeg.previewTitle").closest("div")!;
    // The buy behind the candidate out-leg, with its own acquisition date.
    expect(within(preview).getByText("01.01.2023")).toBeTruthy();
    // Nothing is written until the assignment is confirmed.
    expect(currentTx("in1").transferGroupId).toBeUndefined();
  });
});

describe("no assignment is ever made by the app", () => {
  /** Two buys in wallet A, nothing sold yet. */
  function withBuysOnly(): PortfolioFile {
    const p = seed();
    p.wallets[0].accounts[0].transactions.splice(2, 1); // drop the transfer
    p.wallets[1].accounts[0].transactions = [];
    return p;
  }

  it("creates a sale without picking the lots itself", () => {
    load(withBuysOnly());
    render(<TransactionsView />);

    fireEvent.click(screen.getByRole("button", { name: /tx\.add/ }));
    fireEvent.change(screen.getByLabelText("tx.type"), { target: { value: "sell" } });
    fireEvent.change(screen.getByLabelText("tx.amountBtc"), { target: { value: "0.2" } });
    fireEvent.change(screen.getByLabelText("tx.priceEur"), { target: { value: "60000" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const sell = useAppStore
      .getState()
      .portfolio!.wallets[0].accounts[0].transactions.find((t) => t.type === "sell")!;
    expect(sell.lotAllocations).toBeUndefined();
  });

  it("offers the assignment while the sale is being created", () => {
    load(withBuysOnly());
    render(<TransactionsView />);

    fireEvent.click(screen.getByRole("button", { name: /tx\.add/ }));
    fireEvent.change(screen.getByLabelText("tx.type"), { target: { value: "sell" } });
    fireEvent.change(screen.getByLabelText("tx.amountBtc"), { target: { value: "0.2" } });
    fireEvent.change(screen.getByLabelText("tx.priceEur"), { target: { value: "60000" } });

    // The lot picker is right there — assigning must not require saving first.
    fireEvent.click(screen.getByRole("button", { name: /tx\.allocations\.add/ }));
    // Both buys are offered, newest first; 0.2 of it covers the sale.
    fireEvent.click(screen.getAllByRole("checkbox", { name: "tx.allocations.pickAria" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "tx.lotPicker.confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const sell = useAppStore
      .getState()
      .portfolio!.wallets[0].accounts[0].transactions.find((t) => t.type === "sell")!;
    // Newest buy first in the picker, and exactly the 0.2 that were needed.
    expect(sell.lotAllocations).toEqual([
      { lotTransactionId: "buy2", amountBtc: "0.20000000" },
    ]);
  });

  it("flags an unassigned sale as a data-quality issue", () => {
    const p = withBuysOnly();
    p.wallets[0].accounts[0].transactions.push(
      tx({ id: "sell1", type: "sell", date: "2024-03-01T00:00:00.000Z", amountBtc: "0.2", pricePerBtcEur: "60000" }),
    );
    load(p);
    render(<TransactionsView />);

    fireEvent.change(screen.getByTitle("tx.filterIssue"), {
      target: { value: "incompleteAllocation" },
    });
    expect(screen.getByRole("img", { name: "tx.types.sell" })).toBeTruthy();
  });
});
