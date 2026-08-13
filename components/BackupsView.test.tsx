/** @vitest-environment jsdom */
// The backups view in its three states, and the one thing the restore dialog
// must always do: show both sides of the swap before anything is replaced.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import BackupsView from "./BackupsView";

const PASSWORD = "correct horse battery staple";

const tx = (id: string): Transaction => ({
  id,
  type: "buy",
  date: "2025-01-05T10:00:00.000Z",
  amountBtc: "0.1",
  pricePerBtcEur: "50000",
  totalFiatEur: "5000",
  note: "",
});

function portfolio(ids: string[]): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: ids.map(tx) }],
    },
  ];
  return p;
}

function open(ids = ["t1", "t2", "t3"]) {
  act(() => {
    useAppStore.getState().openPortfolio({
      portfolio: portfolio(ids),
      handle: null,
      fileName: "portfolio.dwp",
      password: PASSWORD,
    });
  });
}

const view = () => render(<I18nProvider locale="de"><BackupsView /></I18nProvider>);

beforeEach(() => {
  useAppStore.getState().closePortfolio();
  useAppStore.setState({ backupDirStatus: "none", backupDirName: null, lastBackupRun: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "showDirectoryPicker");
});

describe("without the File System Access API", () => {
  it("says that automatic backups are impossible instead of implying them", () => {
    open();
    useAppStore.setState({ backupDirStatus: "unsupported" });
    view();
    expect(screen.getByText(/keinen Ordner öffnen/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /herunterladen/ })).toBeTruthy();
    // No promise of anything automatic.
    expect(screen.queryByRole("button", { name: /Backup jetzt erstellen/ })).toBeNull();
  });
});

describe("with a folder that has not been chosen yet", () => {
  it("explains why a folder is needed at all", () => {
    Object.defineProperty(window, "showDirectoryPicker", {
      value: async () => ({}),
      configurable: true,
      writable: true,
    });
    open();
    view();
    expect(screen.getByText(/Nachbardateien/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Backup-Ordner wählen/ })).toBeTruthy();
  });
});

describe("with a connected folder", () => {
  beforeEach(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      value: async () => ({}),
      configurable: true,
      writable: true,
    });
  });

  it("lists what is there and asks for the password before reading it", async () => {
    open();
    useAppStore.setState({
      backupDirStatus: "granted",
      backupDirName: "Backups",
      listBackups: async () => [
        { fileName: "portfolio-2026-08-10T09-00-00.dwp", time: Date.now(), sizeBytes: 2048 },
      ],
    } as never);

    view();
    expect(await screen.findByText("portfolio-2026-08-10T09-00-00.dwp")).toBeTruthy();
    // Nothing is decrypted until a password is there.
    expect(screen.getByRole("button", { name: "Inhalt prüfen" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Wiederherstellen" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows both sides of the swap before replacing anything", async () => {
    open(["t1", "t2", "t3"]);
    useAppStore.setState({
      backupDirStatus: "granted",
      backupDirName: "Backups",
      listBackups: async () => [
        { fileName: "portfolio-2026-08-10T09-00-00.dwp", time: Date.now(), sizeBytes: 2048 },
      ],
      readBackup: async () => ({
        portfolio: portfolio(["t1"]),
        meta: {
          transactionCount: 1,
          lastTransactionDate: "2025-01-05T10:00:00.000Z",
          walletCount: 1,
          integrity: "ok" as const,
        },
      }),
    } as never);

    view();
    fireEvent.change(await screen.findByLabelText(/Passwort/, { selector: "input" }), {
      target: { value: PASSWORD },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    });

    // The dialog names the file that is open and the file that would replace
    // it, each with what it contains.
    expect(screen.getByText("Aktuell geöffnet")).toBeTruthy();
    expect(screen.getByText("Backup")).toBeTruthy();
    expect(screen.getAllByText("3 Transaktionen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Transaktionen").length).toBeGreaterThan(0);
    // And it promises the safety copy that makes this reversible.
    expect(screen.getByText(/Vor dem Wiederherstellen/)).toBeTruthy();
    // And nothing has happened yet.
    expect(
      useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions,
    ).toHaveLength(3);
  });
});
