/** @vitest-environment jsdom */
// The playful touches must never get in the way (CLAUDE.md §5.1), which mostly
// means: the file's switch really does switch all of them off, nothing appears
// on a day it does not belong to, and the settings never let on that any of
// this exists.

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
import ThemeEffect from "./ThemeEffect";

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
      name: "Exchange",
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
  it("never advertises that there are any", () => {
    // A row labelled "playful touches" gives away the whole game, so the
    // settings say nothing about them at all — including about laser eyes,
    // for as long as they are locked.
    render(<SettingsView />);
    expect(screen.queryByLabelText("settings.easterEggs")).toBeNull();
    expect(screen.queryByLabelText("settings.laserEyes")).toBeNull();
  });

  it("offers the laser eyes switch once they are unlocked", () => {
    // By then the user has seen them; an unexplained glow needs a way off.
    const p = portfolio();
    p.uiSettings = { laserEyes: true };
    load(p);
    // It lives in the appearance group now that the settings are grouped.
    render(<SettingsView initialSection="appearance" />);

    expect(screen.getByLabelText("settings.laserEyes")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("settings.laserEyes"));
    expect(useAppStore.getState().portfolio!.uiSettings?.laserEyes).toBe(false);
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

describe("appearance on the document", () => {
  /** matchMedia is not implemented in jsdom; the theme effect needs it. */
  function systemPrefers(dark: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-color-scheme: dark") ? dark : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-colorblind");
  });

  it("puts the chosen theme on <html>", () => {
    systemPrefers(true);
    useAppStore.getState().setAppearance({ mode: "fixed", theme: "terminal" });
    render(<ThemeEffect />);
    expect(document.documentElement.dataset.theme).toBe("terminal");
  });

  it("follows the system preference when asked to", () => {
    systemPrefers(false);
    useAppStore.getState().setAppearance({
      mode: "system",
      light: "paper",
      dark: "mono",
    });
    render(<ThemeEffect />);
    expect(document.documentElement.dataset.theme).toBe("paper");

    cleanup();
    systemPrefers(true);
    render(<ThemeEffect />);
    expect(document.documentElement.dataset.theme).toBe("mono");
  });

  it("marks the colour-vision option, which the stylesheet acts on", () => {
    systemPrefers(true);
    useAppStore.getState().setAppearance({ colorBlindSafe: true });
    render(<ThemeEffect />);
    expect(document.documentElement.dataset.colorblind).toBe("safe");
  });
});

describe("gain and loss are never colour alone", () => {
  it("marks the direction with an arrow", async () => {
    const { PnlValue } = await import("./ui");
    const { container } = render(
      <>
        <PnlValue value={5}>5 €</PnlValue>
        <PnlValue value={-5}>-5 €</PnlValue>
        <PnlValue value={0}>0 €</PnlValue>
      </>,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("▲");
    expect(text).toContain("▼");
    // The arrows are decoration; the value itself carries the meaning.
    expect(container.querySelectorAll("[aria-hidden]").length).toBe(3);
  });

  it("leaves the arrow out where the text already carries a sign", async () => {
    const { PnlValue } = await import("./ui");
    const { container } = render(
      <PnlValue value={5} showArrow={false}>
        +5 €
      </PnlValue>,
    );
    expect(container.textContent).toBe("+5 €");
  });
});
