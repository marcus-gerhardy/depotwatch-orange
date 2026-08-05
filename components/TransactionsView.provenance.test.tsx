/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import TransactionsView from "./TransactionsView";

/**
 * The scenario from the spec: five buys in wallet A (exchange), bundled into a
 * single UTXO that arrives in wallet B (hardware wallet). The arrival must be
 * able to show which buys it consists of.
 */
const BUYS: Transaction[] = [
  ["buy1", "2022-02-01", "0.1", "30000"],
  ["buy2", "2022-05-01", "0.2", "28000"],
  ["buy3", "2022-08-01", "0.3", "20000"],
  ["buy4", "2023-01-01", "0.15", "16000"],
  ["buy5", "2023-04-01", "0.25", "25000"],
].map(([id, day, amountBtc, price]) => ({
  id,
  type: "buy" as const,
  date: `${day}T00:00:00.000Z`,
  amountBtc,
  pricePerBtcEur: price,
  totalFiatEur: null,
  note: "",
}));

function seedPortfolio(linked = true): PortfolioFile {
  const p = emptyPortfolio();
  const group = linked ? { transferGroupId: "grp1" } : {};
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
            ...BUYS,
            {
              id: "out1",
              type: "transfer_out",
              date: "2023-07-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: null,
              counterpartyAccountId: "acctB",
              lotAllocations: BUYS.map((b) => ({
                lotTransactionId: b.id,
                amountBtc: b.amountBtc,
              })),
              note: "",
              ...group,
            },
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
          name: "Main",
          transactions: [
            {
              id: "in1",
              type: "transfer_in",
              date: "2023-07-01T00:30:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: null,
              counterpartyAccountId: "acctA",
              note: "",
              ...group,
            },
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

beforeEach(() => {
  localStorage.clear();
  load(seedPortfolio());
});

afterEach(cleanup);

/** The expander of the single transfer_in row. */
function originToggle() {
  return screen.getByRole("button", { name: "tx.origin.show" });
}

/**
 * The unfolded sub-row. Scoping to it matters: the origins' dates and amounts
 * legitimately appear in the main table as well (they are transactions too),
 * so an unscoped query would pass without the sub-list rendering anything.
 */
function originPanel() {
  return screen.getByText("tx.origin.intro").closest("tr")!;
}

describe("origin of an incoming transfer", () => {
  it("is collapsed until the row is expanded", () => {
    render(<TransactionsView />);
    expect(screen.queryByText("tx.origin.intro")).toBeNull();
    expect(originToggle()).toBeTruthy();
  });

  it("unfolds the five original buys with their own dates and prices", () => {
    render(<TransactionsView />);
    fireEvent.click(originToggle());

    const panel = within(originPanel());
    // One row per original buy, each with the original acquisition date.
    for (const day of ["01.02.2022", "01.05.2022", "01.08.2022", "01.01.2023", "01.04.2023"]) {
      expect(panel.getByText(day)).toBeTruthy();
    }
    // Original cost per BTC, not a price re-derived from the transfer.
    expect(panel.getByText("30.000,00")).toBeTruthy();
    expect(panel.getByText("16.000,00")).toBeTruthy();
    // Origin wallet/account of every share (five buys, one source account).
    expect(panel.getAllByText("Kraken / Spot")).toHaveLength(5);
  });

  it("adds the shares up to the amount that arrived", () => {
    render(<TransactionsView />);
    fireEvent.click(originToggle());

    const totalRow = within(originPanel()).getByText("tx.origin.total").closest("tr")!;
    expect(within(totalRow).getByText("1,00000000")).toBeTruthy();
    // The sum matches, so it is stated once: repeating the transaction's own
    // amount next to it would just be the same number twice.
    expect(within(totalRow).queryByText(/tx\.origin\.ofAmount/)).toBeNull();
    // Nothing left unexplained, so neither warning is rendered.
    expect(screen.queryByText(/tx\.origin\.mismatch/)).toBeNull();
    expect(screen.queryByText(/tx\.origin\.unresolvedAmount/)).toBeNull();
  });

  it("names the transaction's own amount when the shares fall short of it", () => {
    // One allocation points at a buy that is not in the file (deleted, or a
    // partial import), so 0.3 of the arrival cannot be traced.
    const p = seedPortfolio();
    const out = p.wallets[0].accounts[0].transactions.find((t) => t.id === "out1")!;
    out.lotAllocations = out.lotAllocations!.map((a) =>
      a.lotTransactionId === "buy3" ? { ...a, lotTransactionId: "gone" } : a,
    );
    load(p);

    render(<TransactionsView />);
    fireEvent.click(originToggle());

    const totalRow = within(originPanel()).getByText("tx.origin.total").closest("tr")!;
    expect(within(totalRow).getByText("0,70000000")).toBeTruthy();
    expect(within(totalRow).getByText(/tx\.origin\.ofAmount/)).toBeTruthy();
    expect(screen.getByText(/tx\.origin\.unresolvedAmount/)).toBeTruthy();
  });

  it("collapses again on a second click", () => {
    render(<TransactionsView />);
    fireEvent.click(originToggle());
    fireEvent.click(screen.getByRole("button", { name: "tx.origin.hide" }));
    expect(screen.queryByText("tx.origin.intro")).toBeNull();
  });

  it("offers no expander on rows that are not an arrival", () => {
    render(<TransactionsView />);
    // Five buys and one out-leg besides the single arrival.
    expect(screen.getAllByRole("button", { name: "tx.origin.show" })).toHaveLength(1);
  });
});

describe("an arrival without a link", () => {
  beforeEach(() => load(seedPortfolio(false)));

  it("says the origin is unassigned instead of showing an invented one", () => {
    render(<TransactionsView />);
    fireEvent.click(originToggle());

    expect(screen.getByText("tx.origin.unlinkedHint")).toBeTruthy();
    // No origin table at all, rather than one filled with the arrival's own date.
    expect(within(originPanel()).queryByText("tx.origin.total")).toBeNull();
  });

  it("marks the row and counts as a data-quality issue", () => {
    render(<TransactionsView />);
    // The badge sits in the tax-status column of the arrival's row.
    const badges = screen.getAllByText("tx.origin.badge");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("opens the assignment dialog from the hint", () => {
    render(<TransactionsView />);
    fireEvent.click(originToggle());
    fireEvent.click(screen.getByRole("button", { name: "tx.origin.assign" }));

    // The transfer dialog runs in assignment mode: source account still to pick.
    expect(screen.getByText("tx.transferAssignIntro")).toBeTruthy();
    expect(screen.getByText("tx.transferAssignSource")).toBeTruthy();
  });

  it("links the arrival to the picked source lots", () => {
    render(<TransactionsView />);
    fireEvent.click(originToggle());
    fireEvent.click(screen.getByRole("button", { name: "tx.origin.assign" }));

    // Source account, then one of its open lots.
    const sourceSelect = screen
      .getByText("tx.transferAssignSource")
      .closest("label")!
      .querySelector("select")!;
    fireEvent.change(sourceSelect, { target: { value: "acctA" } });
    // All five, so the picked lots add up to the 1 BTC that arrived.
    for (const box of screen.getAllByLabelText("tx.transferAssignPickLot")) {
      fireEvent.click(box);
    }

    fireEvent.click(screen.getByRole("button", { name: "tx.transferSubmit" }));

    const p = useAppStore.getState().portfolio!;
    const arrival = p.wallets[1].accounts[0].transactions.find((t) => t.id === "in1")!;
    // The arrival keeps its identity and gains the group that explains it.
    expect(arrival.transferGroupId).toBeTruthy();
    const outLeg = p.wallets[0].accounts[0].transactions.find(
      (t) => t.type === "transfer_out" && t.transferGroupId === arrival.transferGroupId,
    )!;
    expect(outLeg.lotAllocations).toHaveLength(5);
    expect(outLeg.counterpartyAccountId).toBe("acctB");
  });
});
