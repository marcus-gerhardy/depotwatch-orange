/** @vitest-environment jsdom */
// Read-only mode, where it is actually enforced (CLAUDE.md §6.7).
//
// The point of these tests is that the lock is in the *store*, not in the
// buttons: every case below calls the store action directly, the way a
// keyboard shortcut or a dialog that was already open would. A mode that only
// hides controls is not a mode, it is a suggestion.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "./types";

const tx = (id: string): Transaction => ({
  id,
  type: "buy",
  date: "2026-01-05T10:00:00.000Z",
  amountBtc: "0.02",
  pricePerBtcEur: "40000",
  totalFiatEur: "800",
  note: "",
});

function portfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.milestones = [];
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: [tx("b1")] }],
    },
  ];
  return p;
}

const open = (readOnly: boolean) =>
  useAppStore.getState().openPortfolio({
    portfolio: portfolio(),
    handle: null,
    fileName: "test.dwp",
    password: null,
    readOnly,
  });

const state = () => useAppStore.getState();
const txCount = () =>
  state().portfolio!.wallets[0].accounts[0].transactions.length;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ portfolio: null, readOnly: false, readOnlyBlockedAt: null, dirty: false });
});

describe("what read-only refuses", () => {
  beforeEach(() => open(true));

  it("changes nothing and says so, whichever door the change came through", () => {
    const before = state().portfolio;

    state().addTransaction("a1", tx("b2"));
    state().updateTransaction("b1", { ...tx("b1"), amountBtc: "9" }, "a1");
    state().deleteTransaction("b1");
    state().addWallet({ id: "w2", name: "Second", type: "hardware" });
    state().addWatchedAddress({
      id: "wa1",
      type: "address",
      value: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      label: "x",
      tags: [],
    });
    state().update((p) => ({ ...p, settings: { ...p.settings, holdingPeriodDays: 1 } }));

    expect(state().portfolio).toBe(before);
    expect(txCount()).toBe(1);
    // Never dirty: nothing to save means nothing that could be saved later.
    expect(state().dirty).toBe(false);
    // And every refusal is announced, so a dead-looking button has an answer.
    expect(state().readOnlyBlockedAt).not.toBeNull();
  });

  it("writes nothing to disk, not even an autosave", async () => {
    const write = vi.fn();
    useAppStore.setState({
      fileMode: "fsa",
      fileHandle: { createWritable: write } as unknown as FileSystemFileHandle,
      dirty: true,
    });

    await state().saveNow();

    expect(write).not.toHaveBeenCalled();
    // A file in a synced folder must come out of a visit with its timestamp
    // untouched, which is the whole reason for the mode.
    expect(state().lastSavedAt).toBeNull();
  });

  it("refuses to write a backup", async () => {
    expect((await state().runBackup({ manual: true })).error).toBe("readOnly");
    expect((await state().restoreBackup("b.dwp", "")).error).toBe("readOnly");
  });

  it("keeps a milestone out of the file, and out of the toast", () => {
    // The evaluation still runs — it just does not put anything in the file.
    expect(state().portfolio!.milestones).toEqual([]);
    expect(state().milestoneQueue).toEqual([]);

    state().achieveMilestone("whitepaperOpened");

    expect(state().portfolio!.milestones).toEqual([]);
    // It waits instead, and lands in the next file opened for editing.
    expect(localStorage.getItem("depotwatch.milestoneEvents.v1")).toContain(
      "whitepaperOpened",
    );
  });
});

describe("what read-only still allows", () => {
  beforeEach(() => open(true));

  it("lets the session be arranged without writing it back", () => {
    state().saveTransactionColumns(["date", "amount"]);
    state().saveDashboardLayout([
      { i: "pnl-1", widgetId: "pnl", x: 0, y: 0, w: 4, h: 4 },
    ]);
    state().setUiLocale("en");

    // Applied for this session…
    expect(state().portfolio!.uiSettings?.transactionColumns).toEqual(["date", "amount"]);
    expect(state().portfolio!.uiSettings?.dashboardLayout).toHaveLength(1);
    expect(state().uiLocale).toBe("en");
    // …but not a change to the file: nothing is pending, so leaving the mode
    // cannot save it retroactively either.
    expect(state().dirty).toBe(false);
    expect(state().readOnlyBlockedAt).toBeNull();
  });
});

describe("leaving and entering", () => {
  it("is a session state, and the file never learns about it", () => {
    open(false);
    state().setReadOnly(true);
    expect(state().readOnly).toBe(true);
    expect(state().dirty).toBe(false);
    expect("readOnly" in state().portfolio!).toBe(false);

    state().setReadOnly(false);
    state().addTransaction("a1", tx("b2"));
    expect(txCount()).toBe(2);
    expect(state().dirty).toBe(true);
  });

  it("comes back off when the file is closed", () => {
    open(true);
    state().closePortfolio();
    expect(state().readOnly).toBe(false);
  });
});
