/** @vitest-environment jsdom */
// The playful touches must never get in the way (CLAUDE.md §5.1), which mostly
// means: the master switch really does switch all of them off, and nothing
// appears on a day it does not belong to.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import { LASER_EYES_CLICKS } from "@/lib/easterEggs";
import de from "@/lib/i18n/de";
import Footer from "./Footer";
import TransactionsView from "./TransactionsView";
import SettingsView from "./SettingsView";
import Celebration from "./Celebration";

const tx = (t: Partial<Transaction> & Pick<Transaction, "id" | "type">): Transaction => ({
  date: "2026-01-01T00:00:00.000Z",
  amountBtc: "1",
  pricePerBtcEur: "50000",
  note: "",
  ...t,
});

function portfolio(transactions: Transaction[] = [], eggs?: boolean): PortfolioFile {
  const p = emptyPortfolio();
  if (eggs !== undefined) p.settings.easterEggs = eggs;
  p.wallets = [
    {
      id: "w1",
      name: "Kraken",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  return p;
}

const load = (p: PortfolioFile) =>
  useAppStore.setState({ portfolio: p, fileMode: "fallback", privacyMode: false });

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  load(portfolio());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Pretend it is a given local day, without touching anything else. */
function onDay(month: number, day: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2027, month - 1, day, 12, 0, 0));
}

// The footer renders outside the I18nProvider (it is on the legal pages too),
// so it translates for real rather than echoing keys.
describe("day-of lines in the footer", () => {
  it("shows the genesis headline on 3 January and nothing on 4 January", () => {
    onDay(1, 3);
    render(<Footer />);
    expect(screen.getByText(de.footer.genesisHeadline)).toBeTruthy();
    cleanup();

    onDay(1, 4);
    render(<Footer />);
    expect(screen.queryByText(de.footer.genesisHeadline)).toBeNull();
  });

  it("shows Hal Finney's line on 10 January", () => {
    onDay(1, 10);
    render(<Footer />);
    expect(screen.getByText(de.footer.runningBitcoin)).toBeTruthy();
  });

  it("shows nothing at all with the switch off", () => {
    onDay(1, 3);
    load(portfolio([], false));
    render(<Footer />);
    expect(screen.queryByText(de.footer.genesisHeadline)).toBeNull();
  });
});

describe("the empty transaction table", () => {
  it("says it with attitude, and plainly when the switch is off", () => {
    render(<TransactionsView />);
    expect(screen.getByText("tx.emptyLedgerEgg")).toBeTruthy();
    cleanup();

    load(portfolio([], false));
    render(<TransactionsView />);
    expect(screen.getByText("tx.emptyLedger")).toBeTruthy();
    expect(screen.queryByText("tx.emptyLedgerEgg")).toBeNull();
  });
});

describe("the first whole coin", () => {
  it("celebrates the crossing once and remembers it in the file", () => {
    load(portfolio([tx({ id: "b1", type: "buy", amountBtc: "0.6" })]));
    const { rerender } = render(<Celebration />);
    expect(screen.queryByText("celebration.wholecoinerTitle")).toBeNull();

    // The buy that takes the holding over one coin.
    useAppStore.getState().addTransaction("a1", tx({ id: "b2", type: "buy", amountBtc: "0.5" }));
    rerender(<Celebration />);

    expect(screen.getByText("celebration.wholecoinerTitle")).toBeTruthy();
    expect(
      useAppStore.getState().portfolio!.uiSettings?.wholecoinerCelebrated,
    ).toBe(true);
  });

  it("stays quiet for a portfolio that was already there when it was opened", () => {
    load(portfolio([tx({ id: "b1", type: "buy", amountBtc: "2" })]));
    render(<Celebration />);

    expect(screen.queryByText("celebration.wholecoinerTitle")).toBeNull();
    // …but the moment is recorded, so it cannot fire later either.
    expect(
      useAppStore.getState().portfolio!.uiSettings?.wholecoinerCelebrated,
    ).toBe(true);
  });

  it("does not celebrate with the switch off", () => {
    const p = portfolio([tx({ id: "b1", type: "buy", amountBtc: "0.6" })], false);
    load(p);
    const { rerender } = render(<Celebration />);
    useAppStore.getState().addTransaction("a1", tx({ id: "b2", type: "buy", amountBtc: "0.5" }));
    rerender(<Celebration />);

    expect(screen.queryByText("celebration.wholecoinerTitle")).toBeNull();
  });
});

describe("the settings", () => {
  it("offers the master switch and hides laser eyes until they are unlocked", () => {
    render(<SettingsView />);
    expect(screen.getByLabelText("settings.easterEggs")).toBeTruthy();
    expect(screen.queryByLabelText("settings.laserEyes")).toBeNull();

    const p = portfolio();
    p.uiSettings = { laserEyes: true };
    load(p);
    cleanup();
    render(<SettingsView />);
    expect(screen.getByLabelText("settings.laserEyes")).toBeTruthy();
  });

  it("switches every touch off from one place", () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByLabelText("settings.easterEggs"));
    expect(useAppStore.getState().portfolio!.settings.easterEggs).toBe(false);
  });

  it("offers BTC as a display unit next to the fiat currencies", () => {
    render(<SettingsView />);
    const select = screen.getByLabelText("settings.currency") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["EUR", "USD", "BTC"]);

    fireEvent.change(select, { target: { value: "BTC" } });
    expect(useAppStore.getState().portfolio!.settings.currencyDisplay).toBe("BTC");
  });
});

describe("laser eyes", () => {
  it("need 21 clicks, and say so when they arrive", async () => {
    const AppShell = (await import("./AppShell")).default;
    render(<AppShell />);
    const logo = screen.getAllByRole("button", { name: "app.name" })[0];

    for (let i = 0; i < LASER_EYES_CLICKS - 1; i++) fireEvent.click(logo);
    expect(useAppStore.getState().portfolio!.uiSettings?.laserEyes).toBeUndefined();

    fireEvent.click(logo);
    expect(useAppStore.getState().portfolio!.uiSettings?.laserEyes).toBe(true);
    expect(screen.getByText("easterEggs.laserEyesUnlocked")).toBeTruthy();
  });

  it("cannot be unlocked with the switch off", async () => {
    load(portfolio([], false));
    const AppShell = (await import("./AppShell")).default;
    render(<AppShell />);
    const logo = screen.getAllByRole("button", { name: "app.name" })[0];

    for (let i = 0; i < LASER_EYES_CLICKS + 5; i++) fireEvent.click(logo);
    expect(useAppStore.getState().portfolio!.uiSettings?.laserEyes).toBeUndefined();
  });
});

describe("the BTC display unit is a real feature, not a joke", () => {
  const withHolding = () => {
    const p = portfolio([tx({ id: "b1", type: "buy", amountBtc: "0.618" })]);
    p.settings.currencyDisplay = "BTC";
    return p;
  };

  it("shows amounts in whole sats in the transaction table", () => {
    load(withHolding());
    render(<TransactionsView />);

    expect(screen.getByText("61.800.000")).toBeTruthy();
    // The column says which unit that is.
    expect(
      screen.getAllByRole("columnheader").some((h) => h.textContent?.includes("tx.amountColumn")),
    ).toBe(true);
  });

  it("leaves the stored value and therefore the sorting untouched", () => {
    load(withHolding());
    render(<TransactionsView />);

    // A display unit may not touch the ledger.
    expect(
      useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions[0].amountBtc,
    ).toBe("0.618");
  });

  it("still works with the playful touches switched off", () => {
    const p = withHolding();
    p.settings.easterEggs = false;
    load(p);
    render(<TransactionsView />);

    expect(screen.getByText("61.800.000")).toBeTruthy();
  });
});
