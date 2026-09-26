/** @vitest-environment jsdom */
// Creating a wallet (CLAUDE.md §3.2: wallet → account → transactions).
//
// The bug this pins: a wallet was created with no accounts at all, and since
// every transaction hangs on an *account*, the new wallet could not be picked
// anywhere — not as a transfer target, not in the transaction dialog, not in a
// filter. It looked like the app had swallowed it.

import { beforeEach, describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import WalletsView from "./WalletsView";

beforeEach(() => {
  useAppStore.setState({
    portfolio: emptyPortfolio(),
    readOnly: false,
    dirty: false,
    fileName: "test.dwp",
  });
});
afterEach(cleanup);

const wallets = () => useAppStore.getState().portfolio!.wallets;

describe("adding a wallet", () => {
  it("gives it an account, so it can be used the moment it exists", () => {
    render(<WalletsView onOpenWallet={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: /wallets.addWallet/ })[0]);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Cold" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(wallets()).toHaveLength(1);
    expect(wallets()[0].accounts).toHaveLength(1);
    expect(wallets()[0].accounts[0].transactions).toEqual([]);
  });

  it("takes the account name the user typed", () => {
    render(<WalletsView onOpenWallet={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: /wallets.addWallet/ })[0]);
    const [walletField, accountField] = screen.getAllByRole("textbox");
    fireEvent.change(walletField, { target: { value: "Exchange" } });
    fireEvent.change(accountField, { target: { value: "Spot" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(wallets()[0].accounts[0].name).toBe("Spot");
  });

  it("falls back to a name rather than creating none", () => {
    render(<WalletsView onOpenWallet={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: /wallets.addWallet/ })[0]);
    const [walletField, accountField] = screen.getAllByRole("textbox");
    fireEvent.change(walletField, { target: { value: "Exchange" } });
    fireEvent.change(accountField, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(wallets()[0].accounts).toHaveLength(1);
    expect(wallets()[0].accounts[0].name.trim()).not.toBe("");
  });
});

// ------------------------------------------------------------ the overview

import { vi } from "vitest";
import { within } from "@testing-library/react";
import type { PortfolioFile, Wallet } from "@/lib/types";

function walletWith(id: string, type: Wallet["type"], btc: string, extra: Partial<Wallet> = {}): Wallet {
  return {
    id,
    name: id,
    type,
    accounts: [
      {
        id: `${id}-acc`,
        name: "Main",
        transactions: [
          {
            id: `${id}-buy`,
            type: "buy",
            date: "2024-01-01T00:00:00Z",
            amountBtc: btc,
            pricePerBtcEur: "40000",
            note: "",
          },
        ],
      },
    ],
    ...extra,
  };
}

function load(wallets: Wallet[], extra: Partial<PortfolioFile> = {}) {
  useAppStore.setState({ portfolio: { ...emptyPortfolio(), wallets, ...extra } });
}

describe("the wallet overview", () => {
  it("shows an inviting empty state with a way to the first wallet", () => {
    render(<WalletsView onOpenWallet={() => {}} />);
    expect(screen.getByText("wallets.emptyTitle")).toBeTruthy();
    expect(screen.getByRole("button", { name: /wallets.emptyAction/ })).toBeTruthy();
  });

  it("splits wallets into self-custody and custodial groups", () => {
    load([walletWith("Cold", "hardware", "1"), walletWith("Kraken", "exchange", "0.5")]);
    render(<WalletsView onOpenWallet={() => {}} />);
    expect(screen.getByText("wallets.custody.self")).toBeTruthy();
    expect(screen.getByText("wallets.custody.custodial")).toBeTruthy();
    expect(screen.getByRole("img", { name: /wallets.distributionLabel/ })).toBeTruthy();
  });

  it("keeps an archived wallet in the totals and flags that it still holds coins", () => {
    load([walletWith("Cold", "hardware", "1"), walletWith("Old", "software", "0.5", { archived: true })]);
    render(<WalletsView onOpenWallet={() => {}} />);
    // Collapsed, but the section and its balance are on screen.
    expect(screen.getByRole("button", { name: /wallets.archive.section/ })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Old" })).toBeNull();
    // The distribution names the archived wallet: its coins are part of the total.
    // (The card is folded away, so the only "Old" on screen is the legend.)
    expect(screen.getByText("Old")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /wallets.archive.section/ }));
    const card = screen.getByRole("article", { name: "Old" });
    expect(within(card).getByText(/wallets.archive.holdingBadge/)).toBeTruthy();
  });

  it("warns before archiving a wallet that holds coins, and keeps its transactions", () => {
    load([walletWith("Cold", "hardware", "1")]);
    render(<WalletsView onOpenWallet={() => {}} />);
    const actions = screen.getByRole("group", { name: "wallets.actions.label" });
    fireEvent.click(within(actions).getByRole("button", { name: "wallets.archive.action" }));

    expect(screen.getByRole("alert").textContent).toContain("wallets.archive.holdingLabel");
    expect(wallets()[0].archived).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "wallets.archive.confirm" }));

    expect(wallets()[0].archived).toBe(true);
    expect(wallets()[0].accounts[0].transactions).toHaveLength(1);
  });

  it("archives an empty wallet without the holding warning", () => {
    load([walletWith("Empty", "paper", "0")]);
    render(<WalletsView onOpenWallet={() => {}} />);
    const actions = screen.getByRole("group", { name: "wallets.actions.label" });
    fireEvent.click(within(actions).getByRole("button", { name: "wallets.archive.action" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "wallets.archive.confirmPlain" }));
    expect(wallets()[0].archived).toBe(true);
  });

  it("remembers the chosen view in the file", () => {
    load([walletWith("Cold", "hardware", "1")]);
    render(<WalletsView onOpenWallet={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "wallets.view.table" }));
    expect(useAppStore.getState().portfolio!.uiSettings?.walletsView).toBe("table");
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("reorders by keyboard within a group and says where the wallet went", () => {
    load([
      walletWith("A", "hardware", "1"),
      walletWith("X", "exchange", "1"),
      walletWith("B", "software", "1"),
    ]);
    render(<WalletsView onOpenWallet={() => {}} />);
    const handles = screen.getAllByRole("button", { name: /wallets.move/ });
    // Self-custody group first: A, B — then the exchange X.
    fireEvent.keyDown(handles[0], { key: "ArrowDown" });
    expect(wallets().map((w) => w.id)).toEqual(["B", "X", "A"]);
    expect(screen.getByText("wallets.moved")).toBeTruthy();
  });

  it("asks the chain only when told to, and not at all without addresses", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    load([walletWith("Cold", "hardware", "1"), walletWith("Hot", "software", "1")], {
      watchedAddresses: [
        {
          id: "w1",
          type: "address",
          value: "bc1qexampleexampleexampleexampleexample0",
          label: "cold",
          tags: [],
          walletId: "Cold",
        },
      ],
    });
    render(<WalletsView onOpenWallet={() => {}} />);
    const chainCalls = () =>
      fetchSpy.mock.calls.filter(([url]) => String(url).includes("bc1qexample")).length;
    expect(chainCalls()).toBe(0);
    // Only the wallet with an address offers the comparison.
    expect(screen.getAllByRole("button", { name: "wallets.chain.check" })).toHaveLength(1);
    fetchSpy.mockRestore();
  });

  it("stores only a date for the backup check, and offers none for an exchange", () => {
    load([walletWith("Cold", "hardware", "1"), walletWith("Kraken", "exchange", "1")]);
    render(<WalletsView onOpenWallet={() => {}} />);
    const cold = screen.getByRole("article", { name: "Cold" });
    fireEvent.click(within(cold).getByRole("button", { name: "wallets.edit" }));
    fireEvent.change(screen.getByLabelText("wallets.backup.label"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.click(screen.getByLabelText("wallets.kyc.non-kyc"));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    const saved = wallets().find((w) => w.id === "Cold")!;
    expect(saved.backupCheckedAt).toBe("2026-03-01");
    expect(saved.kyc).toBe("non-kyc");

    const kraken = screen.getByRole("article", { name: "Kraken" });
    fireEvent.click(within(kraken).getByRole("button", { name: "wallets.edit" }));
    expect(screen.queryByLabelText("wallets.backup.label")).toBeNull();
  });
});
