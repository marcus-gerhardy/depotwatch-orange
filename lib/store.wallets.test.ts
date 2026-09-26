import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import { emptyPortfolio, type Wallet } from "./types";

const wallet = (id: string, extra: Partial<Wallet> = {}): Wallet => ({
  id,
  name: id,
  type: "hardware",
  accounts: [{ id: `${id}-a`, name: "Main", transactions: [] }],
  ...extra,
});

beforeEach(() => {
  useAppStore.setState({
    portfolio: { ...emptyPortfolio(), wallets: [wallet("a"), wallet("b"), wallet("c")] },
    readOnly: false,
    dirty: false,
  });
});

const wallets = () => useAppStore.getState().portfolio!.wallets;

describe("wallet properties", () => {
  it("sets fields and removes the ones cleared, leaving the accounts alone", () => {
    const { updateWallet } = useAppStore.getState();
    updateWallet("a", { kyc: "kyc", note: "drawer", archived: true });
    expect(wallets()[0]).toMatchObject({ kyc: "kyc", note: "drawer", archived: true });
    updateWallet("a", { note: undefined, archived: undefined });
    expect("note" in wallets()[0]).toBe(false);
    expect("archived" in wallets()[0]).toBe(false);
    expect(wallets()[0].accounts).toHaveLength(1);
  });

  it("archives and restores an account without touching its transactions", () => {
    const { setAccountArchived } = useAppStore.getState();
    setAccountArchived("b", "b-a", true);
    expect(wallets()[1].accounts[0].archived).toBe(true);
    setAccountArchived("b", "b-a", false);
    expect("archived" in wallets()[1].accounts[0]).toBe(false);
  });

  it("stores the order as the order of the array, never dropping a wallet", () => {
    useAppStore.getState().reorderWallets(["c", "a"]);
    expect(wallets().map((w) => w.id)).toEqual(["c", "a", "b"]);
  });

  it("changes nothing in read-only mode", () => {
    useAppStore.setState({ readOnly: true });
    useAppStore.getState().reorderWallets(["c", "b", "a"]);
    useAppStore.getState().updateWallet("a", { archived: true });
    expect(wallets().map((w) => w.id)).toEqual(["a", "b", "c"]);
    expect(wallets()[0].archived).toBeUndefined();
  });
});
