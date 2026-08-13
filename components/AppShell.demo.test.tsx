/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import AppShell from "./AppShell";

function seedDemoPortfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wallet-a",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "acct-a",
          name: "Spot",
          transactions: [
            {
              id: "buy1",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "0.5",
              pricePerBtcEur: "40000",
              totalFiatEur: null,
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

beforeEach(() => {
  useAppStore.setState({
    portfolio: seedDemoPortfolio(),
    fileMode: "fallback",
    fileHandle: null,
    fileName: "Testportfolio.dwp",
    password: null,
    encryptionEnabled: false,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    needsFileSetup: true,
    privacyMode: false,
  });
});

afterEach(cleanup);

describe("AppShell: first save attempt on demo data", () => {
  it("does not prompt while the demo data is untouched (not dirty)", () => {
    render(<AppShell />);
    expect(screen.queryByText("wizard.titleSaveExisting")).toBeNull();
    // The manual entry point is still offered.
    expect(screen.getByRole("button", { name: /nav.setUpFile/ })).toBeTruthy();
  });

  it("auto-opens the save-location wizard on the first edit", () => {
    render(<AppShell />);
    expect(screen.queryByText("wizard.titleSaveExisting")).toBeNull();

    // Simulate the first edit (mirrors what addTransaction/etc. do internally).
    act(() => {
      useAppStore.getState().update((p) => ({ ...p }));
    });

    expect(screen.getByText("wizard.titleSaveExisting")).toBeTruthy();
  });

  it("carries the existing demo wallets/transactions through on save", () => {
    render(<AppShell />);
    act(() => {
      useAppStore.getState().update((p) => ({ ...p }));
    });

    // Step "location" (fallback mode): filename input has a default, proceed.
    fireEvent.click(screen.getByRole("button", { name: /wizard.next/ }));
    // Step "password": skip encryption for the test.
    fireEvent.click(screen.getByLabelText("start.noEncryption"));
    fireEvent.click(screen.getByRole("button", { name: /wizard.next/ }));
    // Step "summary": create.
    fireEvent.click(screen.getByRole("button", { name: "wizard.create" }));

    const state = useAppStore.getState();
    expect(state.needsFileSetup).toBe(false);
    expect(state.portfolio!.wallets[0].accounts[0].transactions[0].id).toBe("buy1");
  });
});
