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
    render(<WalletsView />);
    fireEvent.click(screen.getAllByRole("button", { name: /wallets.addWallet/ })[0]);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Cold" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(wallets()).toHaveLength(1);
    expect(wallets()[0].accounts).toHaveLength(1);
    expect(wallets()[0].accounts[0].transactions).toEqual([]);
  });

  it("takes the account name the user typed", () => {
    render(<WalletsView />);
    fireEvent.click(screen.getAllByRole("button", { name: /wallets.addWallet/ })[0]);
    const [walletField, accountField] = screen.getAllByRole("textbox");
    fireEvent.change(walletField, { target: { value: "Exchange" } });
    fireEvent.change(accountField, { target: { value: "Spot" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(wallets()[0].accounts[0].name).toBe("Spot");
  });

  it("falls back to a name rather than creating none", () => {
    render(<WalletsView />);
    fireEvent.click(screen.getAllByRole("button", { name: /wallets.addWallet/ })[0]);
    const [walletField, accountField] = screen.getAllByRole("textbox");
    fireEvent.change(walletField, { target: { value: "Exchange" } });
    fireEvent.change(accountField, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(wallets()[0].accounts).toHaveLength(1);
    expect(wallets()[0].accounts[0].name.trim()).not.toBe("");
  });
});
